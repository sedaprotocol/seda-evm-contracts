import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';

import type { Secp256k1ProverV1, SedaCoreV1 } from '../../typechain-types';
import { compareRequests, compareResults, convertPendingToRequestInputs } from '../helpers';
import {
  computeResultLeafHash,
  computeValidatorLeafHash,
  deriveBatchId,
  deriveDataResultId,
  deriveRequestId,
  generateDataFixtures,
} from '../utils';

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

    // Modify results to have different gas used
    results[1].gasUsed = 500000; // 1/4 of the gas limit
    results[4].gasUsed = 0;
    results[4].paybackAddress = '0x0123456789012345678901234567890123456789';
    results[5].paybackAddress = '0x0123456789012345678901234567890123456789';
    results[5].gasUsed = BigInt(requests[5].execGasLimit) + BigInt(requests[5].tallyGasLimit);

    const leaves = results.map(deriveDataResultId).map(computeResultLeafHash);

    // Create merkle tree and proofs
    const resultsTree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
    const proofs = results.map((_, index) => resultsTree.getProof(index));

    // Create 2 validators
    const wallets = Array.from({ length: 2 }, (_, i) => {
      const seed = ethers.id(`validator${i}`);
      return new ethers.Wallet(seed.slice(2, 66));
    });

    const validators = wallets.map((wallet) => wallet.address);
    const votingPowers = Array(wallets.length).fill(10_000_000);
    votingPowers[0] = 90_000_000; // 90% voting power

    const validatorLeaves = validators.map((validator, index) =>
      computeValidatorLeafHash(validator, votingPowers[index]),
    );

    // Validators: Create merkle tree and proofs
    const validatorsTree = SimpleMerkleTree.of(validatorLeaves, {
      sortLeaves: true,
    });
    const validatorProofs = validators.map((signer, index) => {
      const proof = validatorsTree.getProof(index);
      return {
        signer,
        votingPower: votingPowers[index],
        merkleProof: proof,
      };
    });

    const initialBatch = {
      batchHeight: 0,
      blockHeight: 0,
      validatorsRoot: validatorsTree.root,
      resultsRoot: resultsTree.root,
      provingMetadata: ethers.ZeroHash,
    };

    const ProverFactory = await ethers.getContractFactory('Secp256k1ProverV1');
    const prover = await upgrades.deployProxy(ProverFactory, [initialBatch], {
      initializer: 'initialize',
    });
    await prover.waitForDeployment();

    const CoreFactory = await ethers.getContractFactory('SedaCoreV1');
    const core = await upgrades.deployProxy(CoreFactory, [await prover.getAddress()], { initializer: 'initialize' });
    await core.waitForDeployment();

    const data = { requests, results, proofs, wallets, initialBatch, validatorProofs };

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
      compareRequests(requests[0].request, data.requests[0]);

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
        compareRequests(allRequests[i].request, data.requests[i]);
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
      let pending = (await core.getPendingRequests(0, 10)).map(convertPendingToRequestInputs);
      expect(pending.length).to.equal(5);
      expect(pending).to.deep.include.members(requests);

      // Post results for first and third requests
      await core.postResult(data.results[0], 0, data.proofs[0]);
      await core.postResult(data.results[2], 0, data.proofs[2]);

      // Expected remaining pending requests
      const expectedPending = [requests[1], requests[3], requests[4]];

      // Retrieve pending requests (order is not preserved because there were 2 removals)
      pending = (await core.getPendingRequests(0, 10)).map(convertPendingToRequestInputs);
      expect(pending.length).to.equal(3);
      expect(pending).to.deep.include.members(expectedPending);

      // Post another result
      await core.postResult(data.results[4], 0, data.proofs[4]);

      // Expected remaining pending requests
      const finalPending = [requests[1], requests[3]];

      // Retrieve final pending requests
      pending = (await core.getPendingRequests(0, 10)).map(convertPendingToRequestInputs);
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
      compareRequests(pendingRequests[0].request, data.requests[0]);
      compareRequests(pendingRequests[1].request, data.requests[1]);
    });
  });

  describe('fee management', () => {
    describe('basic fee scenarios', () => {
      it('should enforce exact fee payment', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const fees = {
          request: ethers.parseEther('1.0'),
          result: ethers.parseEther('2.0'),
          batch: ethers.parseEther('3.0'),
        };
        const totalFee = fees.request + fees.result + fees.batch;

        await expect(
          core.postRequest(data.requests[0], fees.request, fees.result, fees.batch, {
            value: totalFee - ethers.parseEther('0.5'),
          }),
        ).to.be.revertedWithCustomError(core, 'InvalidFeeAmount');

        await expect(core.postRequest(data.requests[0], fees.request, fees.result, fees.batch, { value: totalFee })).to
          .not.be.reverted;
      });

      it('should distribute request fees based on gas used', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const requestFee = ethers.parseEther('10');
        const [requestor] = await ethers.getSigners();
        const paybackAddress = data.results[1].paybackAddress;

        await core.postRequest(data.requests[1], requestFee, 0, 0, { value: requestFee });

        const totalGas = BigInt(data.requests[1].execGasLimit) + BigInt(data.requests[1].tallyGasLimit);
        const expectedPayback = (requestFee * BigInt(data.results[1].gasUsed)) / totalGas;
        const expectedRefund = requestFee - expectedPayback;

        await expect(core.postResult(data.results[1], 0, data.proofs[1]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, paybackAddress, expectedPayback, 0)
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, requestor.address, expectedRefund, 3);
      });

      it('should pay result fees to result submitter', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const resultFee = ethers.parseEther('2.0');
        const [, resultSubmitter] = await ethers.getSigners();

        await core.postRequest(data.requests[0], 0, resultFee, 0, { value: resultFee });

        await expect((core.connect(resultSubmitter) as SedaCoreV1).postResult(data.results[0], 0, data.proofs[0]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[0].drId, resultSubmitter.address, resultFee, 1);
      });

      it('should pay batch fees to batch submitter', async () => {
        const { core, prover, data } = await loadFixture(deployCoreFixture);
        const batchFee = ethers.parseEther('3.0');
        const [, batchSender] = await ethers.getSigners();

        await core.postRequest(data.requests[0], 0, 0, batchFee, { value: batchFee });

        const batch = { ...data.initialBatch, batchHeight: 1 };
        const signatures = [await data.wallets[0].signingKey.sign(deriveBatchId(batch)).serialized];
        await (prover.connect(batchSender) as Secp256k1ProverV1).postBatch(batch, signatures, [
          data.validatorProofs[0],
        ]);

        await expect(core.postResult(data.results[0], 1, data.proofs[0]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[0].drId, batchSender.address, batchFee, 2);
      });

      it('should refund batch fee if no batch is used', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const batchFee = ethers.parseEther('3.0');
        const [requestor] = await ethers.getSigners();

        await core.postRequest(data.requests[0], 0, 0, batchFee, { value: batchFee });

        await expect(core.postResult(data.results[0], 0, data.proofs[0]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[0].drId, requestor.address, batchFee, 3);
      });
    });

    describe('edge cases', () => {
      it('should handle invalid payback addresses', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const requestFee = ethers.parseEther('1.0');
        const [requestor] = await ethers.getSigners();

        // Test zero address
        await core.postRequest(data.requests[0], requestFee, 0, 0, { value: requestFee });
        await expect(core.postResult(data.results[0], 0, data.proofs[0]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[0].drId, requestor.address, requestFee, 3);
      });

      it('should handle zero fees gracefully', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        await core.postRequest(data.requests[0], 0, 0, 0, { value: 0 });
        await expect(core.postResult(data.results[0], 0, data.proofs[0])).to.not.be.reverted;
      });
    });

    describe('comprehensive fee scenarios', () => {
      it('should handle all fee types in a single transaction', async () => {
        const { core, prover, data } = await loadFixture(deployCoreFixture);
        const [requestor, resultSubmitter, batchSubmitter] = await ethers.getSigners();

        // Set up fees
        const fees = {
          request: ethers.parseEther('1.0'),
          result: ethers.parseEther('2.0'),
          batch: ethers.parseEther('3.0'),
        };
        const totalFee = fees.request + fees.result + fees.batch;

        // Record initial balances
        const initialBalances = {
          requestor: await ethers.provider.getBalance(requestor.address),
          resultSubmitter: await ethers.provider.getBalance(resultSubmitter.address),
          batchSubmitter: await ethers.provider.getBalance(batchSubmitter.address),
          payback: await ethers.provider.getBalance(data.results[1].paybackAddress.toString()),
        };

        // Post request with all fees
        await core.postRequest(data.requests[1], fees.request, fees.result, fees.batch, { value: totalFee });

        // Submit batch
        const batch = { ...data.initialBatch, batchHeight: 1 };
        const signatures = [await data.wallets[0].signingKey.sign(deriveBatchId(batch)).serialized];
        await (prover.connect(batchSubmitter) as Secp256k1ProverV1).postBatch(batch, signatures, [
          data.validatorProofs[0],
        ]);

        // Calculate expected request fee distribution
        const totalGas = BigInt(data.requests[1].execGasLimit) + BigInt(data.requests[1].tallyGasLimit);
        const expectedPayback = (fees.request * BigInt(data.results[1].gasUsed)) / totalGas;
        const expectedRefund = fees.request - expectedPayback;

        // Submit result and verify all fee distributions
        await expect((core.connect(resultSubmitter) as SedaCoreV1).postResult(data.results[1], 1, data.proofs[1]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, data.results[1].paybackAddress, expectedPayback, 0) // Request fee to executor
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, resultSubmitter.address, fees.result, 1) // Result fee to result submitter
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, batchSubmitter.address, fees.batch, 2) // Batch fee to batch submitter
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, requestor.address, expectedRefund, 3); // Remaining request fee refund

        // Verify final balances (accounting for gas costs with approximate checks)
        const finalBalances = {
          requestor: await ethers.provider.getBalance(requestor.address),
          resultSubmitter: await ethers.provider.getBalance(resultSubmitter.address),
          batchSubmitter: await ethers.provider.getBalance(batchSubmitter.address),
          payback: await ethers.provider.getBalance(data.results[1].paybackAddress.toString()),
        };

        expect(finalBalances.payback - initialBalances.payback).to.equal(expectedPayback);
        expect(finalBalances.resultSubmitter - initialBalances.resultSubmitter).to.be.closeTo(
          fees.result,
          ethers.parseEther('0.01'), // Allow for gas costs
        );
        expect(finalBalances.batchSubmitter - initialBalances.batchSubmitter).to.be.closeTo(
          fees.batch,
          ethers.parseEther('0.01'), // Allow for gas costs
        );
        expect(initialBalances.requestor - finalBalances.requestor).to.be.closeTo(
          totalFee - expectedRefund,
          ethers.parseEther('0.01'), // Allow for gas costs
        );
      });
    });

    describe('payback address handling', () => {
      it('should handle non-standard payback address lengths', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const requestFee = ethers.parseEther('1.0');
        const [requestor] = await ethers.getSigners();

        // Test short payback address (10 bytes)
        await core.postRequest(data.requests[3], requestFee, 0, 0, { value: requestFee });
        await expect(core.postResult(data.results[3], 0, data.proofs[3]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[3].drId, requestor.address, requestFee, 3);

        // Test long payback address (40 bytes)
        await core.postRequest(data.requests[2], requestFee, 0, 0, { value: requestFee });
        await expect(core.postResult(data.results[2], 0, data.proofs[2]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[2].drId, requestor.address, requestFee, 3);
      });
    });

    describe('gas usage edge cases', () => {
      it('should handle zero gas usage', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const requestFee = ethers.parseEther('1.0');
        const [requestor] = await ethers.getSigners();

        await core.postRequest(data.requests[4], requestFee, 0, 0, { value: requestFee });
        await expect(core.postResult(data.results[4], 0, data.proofs[4]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[4].drId, requestor.address, requestFee, 3);
      });

      it('should handle gas usage equal to limit', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const [, resultSolver] = await ethers.getSigners();
        const requestFee = ethers.parseEther('1.0');
        const resultFee = ethers.parseEther('1.0');

        await core.postRequest(data.requests[5], requestFee, resultFee, 0, { value: requestFee + resultFee });
        await expect((core.connect(resultSolver) as SedaCoreV1).postResult(data.results[5], 0, data.proofs[5]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[5].drId, data.results[5].paybackAddress, requestFee, 0)
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[5].drId, resultSolver.address, resultFee, 1);
      });
    });

    describe('fee increase', () => {
      it('should allow increasing fees for pending requests', async () => {
        const { prover, core, data } = await loadFixture(deployCoreFixture);
        const fees = {
          request: ethers.parseEther('1.0'),
          result: ethers.parseEther('2.0'),
          batch: ethers.parseEther('3.0'),
        };
        const totalFee = fees.request + fees.result + fees.batch;
        const additionalFees = {
          request: ethers.parseEther('0.5'),
          result: ethers.parseEther('1.0'),
          batch: ethers.parseEther('1.5'),
        };
        const totalAdditionalFee = additionalFees.request + additionalFees.result + additionalFees.batch;
        const [requestor, resultSubmitter, batchSubmitter] = await ethers.getSigners();

        // Post request with all fees
        await core.postRequest(data.requests[1], fees.request, fees.result, fees.batch, { value: totalFee });

        // Increase fees
        await core.increaseFees(
          data.results[1].drId,
          additionalFees.request,
          additionalFees.result,
          additionalFees.batch,
          { value: totalAdditionalFee },
        );

        // Submit batch
        const batch = { ...data.initialBatch, batchHeight: 1 };
        const signatures = [await data.wallets[0].signingKey.sign(deriveBatchId(batch)).serialized];
        await (prover.connect(batchSubmitter) as Secp256k1ProverV1).postBatch(batch, signatures, [
          data.validatorProofs[0],
        ]);

        // Calculate expected request fee distribution
        const totalGas = BigInt(data.requests[1].execGasLimit) + BigInt(data.requests[1].tallyGasLimit);
        const expectedPayback = ((fees.request + additionalFees.request) * BigInt(data.results[1].gasUsed)) / totalGas;
        const expectedRefund = fees.request + additionalFees.request - expectedPayback;

        // Submit result and verify all fee distributions
        await expect((core.connect(resultSubmitter) as SedaCoreV1).postResult(data.results[1], 1, data.proofs[1]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, data.results[1].paybackAddress, expectedPayback, 0) // Request fee to executor
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, resultSubmitter.address, fees.result + additionalFees.result, 1) // Result fee to result submitter
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, batchSubmitter.address, fees.batch + additionalFees.batch, 2) // Batch fee to batch submitter
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[1].drId, requestor.address, expectedRefund, 3); // Remaining request fee refund
      });

      it('should reject fee increase for non-existent request', async () => {
        const { core } = await loadFixture(deployCoreFixture);
        const nonExistentRequestId = ethers.randomBytes(32);

        await expect(
          core.increaseFees(
            nonExistentRequestId,
            ethers.parseEther('1.0'),
            ethers.parseEther('1.0'),
            ethers.parseEther('1.0'),
            { value: ethers.parseEther('3.0') },
          ),
        ).to.be.revertedWithCustomError(core, 'RequestNotFound');
      });

      it('should reject fee increase with incorrect payment amount', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);

        // First post a request
        await core.postRequest(data.requests[0], 0, 0, 0);
        const requestId = await deriveRequestId(data.requests[0]);

        // Try to increase fees with incorrect amount
        await expect(
          core.increaseFees(
            requestId,
            ethers.parseEther('1.0'),
            ethers.parseEther('1.0'),
            ethers.parseEther('1.0'),
            { value: ethers.parseEther('2.0') }, // Sending less than total additional fees
          ),
        ).to.be.revertedWithCustomError(core, 'InvalidFeeAmount');
      });
    });
  });

  describe('pause functionality', () => {
    it('should allow owner to pause and unpause', async () => {
      const { core } = await loadFixture(deployCoreFixture);
      const [owner] = await ethers.getSigners();

      expect(await core.paused()).to.be.false;

      await expect((core.connect(owner) as SedaCoreV1).pause())
        .to.emit(core, 'Paused')
        .withArgs(owner.address);

      expect(await core.paused()).to.be.true;

      await expect((core.connect(owner) as SedaCoreV1).unpause())
        .to.emit(core, 'Unpaused')
        .withArgs(owner.address);

      expect(await core.paused()).to.be.false;
    });

    it('should prevent non-owner from pausing/unpausing', async () => {
      const { core } = await loadFixture(deployCoreFixture);
      const [, nonOwner] = await ethers.getSigners();

      await expect((core.connect(nonOwner) as SedaCoreV1).pause()).to.be.revertedWithCustomError(
        core,
        'OwnableUnauthorizedAccount',
      );

      await expect((core.connect(nonOwner) as SedaCoreV1).unpause()).to.be.revertedWithCustomError(
        core,
        'OwnableUnauthorizedAccount',
      );
    });

    it('should prevent operations while paused', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      const [owner] = await ethers.getSigners();

      // Pause the contract
      await (core.connect(owner) as SedaCoreV1).pause();

      // Test postRequest
      await expect(core.postRequest(data.requests[0])).to.be.revertedWithCustomError(core, 'EnforcedPause');

      // Test postRequest with fees
      await expect(
        core.postRequest(data.requests[0], ethers.parseEther('1'), 0, 0, { value: ethers.parseEther('1') }),
      ).to.be.revertedWithCustomError(core, 'EnforcedPause');

      // Test postResult
      await expect(core.postResult(data.results[0], 0, data.proofs[0])).to.be.revertedWithCustomError(
        core,
        'EnforcedPause',
      );

      // Test increaseFees
      await expect(
        core.increaseFees(data.results[0].drId, ethers.parseEther('1'), 0, 0, { value: ethers.parseEther('1') }),
      ).to.be.revertedWithCustomError(core, 'EnforcedPause');
    });

    it('should revert getPendingRequests while paused', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      const [owner] = await ethers.getSigners();

      // Post some requests
      await core.postRequest(data.requests[0]);
      await core.postRequest(data.requests[1]);

      // Verify requests are visible
      let requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(2);

      // Pause the contract
      await (core.connect(owner) as SedaCoreV1).pause();

      // Verify getPendingRequests reverts while paused
      await expect(core.getPendingRequests(0, 10)).to.be.revertedWithCustomError(core, 'EnforcedPause');

      // Unpause and verify requests are visible again
      await (core.connect(owner) as SedaCoreV1).unpause();
      requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(2);
    });

    it('should resume operations after unpausing', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      const [owner] = await ethers.getSigners();

      // Pause the contract
      await (core.connect(owner) as SedaCoreV1).pause();

      // Unpause the contract
      await (core.connect(owner) as SedaCoreV1).unpause();

      // Should now be able to perform operations
      await expect(core.postRequest(data.requests[0]))
        .to.emit(core, 'RequestPosted')
        .withArgs(await deriveRequestId(data.requests[0]));

      await expect(core.postResult(data.results[0], 0, data.proofs[0])).to.emit(core, 'ResultPosted');

      // Verify the request was removed after posting result
      const requests = await (core.connect(owner) as SedaCoreV1).getPendingRequests(0, 10);
      expect(requests.length).to.equal(0);
    });
  });
});
