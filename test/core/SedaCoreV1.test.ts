import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';

import { compareRequests, compareResults, convertToRequestInputs } from '../helpers';
import { computeResultLeafHash, deriveDataResultId, deriveRequestId, generateDataFixtures } from '../utils';

describe('SedaCoreV1', () => {
  async function deployCoreFixture() {
    // Generate test fixtures
    const { requests, results } = generateDataFixtures(10);

    // Modify the last result's timestamp to be 1 second (1 unix timestamp)
    // This simulates an invalid result with a timestamp from 1970-01-01T00:00:01Z
    results[results.length - 1].blockTimestamp = 1;

    // Modify results to have:
    // - a zero payback address
    // - a non-zero payback address
    // - a longer non-EVM-compatible payback address (40 bytes)
    // - a shorter non-EVM-compatible payback address (10 bytes)
    results[0].paybackAddress = ethers.ZeroAddress;
    results[1].paybackAddress = '0x0123456789012345678901234567890123456789';
    results[2].paybackAddress = '0x01234567890123456789012345678901234567890123456789012345678901234567890123456789';
    results[3].paybackAddress = '0x01234567890123456789';

    // Modify results to have different gas used to 1/4 of the gas limit
    results[1].gasUsed = 500000;

    const leaves = results.map(deriveDataResultId).map(computeResultLeafHash);

    // Create merkle tree and proofs
    const tree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
    const proofs = results.map((_, index) => tree.getProof(index));

    const data = { requests, results, proofs };

    const initialBatch = {
      batchHeight: 0,
      blockHeight: 0,
      validatorsRoot: ethers.ZeroHash,
      resultsRoot: tree.root,
      provingMetadata: ethers.ZeroHash,
    };

    const ProverFactory = await ethers.getContractFactory('Secp256k1ProverV1');
    const prover = await upgrades.deployProxy(ProverFactory, [initialBatch], { initializer: 'initialize' });
    await prover.waitForDeployment();

    const CoreFactory = await ethers.getContractFactory('SedaCoreV1');
    const core = await upgrades.deployProxy(CoreFactory, [await prover.getAddress()], { initializer: 'initialize' });
    await core.waitForDeployment();

    return { prover, core, data };
  }

  describe('getPendingRequests', () => {
    it('should return correct requests with pagination', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const requests1 = await core.getPendingRequests(0, 2);
      const requests2 = await core.getPendingRequests(2, 2);

      expect(requests1.length).to.equal(2);
      expect(requests2.length).to.equal(2);
      expect(requests1[0]).to.not.equal(requests2[0]);
      expect(requests1[1]).to.not.equal(requests2[1]);
    });

    it('should return zero requests if offset > length', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const requests = await core.getPendingRequests(10, 2);
      expect(requests.length).to.equal(0);
    });
  });

  describe('postResult', () => {
    it('should allow posting a result without a prior request', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Attempt to post a result without a corresponding request
      await expect(core.postResult(data.results[0], 0, data.proofs[0])).to.not.be.reverted;

      // Verify that the result was posted
      const postedResult = await core.getResult(data.results[0].drId);
      compareResults(postedResult, data.results[0]);

      // Verify that no request is in the pending list
      const requests = await core.getPendingRequests(0, 1);
      expect(requests.length).to.equal(0);
    });

    it('should post a request and then post its result', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      await core.postRequest(data.requests[0]);
      let requests = await core.getPendingRequests(0, 1);
      expect(requests.length).to.equal(1);
      compareRequests(requests[0], data.requests[0]);

      await core.postResult(data.results[0], 0, data.proofs[0]);
      requests = await core.getPendingRequests(0, 1);
      expect(requests.length).to.equal(0);

      const postedResult = await core.getResult(data.results[0].drId);
      compareResults(postedResult, data.results[0]);
    });

    it('should handle multiple requests and results correctly', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      let requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(data.requests.length);

      for (let i = 0; i < data.results.length / 2; i++) {
        await core.postResult(data.results[i], 0, data.proofs[i]);
      }

      requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(data.requests.length / 2);

      for (let i = 0; i < data.results.length / 2; i++) {
        const postedResult = await core.getResult(data.results[i].drId);
        compareResults(postedResult, data.results[i]);
      }
    });

    it('should reject results with invalid timestamps', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      const requestIndex = data.results.length - 1;
      await core.postRequest(data.requests[requestIndex]);

      // Try to post the last result which has an invalid timestamp of 1
      await expect(
        core.postResult(data.results[requestIndex], 0, data.proofs[requestIndex]),
      ).to.be.revertedWithCustomError(core, 'InvalidResultTimestamp');
    });
  });

  describe('request management', () => {
    it('should maintain correct order of requests (no removals)', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const allRequests = await core.getPendingRequests(0, data.requests.length);
      for (let i = 0; i < data.requests.length; i++) {
        compareRequests(allRequests[i], data.requests[i]);
      }
    });

    it('should handle edge cases in getPendingRequests', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests.slice(0, 5)) {
        await core.postRequest(request);
      }

      const requests1 = await core.getPendingRequests(0, 10);
      const requests2 = await core.getPendingRequests(4, 2);
      const requests3 = await core.getPendingRequests(5, 1);

      expect(requests1.length).to.equal(5);
      expect(requests2.length).to.equal(1);
      expect(requests3.length).to.equal(0);
    });

    it('should not add duplicate requests', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      let requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(0);

      const pr1 = await core.postRequest(data.requests[0]);

      await expect(core.postRequest(data.requests[0])).to.be.revertedWithCustomError(core, 'RequestAlreadyExists');

      expect(pr1)
        .to.emit(core, 'RequestPosted')
        .withArgs(await deriveRequestId(data.requests[0]));

      requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(1);
    });

    it('should efficiently remove requests from the middle', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests.slice(0, 5)) {
        await core.postRequest(request);
      }

      const gasUsed = await core.postResult.estimateGas(data.results[2], 0, data.proofs[2]);

      // This is rough esimate
      expect(gasUsed).to.be.lessThan(500000);
    });

    it('should maintain pending requests (with removals)', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Post 5 requests
      const requests = data.requests.slice(0, 5);
      // const requestIds = [];
      for (const request of requests) {
        // const requestId = await core.postRequest.staticCall(request);
        await core.postRequest(request);
        // requestIds.push(requestId);
      }

      // Verify that all requests are pending
      // (order should be preserved because there are no removals)
      let pending = (await core.getPendingRequests(0, 10)).map(convertToRequestInputs);
      expect(pending.length).to.equal(5);
      expect(pending).to.deep.include.members(requests);

      // Post results for first and third requests
      await core.postResult(data.results[0], 0, data.proofs[0]);
      await core.postResult(data.results[2], 0, data.proofs[2]);

      // Expected remaining pending requests
      const expectedPending = [requests[1], requests[3], requests[4]];

      // Retrieve pending requests (order is not preserved because there were 2 removals)
      pending = (await core.getPendingRequests(0, 10)).map(convertToRequestInputs);
      expect(pending.length).to.equal(3);
      expect(pending).to.deep.include.members(expectedPending);

      // Post another result
      await core.postResult(data.results[4], 0, data.proofs[4]);

      // Expected remaining pending requests
      const finalPending = [requests[1], requests[3]];

      // Retrieve final pending requests
      pending = (await core.getPendingRequests(0, 10)).map(convertToRequestInputs);
      expect(pending.length).to.equal(2);
      expect(pending).to.deep.include.members(finalPending);
    });

    it('should correctly handle removing the last request', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Post several requests
      for (let i = 0; i < 3; i++) {
        await core.postRequest(data.requests[i]);
      }

      // Verify that all requests are pending
      let pendingRequests = await core.getPendingRequests(0, 3);
      expect(pendingRequests.length).to.equal(3);

      // Post the result for the last request
      await core.postResult(data.results[2], 0, data.proofs[2]);

      // Verify that the last request has been removed
      pendingRequests = await core.getPendingRequests(0, 3);
      expect(pendingRequests.length).to.equal(2);
      expect(pendingRequests).to.not.include(data.requests[2]);

      // Verify the remaining requests are still in order
      compareRequests(pendingRequests[0], data.requests[0]);
      compareRequests(pendingRequests[1], data.requests[1]);
    });
  });

  describe('fee management', () => {
    describe('request fee handling', () => {
      it('should enforce correct fee payment', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const requestFee = ethers.parseEther('1.0');
        const resultFee = ethers.parseEther('2.0');
        const batchFee = ethers.parseEther('3.0');
        const totalFee = requestFee + resultFee + batchFee;

        // Should fail with insufficient fee
        await expect(
          core.postRequest(data.requests[0], requestFee, resultFee, batchFee, {
            value: totalFee - ethers.parseEther('0.5'),
          }),
        ).to.be.revertedWithCustomError(core, 'InvalidFeeAmount');

        // Should fail with excess fee
        await expect(
          core.postRequest(data.requests[0], requestFee, resultFee, batchFee, {
            value: totalFee + ethers.parseEther('0.5'),
          }),
        ).to.be.revertedWithCustomError(core, 'InvalidFeeAmount');

        // Should succeed with exact fee
        await expect(core.postRequest(data.requests[0], requestFee, resultFee, batchFee, { value: totalFee })).to.not.be
          .reverted;
      });

      it('should handle request fee distribution correctly', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const requestFee = ethers.parseEther('10');
        const [requestor] = await ethers.getSigners();
        const validPaybackAddress = data.results[1].paybackAddress;

        // Setup: Post request with fee
        const requestorBalanceBefore = await ethers.provider.getBalance(requestor.address);
        await core.postRequest(data.requests[1], requestFee, 0, 0, { value: requestFee });

        // Verify request fee was deducted
        const requestorBalanceAfterRequest = await ethers.provider.getBalance(requestor.address);
        expect(requestorBalanceBefore - requestorBalanceAfterRequest).closeTo(requestFee, ethers.parseEther('0.01'));

        // Submit result and verify fee distribution
        const paybackBalanceBefore = await ethers.provider.getBalance(validPaybackAddress.toString());
        await core.postResult(data.results[1], 0, data.proofs[1]);
        const paybackBalanceAfter = await ethers.provider.getBalance(validPaybackAddress.toString());
        const requestorBalanceAfterResult = await ethers.provider.getBalance(requestor.address);

        // Calculate expected fee distribution
        const totalGasLimit = BigInt(data.requests[1].execGasLimit) + BigInt(data.requests[1].tallyGasLimit);
        const expectedPaybackFee = (requestFee * BigInt(data.results[1].gasUsed)) / totalGasLimit;
        const expectedRefund = requestFee - expectedPaybackFee;

        // Verify payback address received correct amount
        expect(paybackBalanceAfter - paybackBalanceBefore).to.equal(expectedPaybackFee);

        // Verify requestor received correct refund
        expect(requestorBalanceAfterResult - requestorBalanceAfterRequest).closeTo(
          expectedRefund,
          ethers.parseEther('0.01'),
        );
      });

      it('should handle invalid payback addresses', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const requestFee = ethers.parseEther('1.0');
        const [requestor] = await ethers.getSigners();

        // Test cases: Zero address, oversized address, undersized address
        const testCases = [0, 2, 3]; // Indices of results with different payback addresses

        for (const i of testCases) {
          const initialBalance = await ethers.provider.getBalance(requestor.address);

          await core.postRequest(data.requests[i], requestFee, 0, 0, { value: requestFee });
          await core.postResult(data.results[i], 0, data.proofs[i]);

          // Full refund should be given for invalid addresses
          const finalBalance = await ethers.provider.getBalance(requestor.address);
          expect(initialBalance - finalBalance).closeTo(0, ethers.parseEther('0.01'));
        }
      });

      it('should handle zero request fees', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const [requestor] = await ethers.getSigners();
        const validPaybackAddress = data.results[1].paybackAddress;

        // Post request with zero fee
        const requestorBalanceBefore = await ethers.provider.getBalance(requestor.address);
        await core.postRequest(data.requests[1], 0, 0, 0, { value: 0 });

        const requestorBalanceAfterRequest = await ethers.provider.getBalance(requestor.address);
        expect(requestorBalanceBefore - requestorBalanceAfterRequest).to.be.lessThan(ethers.parseEther('0.01'));

        // Submit result and verify no fee transfers occurred
        const paybackBalanceBefore = await ethers.provider.getBalance(validPaybackAddress.toString());
        await core.postResult(data.results[1], 0, data.proofs[1]);
        const paybackBalanceAfter = await ethers.provider.getBalance(validPaybackAddress.toString());

        // Verify no fees were transferred
        expect(paybackBalanceAfter).to.equal(paybackBalanceBefore);
      });
    });

    describe('result fee handling', () => {
      it('should distribute result fees correctly', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const [, resultSubmitter] = await ethers.getSigners();

        // Post multiple requests with different result fees
        const requests = [
          { index: 0, fee: ethers.parseEther('1.0') },
          { index: 1, fee: ethers.parseEther('2.0') },
          { index: 2, fee: ethers.parseEther('3.0') },
        ];

        for (const req of requests) {
          await core.postRequest(data.requests[req.index], 0, req.fee, 0, { value: req.fee });
        }

        // Submit results and verify fee distribution
        for (const req of requests) {
          const balanceBefore = await ethers.provider.getBalance(resultSubmitter.address);

          await core.connect(resultSubmitter).postResult(data.results[req.index], 0, data.proofs[req.index]);

          const balanceAfter = await ethers.provider.getBalance(resultSubmitter.address);

          // Verify result submitter received the correct fee (accounting for gas)
          expect(balanceAfter - balanceBefore).to.be.closeTo(req.fee, ethers.parseEther('0.01'));
        }
      });

      it('should handle zero result fees', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const [, resultSubmitter] = await ethers.getSigners();

        // Post request with no result fee
        await core.postRequest(data.requests[0], 0, 0, 0, { value: 0 });

        const balanceBefore = await ethers.provider.getBalance(resultSubmitter.address);

        // Submit result
        await core.connect(resultSubmitter).postResult(data.results[0], 0, data.proofs[0]);

        const balanceAfter = await ethers.provider.getBalance(resultSubmitter.address);

        // Only gas should have been spent
        expect(balanceAfter).to.be.lessThan(balanceBefore);
        expect(balanceBefore - balanceAfter).to.be.lessThan(ethers.parseEther('0.01'));
      });
    });

    describe('combined fee scenarios', () => {
      it('should handle concurrent result fees and request fees', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const [requestor, resultSubmitter] = await ethers.getSigners();
        const requestFee = ethers.parseEther('10');
        const resultFee = ethers.parseEther('20');
        const validPaybackAddress = data.results[1].paybackAddress;

        // Post request with both request and result fees
        await core.postRequest(data.requests[1], requestFee, resultFee, 0, { value: requestFee + resultFee });

        const requestorBalanceAfterRequest = await ethers.provider.getBalance(requestor.address);
        const submitterBalanceBefore = await ethers.provider.getBalance(resultSubmitter.address);
        const paybackBalanceBefore = await ethers.provider.getBalance(validPaybackAddress.toString());

        // Submit result
        await core.connect(resultSubmitter).postResult(data.results[1], 0, data.proofs[1]);

        // Verify both fees were distributed correctly
        const submitterBalanceAfter = await ethers.provider.getBalance(resultSubmitter.address);
        const paybackBalanceAfter = await ethers.provider.getBalance(validPaybackAddress.toString());
        const requestorBalanceAfterResult = await ethers.provider.getBalance(requestor.address);

        // Calculate expected request fee distribution
        const totalGasLimit = BigInt(data.requests[1].execGasLimit) + BigInt(data.requests[1].tallyGasLimit);
        const expectedPaybackFee = (requestFee * BigInt(data.results[1].gasUsed)) / totalGasLimit;
        const expectedRefund = requestFee - expectedPaybackFee;

        // Result submitter should receive result fee
        expect(submitterBalanceAfter - submitterBalanceBefore).to.be.closeTo(resultFee, ethers.parseEther('0.01'));

        // Payback address should receive partial request fee based on gas used
        expect(paybackBalanceAfter - paybackBalanceBefore).to.equal(expectedPaybackFee);

        // Requestor should receive refund of unused request fee
        expect(requestorBalanceAfterResult - requestorBalanceAfterRequest).to.be.closeTo(
          expectedRefund,
          ethers.parseEther('0.01'),
        );
      });
    });
  });
});
