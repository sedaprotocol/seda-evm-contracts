import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';

import type { Secp256k1ProverV1, SedaCoreV1 } from '../../typechain-types';
import { compareRequests, compareResults } from '../helpers/assertions';
import { generateDataFixtures } from '../helpers/fixtures';
import { MAX_BATCH_AGE, ONE_DAY_IN_SECONDS } from '../utils/constants';
import {
  computeResultLeafHash,
  computeValidatorLeafHash,
  deriveBatchId,
  deriveRequestId,
  deriveResultId,
} from '../utils/crypto';

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

    const leaves = results.map(deriveResultId).map(computeResultLeafHash);

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

    const FeeManagerFactory = await ethers.getContractFactory('SedaFeeManager');
    const feeManager = await FeeManagerFactory.deploy();
    await feeManager.waitForDeployment();
    const feeManagerAddress = await feeManager.getAddress();

    const ProverFactory = await ethers.getContractFactory('Secp256k1ProverV1');
    const prover = await upgrades.deployProxy(ProverFactory, [initialBatch, MAX_BATCH_AGE, feeManagerAddress], {
      initializer: 'initialize',
    });
    await prover.waitForDeployment();

    const CoreFactory = await ethers.getContractFactory('SedaCoreV1');
    const core = await upgrades.deployProxy(CoreFactory, [await prover.getAddress(), ONE_DAY_IN_SECONDS], {
      initializer: 'initialize',
    });
    await core.waitForDeployment();

    const data = { requests, results, proofs, wallets, initialBatch, validatorProofs };

    return { prover, core, feeManager, data };
  }

  describe('postRequest', () => {
    it('allows duplicate request submissions but does not repost', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      let requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(0);

      const pr1 = await core.postRequest(data.requests[0]);
      expect(pr1)
        .to.emit(core, 'RequestPosted')
        .withArgs(await deriveRequestId(data.requests[0]));

      const pr2 = core.postRequest(data.requests[0]);

      expect(pr2).not.to.emit(core, 'RequestPosted');

      requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(1);
    });

    it('prevents reposting a request after its result is posted', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Post initial request
      await core.postRequest(data.requests[0]);

      // Post result for the request
      await core.postResult(data.results[0], 0, data.proofs[0]);

      // Attempt to repost the same request
      await expect(core.postRequest(data.requests[0])).to.be.revertedWithCustomError(core, 'RequestAlreadyResolved');

      // Verify no requests are pending
      const requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(0);
    });

    it('enforces exact fee payment', async () => {
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

    it('processes zero fees correctly', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      await core.postRequest(data.requests[0], 0, 0, 0, { value: 0 });
      await expect(core.postResult(data.results[0], 0, data.proofs[0])).to.not.be.reverted;
    });

    it('allows posting an already existing request with non-zero fees', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      await core.postRequest(data.requests[0], 0, 0, 0, { value: 0 });
      await expect(core.postRequest(data.requests[0], 1, 1, 1, { value: 3 })).to.not.be.reverted;
      await expect(core.postRequest(data.requests[0], 2, 2, 2, { value: 6 })).to.not.be.reverted;
    });
  });

  describe('postResult', () => {
    it('allows posting result without prior request', async () => {
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

    it('posts request and its result', async () => {
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

    it('handles multiple requests and results correctly', async () => {
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

    it('rejects results with invalid timestamps', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      const requestIndex = data.results.length - 1;
      await core.postRequest(data.requests[requestIndex]);

      // Try to post the last result which has an invalid timestamp of 1
      await expect(
        core.postResult(data.results[requestIndex], 0, data.proofs[requestIndex]),
      ).to.be.revertedWithCustomError(core, 'InvalidResultTimestamp');
    });

    it('rejects duplicate results', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Post initial request
      await core.postRequest(data.requests[0]);

      // Post first result - should succeed
      await core.postResult(data.results[0], 0, data.proofs[0]);

      // Attempt to post the same result again - should fail
      await expect(core.postResult(data.results[0], 0, data.proofs[0]))
        .to.be.revertedWithCustomError(core, 'ResultAlreadyExists')
        .withArgs(data.results[0].drId);
    });

    describe('fee distribution', () => {
      it('distributes request fees based on gas usage', async () => {
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

      it('pays result fees to result submitter', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const resultFee = ethers.parseEther('2.0');
        const [, resultSubmitter] = await ethers.getSigners();

        await core.postRequest(data.requests[0], 0, resultFee, 0, { value: resultFee });

        // Get fee manager contract directly from core
        const feeManagerAddress = await core.getFeeManager();
        const feeManagerContract = await ethers.getContractAt('SedaFeeManager', feeManagerAddress);

        // Record initial balance
        const initialBalance = await ethers.provider.getBalance(resultSubmitter.address);

        await expect((core.connect(resultSubmitter) as SedaCoreV1).postResult(data.results[0], 0, data.proofs[0]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[0].drId, resultSubmitter.address, resultFee, 1);

        // Withdraw fees before checking balance
        await feeManagerContract.connect(resultSubmitter).withdrawFees();

        // Verify balance increased by result fee (accounting for gas costs)
        const finalBalance = await ethers.provider.getBalance(resultSubmitter.address);
        expect(finalBalance - initialBalance).to.be.closeTo(resultFee, ethers.parseEther('0.01'));
      });

      it('pays batch fees to batch submitter', async () => {
        const { core, prover, data } = await loadFixture(deployCoreFixture);
        const batchFee = ethers.parseEther('3.0');
        const [, batchSender] = await ethers.getSigners();

        await core.postRequest(data.requests[0], 0, 0, batchFee, { value: batchFee });

        const batch = { ...data.initialBatch, batchHeight: 1 };
        const signatures = [await data.wallets[0].signingKey.sign(deriveBatchId(batch)).serialized];
        await (prover.connect(batchSender) as Secp256k1ProverV1).postBatch(batch, signatures, [
          data.validatorProofs[0],
        ]);

        // Verify the batch fee distribution event
        await expect(core.postResult(data.results[0], 1, data.proofs[0]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[0].drId, batchSender.address, batchFee, 2);

        // Get the fee manager contract directly from core
        const feeManagerAddress = await core.getFeeManager();
        const feeManagerContract = await ethers.getContractAt('SedaFeeManager', feeManagerAddress);

        // Get initial balance
        const initialBalance = await ethers.provider.getBalance(batchSender.address);

        // Withdraw fees and verify balance change
        await feeManagerContract.connect(batchSender).withdrawFees();

        // Verify balance increased by batch fee (accounting for gas costs)
        const finalBalance = await ethers.provider.getBalance(batchSender.address);
        expect(finalBalance - initialBalance).to.be.closeTo(batchFee, ethers.parseEther('0.01'));
      });

      it('refunds batch fee if no batch is used', async () => {
        const { core, data } = await loadFixture(deployCoreFixture);
        const batchFee = ethers.parseEther('3.0');
        const [requestor] = await ethers.getSigners();

        await core.postRequest(data.requests[0], 0, 0, batchFee, { value: batchFee });

        await expect(core.postResult(data.results[0], 0, data.proofs[0]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[0].drId, requestor.address, batchFee, 3);
      });

      it('refunds request fee if payback address is zero address', async () => {
        const { core, feeManager, data } = await loadFixture(deployCoreFixture);
        const [requestor] = await ethers.getSigners();

        await core.postRequest(data.requests[0], 1, 0, 0, { value: 1 });

        await expect(core.postResult(data.results[0], 0, data.proofs[0]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[0].drId, requestor.address, 1, 3);

        const pendingRequestorFees = await feeManager.getPendingFees(requestor.address);
        expect(pendingRequestorFees).to.equal(1);
      });

      it('refunds request fee if payback address is invalid (not 20 bytes)', async () => {
        const { core, feeManager, data } = await loadFixture(deployCoreFixture);
        const [requestor] = await ethers.getSigners();

        await core.postRequest(data.requests[3], 1, 0, 0, { value: 1 });

        await expect(core.postResult(data.results[3], 0, data.proofs[3]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[3].drId, requestor.address, 1, 3);

        const pendingRequestorFees = await feeManager.getPendingFees(requestor.address);
        expect(pendingRequestorFees).to.equal(1);
      });

      it('refunds request fee if gas used is zero', async () => {
        const { core, feeManager, data } = await loadFixture(deployCoreFixture);
        const [requestor] = await ethers.getSigners();

        await core.postRequest(data.requests[4], 1, 0, 0, { value: 1 });

        await expect(core.postResult(data.results[4], 0, data.proofs[4]))
          .to.emit(core, 'FeeDistributed')
          .withArgs(data.results[4].drId, requestor.address, 1, 3);

        const pendingRequestorFees = await feeManager.getPendingFees(requestor.address);
        expect(pendingRequestorFees).to.equal(1);
      });
    });
  });

  describe('getPendingRequests', () => {
    it('returns correct requests with pagination', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const requests1 = await core.getPendingRequests(0, 2);
      const requests2 = await core.getPendingRequests(2, 2);

      expect(requests1.length).to.equal(2);
      expect(requests2.length).to.equal(2);
      expect(requests1[0]).to.not.deep.equal(requests2[0]);
      expect(requests1[1]).to.not.deep.equal(requests2[1]);
    });

    it('returns zero requests if offset exceeds length', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const requests = await core.getPendingRequests(10, 2);
      expect(requests.length).to.equal(0);
    });

    it('maintains request order without removals', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const allRequests = await core.getPendingRequests(0, data.requests.length);
      for (let i = 0; i < data.requests.length; i++) {
        compareRequests(allRequests[i].request, data.requests[i]);
      }
    });

    it('handles pagination edge cases', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const requests1 = await core.getPendingRequests(0, 20);
      const requests2 = await core.getPendingRequests(9, 2);
      const requests3 = await core.getPendingRequests(20, 1);

      expect(requests1.length).to.equal(10);
      expect(requests2.length).to.equal(1);
      expect(requests3.length).to.equal(0);
    });

    it('reverts while paused', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Add some pending requests
      for (const request of data.requests) {
        await core.postRequest(request);
      }

      // Pause the contract
      await core.pause();

      // Verify getPendingRequests reverts while paused
      await expect(core.getPendingRequests(0, 10)).to.be.revertedWithCustomError(core, 'EnforcedPause');
    });
  });

  describe('increaseFees', () => {
    it('allows increasing fees for pending requests', async () => {
      const { prover, core, feeManager, data } = await loadFixture(deployCoreFixture);
      const [requestor, resultSubmitter, batchSubmitter] = await ethers.getSigners();

      const fees = {
        request: ethers.parseEther('1'),
        result: ethers.parseEther('2'),
        batch: ethers.parseEther('3'),
      };
      const totalFees = fees.request + fees.result + fees.batch;
      // Post request with all fees
      await core.postRequest(data.requests[1], fees.request, fees.result, fees.batch, { value: totalFees });

      // Increase fees
      const newFees = {
        request: ethers.parseEther('2'),
        result: ethers.parseEther('4'),
        batch: ethers.parseEther('6'),
      };
      const totalNewFees = newFees.request + newFees.result + newFees.batch;
      await core.increaseFees(data.results[1].drId, newFees.request, newFees.result, newFees.batch, {
        value: totalNewFees,
      });
      const pendingRequestorFees = await feeManager.getPendingFees(requestor.address);
      expect(pendingRequestorFees).to.equal(totalFees);

      // Submit batch
      const batch = { ...data.initialBatch, batchHeight: 1 };
      const signatures = [await data.wallets[0].signingKey.sign(deriveBatchId(batch)).serialized];
      await (prover.connect(batchSubmitter) as Secp256k1ProverV1).postBatch(batch, signatures, [
        data.validatorProofs[0],
      ]);

      // Calculate expected request fee distribution
      const totalGas = BigInt(data.requests[1].execGasLimit) + BigInt(data.requests[1].tallyGasLimit);
      const expectedPayback = (newFees.request * BigInt(data.results[1].gasUsed)) / totalGas;
      const expectedRefund = totalFees + newFees.request - expectedPayback;

      // Submit result
      await (core.connect(resultSubmitter) as SedaCoreV1).postResult(data.results[1], 1, data.proofs[1]);

      // Check pending fees before withdrawal
      const pendingResultFees = await feeManager.getPendingFees(resultSubmitter.address);
      expect(pendingResultFees).to.equal(newFees.result);

      const pendingBatchFees = await feeManager.getPendingFees(batchSubmitter.address);
      expect(pendingBatchFees).to.equal(newFees.batch);

      // Check if payback address has expected fees
      if (data.results[1].paybackAddress.length === 20) {
        const pendingPaybackFees = await feeManager.getPendingFees(data.results[1].paybackAddress.toString());
        expect(pendingPaybackFees).to.equal(expectedPayback);
      }

      const pendingRefundFees = await feeManager.getPendingFees(requestor.address);
      expect(pendingRefundFees).to.equal(expectedRefund);
    });

    it('rejects fee increase for non-existent request', async () => {
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

    it('rejects fee increase if request was already resolved', async () => {
      const { core, feeManager, data } = await loadFixture(deployCoreFixture);
      const [alice] = await ethers.getSigners();

      await core.postRequest(data.requests[0], 0, 0, 0);
      const requestId = await deriveRequestId(data.requests[0]);

      await core.postResult(data.results[0], 0, data.proofs[0]);

      await expect(core.increaseFees(requestId, 1, 1, 1, { value: 3 }))
        .to.be.revertedWithCustomError(core, 'RequestNotFound')
        .withArgs(requestId);
      expect(await feeManager.getPendingFees(alice.address)).to.equal(0);
    });

    it('rejects fee increase with incorrect payment amount', async () => {
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

    it('allows increasing fees for already existing request', async () => {
      const { core, feeManager, data } = await loadFixture(deployCoreFixture);
      const [alice] = await ethers.getSigners();

      await core.postRequest(data.requests[0], 0, 0, 0);
      const requestId = await deriveRequestId(data.requests[0]);

      await core.increaseFees(requestId, 1, 1, 1, { value: 3 });
      expect(await feeManager.getPendingFees(alice.address)).to.equal(0);

      await core.increaseFees(requestId, 2, 2, 2, { value: 6 });
      expect(await feeManager.getPendingFees(alice.address)).to.equal(3);
    });

    it('rejects fee increase if no fees are updated', async () => {
      const { core, feeManager, data } = await loadFixture(deployCoreFixture);
      const [alice] = await ethers.getSigners();

      await core.postRequest(data.requests[0], 0, 0, 0);
      const requestId = await deriveRequestId(data.requests[0]);

      await core.increaseFees(requestId, 1, 1, 1, { value: 3 });
      expect(await feeManager.getPendingFees(alice.address)).to.equal(0);

      await expect(core.increaseFees(requestId, 1, 1, 1, { value: 3 })).to.be.revertedWithCustomError(
        core,
        'NoFeesUpdated',
      );
    });

    it('allows a single fee increase even if other fees are not updated', async () => {
      const { core, feeManager, data } = await loadFixture(deployCoreFixture);
      const [alice] = await ethers.getSigners();

      const requestId = await deriveRequestId(data.requests[0]);
      await core.postRequest(data.requests[0], 1, 1, 1, { value: 3 });

      await expect(core.increaseFees(requestId, 2, 1, 0, { value: 3 })).not.to.be.reverted;
      expect(await feeManager.getPendingFees(alice.address)).to.equal(2);

      await expect(core.increaseFees(requestId, 0, 2, 1, { value: 3 })).not.to.be.reverted;
      expect(await feeManager.getPendingFees(alice.address)).to.equal(4);

      await expect(core.increaseFees(requestId, 1, 0, 2, { value: 3 })).not.to.be.reverted;
      expect(await feeManager.getPendingFees(alice.address)).to.equal(6);
    });
  });

  describe('withdrawTimedOutRequest', () => {
    it('allows withdrawing timed out requests', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      const fees = {
        request: ethers.parseEther('1.0'),
        result: ethers.parseEther('2.0'),
        batch: ethers.parseEther('3.0'),
      };
      const totalFee = fees.request + fees.result + fees.batch;
      const [requestor, withdrawer] = await ethers.getSigners();

      // Post request with fees
      await core.postRequest(data.requests[0], fees.request, fees.result, fees.batch, { value: totalFee });
      const requestId = await deriveRequestId(data.requests[0]);

      // Try to withdraw before timeout - should fail
      await expect(core.withdrawTimedOutRequest(requestId)).to.be.revertedWithCustomError(core, 'RequestNotTimedOut');

      // Fast forward past timeout period
      await ethers.provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
      await ethers.provider.send('evm_mine', []);

      // Get fee manager directly from core
      const feeManagerAddress = await core.getFeeManager();
      const feeManagerContract = await ethers.getContractAt('SedaFeeManager', feeManagerAddress);

      // Record initial balance
      const initialRequestorBalance = await ethers.provider.getBalance(requestor.address);

      // Withdraw as different address
      await (core.connect(withdrawer) as SedaCoreV1).withdrawTimedOutRequest(requestId);

      // After withdrawal, the requestor should withdraw their fees from the FeeManager
      await feeManagerContract.connect(requestor).withdrawFees();

      // Verify balance change (accounting for gas costs)
      const finalRequestorBalance = await ethers.provider.getBalance(requestor.address);
      expect(finalRequestorBalance - initialRequestorBalance).to.be.closeTo(totalFee, ethers.parseEther('0.01'));

      // Verify request was removed
      const requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(0);

      // Try to withdraw again - should fail
      await expect(core.withdrawTimedOutRequest(requestId))
        .to.be.revertedWithCustomError(core, 'RequestNotFound')
        .withArgs(requestId);
    });

    it('handles withdrawal of request with zero fees', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Post request without fees
      await core.postRequest(data.requests[0]);
      const requestId = await deriveRequestId(data.requests[0]);

      // Fast forward past timeout period
      await ethers.provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
      await ethers.provider.send('evm_mine', []);

      // Withdraw should succeed but not emit fee distribution event
      await expect(core.withdrawTimedOutRequest(requestId)).to.not.emit(core, 'FeeDistributed');

      // Verify request was removed
      const requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(0);
    });

    it('handles withdrawal after timeout period update', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      const fee = ethers.parseEther('1.0');

      // Post request with fee
      await core.postRequest(data.requests[0], fee, 0, 0, { value: fee });
      const requestId = await deriveRequestId(data.requests[0]);

      // Update timeout period to be shorter
      const newTimeoutPeriod = ONE_DAY_IN_SECONDS / 2;
      await expect(core.setTimeoutPeriod(newTimeoutPeriod))
        .to.emit(core, 'TimeoutPeriodUpdated')
        .withArgs(newTimeoutPeriod);

      // Fast forward past new timeout period
      await ethers.provider.send('evm_increaseTime', [newTimeoutPeriod]);
      await ethers.provider.send('evm_mine', []);

      // Withdrawal should succeed with new timeout period
      await expect(core.withdrawTimedOutRequest(requestId))
        .to.emit(core, 'FeeDistributed')
        .withArgs(requestId, await core.owner(), fee, 4); // FeeType.WITHDRAW = 4
    });

    it('prevents withdrawal of non-existent request', async () => {
      const { core } = await loadFixture(deployCoreFixture);
      const nonExistentRequestId = ethers.randomBytes(32);

      await expect(core.withdrawTimedOutRequest(nonExistentRequestId))
        .to.be.revertedWithCustomError(core, 'RequestNotFound')
        .withArgs(nonExistentRequestId);
    });

    it('allows withdrawal even when paused', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      const fee = ethers.parseEther('1.0');

      // Post request with fee
      await core.postRequest(data.requests[0], 0, fee, 0, { value: fee });
      const requestId = await deriveRequestId(data.requests[0]);

      // Fast forward past timeout period
      await ethers.provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
      await ethers.provider.send('evm_mine', []);

      // Pause contract
      await core.pause();

      // Verify withdrawal still works while paused
      await expect(core.withdrawTimedOutRequest(requestId))
        .to.emit(core, 'FeeDistributed')
        .withArgs(requestId, await core.owner(), fee, 4); // FeeType.WITHDRAW = 4

      // Verify request was removed
      await expect(core.withdrawTimedOutRequest(requestId))
        .to.be.revertedWithCustomError(core, 'RequestNotFound')
        .withArgs(requestId);
    });
  });

  describe('admin functions', () => {
    describe('pause/unpause', () => {
      it('allows owner to pause and unpause', async () => {
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

      it('prevents non-owner from pausing/unpausing', async () => {
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

      it('prevents operations while paused', async () => {
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

      it('resumes operations after unpausing', async () => {
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

    describe('timeout period', () => {
      it('allows owner to get and set timeout period', async () => {
        const { core } = await loadFixture(deployCoreFixture);

        // Get initial timeout period
        expect(await core.getTimeoutPeriod()).to.equal(ONE_DAY_IN_SECONDS);

        // Set new timeout period
        const newPeriod = ONE_DAY_IN_SECONDS * 2;
        await expect(core.setTimeoutPeriod(newPeriod)).to.emit(core, 'TimeoutPeriodUpdated').withArgs(newPeriod);

        // Verify new timeout period
        expect(await core.getTimeoutPeriod()).to.equal(newPeriod);
      });

      it('prevents non-owner from setting timeout period', async () => {
        const { core } = await loadFixture(deployCoreFixture);
        const [, nonOwner] = await ethers.getSigners();

        await expect(
          (core.connect(nonOwner) as SedaCoreV1).setTimeoutPeriod(ONE_DAY_IN_SECONDS),
        ).to.be.revertedWithCustomError(core, 'OwnableUnauthorizedAccount');
      });

      it('prevents setting zero timeout period', async () => {
        const { core } = await loadFixture(deployCoreFixture);

        await expect(core.setTimeoutPeriod(0)).to.be.revertedWithCustomError(core, 'InvalidTimeoutPeriod');
      });
    });
  });

  describe('getRequestDetails', () => {
    it('returns request details for pending requests', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      const fees = {
        request: ethers.parseEther('1.0'),
        result: ethers.parseEther('2.0'),
        batch: ethers.parseEther('3.0'),
      };
      const totalFee = fees.request + fees.result + fees.batch;

      // Post request with fees
      await core.postRequest(data.requests[0], fees.request, fees.result, fees.batch, { value: totalFee });
      const requestId = await deriveRequestId(data.requests[0]);

      // Get request details
      const details = await core.getPendingRequestDetails(requestId);

      // Verify details
      expect(details.timestamp).to.not.equal(0);
      expect(details.requestFee).to.equal(fees.request);
      expect(details.resultFee).to.equal(fees.result);
      expect(details.batchFee).to.equal(fees.batch);
      expect(details.gasLimit).to.equal(BigInt(data.requests[0].execGasLimit) + BigInt(data.requests[0].tallyGasLimit));
      expect(details.requestFeeAddr).to.equal(await core.owner());
      expect(details.resultFeeAddr).to.equal(await core.owner());
      expect(details.batchFeeAddr).to.equal(await core.owner());
    });

    it('returns empty details for non-existent requests', async () => {
      const { core } = await loadFixture(deployCoreFixture);
      const nonExistentRequestId = ethers.randomBytes(32);

      const details = await core.getPendingRequestDetails(nonExistentRequestId);

      // Verify all fields are zero/empty
      expect(details.timestamp).to.equal(0);
      expect(details.requestFee).to.equal(0);
      expect(details.resultFee).to.equal(0);
      expect(details.batchFee).to.equal(0);
      expect(details.gasLimit).to.equal(0);
      expect(details.requestFeeAddr).to.equal(ethers.ZeroAddress);
      expect(details.resultFeeAddr).to.equal(ethers.ZeroAddress);
      expect(details.batchFeeAddr).to.equal(ethers.ZeroAddress);
    });

    it('returns empty details after request is resolved', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Post request
      await core.postRequest(data.requests[0]);
      const requestId = await deriveRequestId(data.requests[0]);

      // Verify details exist
      const detailsBefore = await core.getPendingRequestDetails(requestId);
      expect(detailsBefore.timestamp).to.not.equal(0);

      // Post result
      await core.postResult(data.results[0], 0, data.proofs[0]);

      // Verify details are cleared
      const detailsAfter = await core.getPendingRequestDetails(requestId);
      expect(detailsAfter.timestamp).to.equal(0);
      expect(detailsAfter.requestFee).to.equal(0);
      expect(detailsAfter.resultFee).to.equal(0);
      expect(detailsAfter.batchFee).to.equal(0);
      expect(detailsAfter.gasLimit).to.equal(0);
      expect(detailsAfter.requestFeeAddr).to.equal(ethers.ZeroAddress);
      expect(detailsAfter.resultFeeAddr).to.equal(ethers.ZeroAddress);
      expect(detailsAfter.batchFeeAddr).to.equal(ethers.ZeroAddress);
    });
  });

  describe('fee manager integration', () => {
    it('handles case when fee manager is not set', async () => {
      // Generate data fixtures for the test
      const { requests, results } = generateDataFixtures(2);

      // Create merkle tree and proofs
      const leaves = results.map(deriveResultId).map(computeResultLeafHash);
      const resultsTree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
      const proofs = results.map((_, index) => resultsTree.getProof(index));

      // Create an initial batch for the MockProver
      const initialBatch = {
        batchHeight: 0,
        blockHeight: 0,
        validatorsRoot: ethers.ZeroHash,
        resultsRoot: resultsTree.root,
        provingMetadata: ethers.ZeroHash,
      };

      // Deploy MockProver with zero fee manager
      const MockProverFactory = await ethers.getContractFactory('MockProver');
      const mockProver = await MockProverFactory.deploy(initialBatch);
      await mockProver.waitForDeployment();

      // Verify fee manager is address(0)
      expect(await mockProver.getFeeManager()).to.equal(ethers.ZeroAddress);

      // Deploy core with the mock prover
      const CoreFactory = await ethers.getContractFactory('SedaCoreV1');
      const core = await upgrades.deployProxy(CoreFactory, [await mockProver.getAddress(), ONE_DAY_IN_SECONDS], {
        initializer: 'initialize',
      });
      await core.waitForDeployment();

      // Verify fee manager address is zero
      expect(await core.getFeeManager()).to.equal(ethers.ZeroAddress);

      // Test 1: Post request without fees
      await core.postRequest(requests[0]);

      // Post result without fees - should work even with fee manager not set
      await expect(core.postResult(results[0], 0, proofs[0])).to.not.be.reverted;

      // Test 2: Post request with fees
      const fee = ethers.parseEther('1.0');
      await expect(core.postRequest(requests[1], fee, 0, 0, { value: fee })).to.be.revertedWithCustomError(
        core,
        'FeeManagerRequired',
      );

      // Test 3: Attempt to increase fees for a request
      await core.postRequest(requests[1]);
      const requestId = await deriveRequestId(requests[1]);
      await expect(
        core.increaseFees(requestId, ethers.parseEther('1.0'), 0, 0, { value: ethers.parseEther('1.0') }),
      ).to.be.revertedWithCustomError(core, 'FeeManagerRequired');
    });

    it('requires fee manager for operations on requests with fees', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);
      const fee = ethers.parseEther('0.1');

      // First post a request with fees (this works because fee manager exists)
      await core.postRequest(data.requests[0], fee, 0, 0, { value: fee });
      const requestId = await deriveRequestId(data.requests[0]);

      // Calculate the base storage slot
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes('sedacore.storage.v1'));
      const nameHashAsNumber = ethers.toBigInt(nameHash);
      const decremented = nameHashAsNumber - 1n;
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [decremented]);
      const slot = ethers.keccak256(encoded);
      const mask = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00');
      const CORE_V1_STORAGE_SLOT = ethers.toBeHex(ethers.toBigInt(slot) & mask);

      // Now we know the fee manager is at offset 4
      const feeManagerSlot = ethers.toBeHex(ethers.toBigInt(CORE_V1_STORAGE_SLOT) + 4n);

      // Set this slot to address(0)
      await ethers.provider.send('hardhat_setStorageAt', [
        await core.getAddress(),
        feeManagerSlot,
        ethers.zeroPadValue('0x00', 32),
      ]);

      // Mine a block to ensure the changes are reflected
      await ethers.provider.send('evm_mine', []);

      // Verify fee manager is now address(0)
      expect(await core.getFeeManager()).to.equal(ethers.ZeroAddress);

      // Test 1: Try to increase fees
      await expect(core.increaseFees(requestId, fee, 0, 0, { value: fee })).to.be.revertedWithCustomError(
        core,
        'FeeManagerRequired',
      );

      // Test 2: Try to withdraw a timed-out request with fees
      await ethers.provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
      await ethers.provider.send('evm_mine', []);

      await expect(core.withdrawTimedOutRequest(requestId)).to.be.revertedWithCustomError(core, 'FeeManagerRequired');
    });
  });
});
