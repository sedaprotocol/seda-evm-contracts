import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import type { Wallet } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import type { ProverDataTypes } from '../../ts-types';
import type { Secp256k1ProverV1 } from '../../typechain-types';
import { deployWithOptions, generateDataFixtures } from '../helpers/fixtures';
import { MAX_BATCH_AGE } from '../utils/constants';
import { computeResultLeafHash, deriveBatchId, deriveResultId, generateNewBatchWithId } from '../utils/crypto';

describe('Secp256k1ProverV1', () => {
  async function deployProverFixture() {
    const { prover, data } = await deployWithOptions({ validators: 4 });
    return { prover, wallets: data.wallets, data };
  }

  // Add a helper function to generate and sign a new batch
  async function generateAndSignBatch(
    wallets: Wallet[],
    initialBatch: ProverDataTypes.BatchStruct,
    signerIndices = [0],
  ) {
    const { newBatchId, newBatch } = generateNewBatchWithId(initialBatch);
    const signatures = await Promise.all(signerIndices.map((i) => wallets[i].signingKey.sign(newBatchId).serialized));
    return { newBatchId, newBatch, signatures };
  }

  describe('view functions', () => {
    it('returns last batch height', async () => {
      const {
        prover,
        data: { initialBatch },
      } = await loadFixture(deployProverFixture);
      const lastBatchHeight = await prover.getLastBatchHeight();
      expect(lastBatchHeight).to.equal(initialBatch.batchHeight);
    });

    it('returns batch data by height', async () => {
      const {
        prover,
        data: { initialBatch },
      } = await loadFixture(deployProverFixture);
      const batch = await prover.getBatch(initialBatch.batchHeight);
      expect(batch.resultsRoot).to.equal(initialBatch.resultsRoot);
      expect(batch.sender).to.equal(ethers.ZeroAddress);
    });

    it('retrieves current validators root', async () => {
      const {
        prover,
        data: { initialBatch },
      } = await loadFixture(deployProverFixture);
      const lastValidatorsRoot = await prover.getLastValidatorsRoot();
      expect(lastValidatorsRoot).to.equal(initialBatch.validatorsRoot);
    });

    it('retrieves current max batch age', async () => {
      const { prover } = await loadFixture(deployProverFixture);
      expect(await prover.getMaxBatchAge()).to.equal(MAX_BATCH_AGE);
    });

    it('checks if batch exists', async () => {
      const { prover, data } = await loadFixture(deployProverFixture);
      const batch = await prover.getBatch(data.initialBatch.batchHeight);
      expect(batch.resultsRoot).to.not.equal(ethers.ZeroHash);
      expect(batch.sender).to.equal(ethers.ZeroAddress);
    });

    it('checks if batch does not exist', async () => {
      const { prover } = await loadFixture(deployProverFixture);
      const batch = await prover.getBatch(1);
      expect(batch.resultsRoot).to.equal(ethers.ZeroHash);
      expect(batch.sender).to.equal(ethers.ZeroAddress);
    });
  });

  describe('batch posting', () => {
    it('updates batch with single validator (75% power)', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatch, signatures } = await generateAndSignBatch(wallets, data.initialBatch, [0]);
      await prover.postBatch(newBatch, signatures, [data.validatorProofs[0]]);

      const lastBatchHeight = await prover.getLastBatchHeight();
      const lastValidatorsRoot = await prover.getLastValidatorsRoot();
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
      expect(lastValidatorsRoot).to.equal(newBatch.validatorsRoot);
    });

    it('updates batch with all validators (100% power)', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatch, signatures } = await generateAndSignBatch(wallets, data.initialBatch, [0, 1, 2, 3]);
      await prover.postBatch(newBatch, signatures, data.validatorProofs);

      const lastBatchHeight = await prover.getLastBatchHeight();
      const lastValidatorsRoot = await prover.getLastValidatorsRoot();
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
      expect(lastValidatorsRoot).to.equal(newBatch.validatorsRoot);
    });

    it('emits BatchUpdated event', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatch, signatures, newBatchId } = await generateAndSignBatch(wallets, data.initialBatch, [0]);

      const [batchSender] = await ethers.getSigners();
      await expect(
        (prover.connect(batchSender) as Secp256k1ProverV1).postBatch(newBatch, signatures, [data.validatorProofs[0]]),
      )
        .to.emit(prover, 'BatchPosted')
        .withArgs(newBatch.batchHeight, newBatchId, batchSender.address);
    });

    it('rejects batch with insufficient voting power', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = [await wallets[1].signingKey.sign(newBatchId).serialized];

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[1]])).to.be.revertedWithCustomError(
        prover,
        'ConsensusNotReached',
      );

      const lastBatchHeight = await prover.getLastBatchHeight();
      expect(lastBatchHeight).to.equal(data.initialBatch.batchHeight);
    });

    it('rejects batch with mismatched signatures and proofs', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];

      await expect(prover.postBatch(newBatch, signatures, data.validatorProofs)).to.be.revertedWithCustomError(
        prover,
        'MismatchedSignaturesAndProofs',
      );
    });

    it('rejects batch with invalid merkle proof', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];
      const invalidProofs = [
        {
          ...data.validatorProofs[0],
          merkleProof: [],
        },
      ];

      await expect(prover.postBatch(newBatch, signatures, invalidProofs)).to.be.revertedWithCustomError(
        prover,
        'InvalidValidatorProof',
      );
    });

    it('rejects batch with invalid signature', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = [await wallets[1].signingKey.sign(newBatchId).serialized];

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]])).to.be.revertedWithCustomError(
        prover,
        'InvalidSignature',
      );
    });

    it('rejects posting a batch with same height as initial batch', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      newBatch.batchHeight = 0;
      const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]])).to.be.revertedWithCustomError(
        prover,
        'BatchAlreadyExists',
      );
    });

    it('rejects posting same batch twice', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];
      await prover.postBatch(newBatch, signatures, [data.validatorProofs[0]]);

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]])).to.be.revertedWithCustomError(
        prover,
        'BatchAlreadyExists',
      );
    });

    it('allows posting an old batch within MAX_BATCH_AGE', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      // First post a newer batch
      const { newBatchId: newerBatchId, newBatch: newerBatch } = generateNewBatchWithId(data.initialBatch, BigInt(50));
      await prover.postBatch(
        newerBatch,
        [await wallets[0].signingKey.sign(newerBatchId).serialized],
        [data.validatorProofs[0]],
      );

      // Now post an older batch that's within MAX_BATCH_AGE
      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch, BigInt(10));
      const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]]))
        .to.emit(prover, 'BatchPosted')
        .withArgs(newBatch.batchHeight, newBatchId, (await ethers.getSigners())[0].address);

      // Verify the lastBatchHeight hasn't changed
      expect(await prover.getLastBatchHeight()).to.equal(newerBatch.batchHeight);
    });

    it('rejects batch that is too old', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      // First post a newer batch to increase lastBatchHeight
      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch, BigInt(200));
      const signatures1 = [await wallets[0].signingKey.sign(newBatchId).serialized];

      await prover.postBatch(newBatch, signatures1, [data.validatorProofs[0]]);

      // Now try to post a batch that's too old
      const { newBatchId: olderBatchId, newBatch: olderBatch } = generateNewBatchWithId(data.initialBatch, BigInt(99));
      const signatures2 = [await wallets[0].signingKey.sign(olderBatchId).serialized];

      await expect(prover.postBatch(olderBatch, signatures2, [data.validatorProofs[0]]))
        .to.be.revertedWithCustomError(prover, 'BatchHeightTooOld')
        .withArgs(olderBatch.batchHeight, newBatch.batchHeight, MAX_BATCH_AGE);
    });

    it('updates batch with full validator set', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = await Promise.all(wallets.map((wallet) => wallet.signingKey.sign(newBatchId).serialized));

      await prover.postBatch(newBatch, signatures, data.validatorProofs);

      const lastBatchHeight = await prover.getLastBatchHeight();
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
    });

    it('rejects batch with duplicate signatures (2 times 40% power)', async () => {
      const { prover, data } = await deployWithOptions({ validators: 4, firstValidatorPower: 40_000_000 });

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      // Generate signature from first validator and duplicate it
      const signature = await data.wallets[0].signingKey.sign(newBatchId).serialized;
      const signatures = [signature, signature];

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0], data.validatorProofs[0]])).to.be
        .reverted;

      const lastBatchHeight = await prover.getLastBatchHeight();
      expect(lastBatchHeight).to.equal(data.initialBatch.batchHeight);
    });
  });

  describe('verification', () => {
    describe('result proofs', () => {
      it('verifies valid result proof', async () => {
        const { prover, wallets, data } = await loadFixture(deployProverFixture);

        // Generate a mock result and its proof
        const { results } = generateDataFixtures(10);
        const resultIds = results.map(deriveResultId);
        const resultLeaves = resultIds.map(computeResultLeafHash);
        const resultsTree = SimpleMerkleTree.of(resultLeaves);

        // Create a batch with results
        const batch = {
          ...data.initialBatch,
          batchHeight: 1,
          resultsRoot: resultsTree.root,
        };
        const newBatchId = deriveBatchId(batch);
        const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];

        const [batchSender] = await ethers.getSigners();
        await (prover.connect(batchSender) as Secp256k1ProverV1).postBatch(batch, signatures, [
          data.validatorProofs[0],
        ]);

        // Verify a valid proof
        const [isValid, sender] = await prover.verifyResultProof(resultIds[1], 1, resultsTree.getProof(1));
        expect(isValid).to.be.true;
        expect(sender).to.equal(batchSender.address);
      });

      it('rejects invalid result proof', async () => {
        const { prover, wallets, data } = await loadFixture(deployProverFixture);

        // Generate a mock result and its proof
        const { results } = generateDataFixtures(10);
        const resultIds = results.map(deriveResultId);
        const resultLeaves = resultIds.map(computeResultLeafHash);
        const resultsTree = SimpleMerkleTree.of(resultLeaves);

        // Create a batch with results
        const batch = {
          ...data.initialBatch,
          batchHeight: 1,
          resultsRoot: resultsTree.root,
        };
        const newBatchId = deriveBatchId(batch);
        const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];
        await prover.postBatch(batch, signatures, [data.validatorProofs[0]]);

        // Verify an invalid proof
        const [isValid, batchSender] = await prover.verifyResultProof(resultIds[0], 1, resultsTree.getProof(1));
        expect(isValid).to.be.false;
        expect(batchSender).to.equal(ethers.ZeroAddress);
      });
    });

    describe('batch proofs', () => {
      it('verifies valid batch proof', async () => {
        const { prover, wallets, data } = await loadFixture(deployProverFixture);

        // Generate a mock result and its proof
        const { results } = generateDataFixtures(10);
        const resultIds = results.map(deriveResultId);
        const resultLeaves = resultIds.map(computeResultLeafHash);
        const resultsTree = SimpleMerkleTree.of(resultLeaves);

        // Create a batch with results
        const batch = {
          ...data.initialBatch,
          batchHeight: 1,
          resultsRoot: resultsTree.root,
        };
        const newBatchId = deriveBatchId(batch);
        const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];
        await prover.postBatch(batch, signatures, [data.validatorProofs[0]]);

        // Verify a valid proof
        const [resultBatch] = await prover.verifyResultProof(resultIds[0], batch.batchHeight, resultsTree.getProof(0));
        expect(resultBatch).to.be.true;
      });

      it('rejects invalid batch proof', async () => {
        const { prover, wallets, data } = await loadFixture(deployProverFixture);

        // Generate a mock result and its proof
        const { results } = generateDataFixtures(10);
        const resultIds = results.map(deriveResultId);
        const resultLeaves = resultIds.map(computeResultLeafHash);
        const resultsTree = SimpleMerkleTree.of(resultLeaves);

        // Create a new batch with no results
        const batch1 = {
          ...data.initialBatch,
          batchHeight: 1,
          resultsRoot: ethers.ZeroHash,
        };
        const newBatchId1 = deriveBatchId(batch1);
        const signatures1 = [await wallets[0].signingKey.sign(newBatchId1).serialized];
        await prover.postBatch(batch1, signatures1, [data.validatorProofs[0]]);

        // Verify an invalid proof
        const [resultBatch1, batchSender] = await prover.verifyResultProof(
          resultIds[0],
          batch1.batchHeight,
          resultsTree.getProof(0),
        );
        expect(resultBatch1).to.be.false;
        expect(batchSender).to.equal(ethers.ZeroAddress);
      });
    });
  });

  describe('test vectors', () => {
    it('generates correct batch id for test vectors', async () => {
      const testBatch: ProverDataTypes.BatchStruct = {
        batchHeight: 4,
        blockHeight: 134,
        resultsRoot: '0x49918c4e986fff80aeb3532466132920d2ffd8db2a9615e8d02dd0f02e19503a',
        validatorsRoot: '0xaa13705083effb122a0d9ff3cbb97c2db68caf9dce10572d18979237a1a8d359',
        provingMetadata: '0x0000000000000000000000000000000000000000000000000000000000000000',
      };
      const expectedBatchId = deriveBatchId(testBatch);
      expect(expectedBatchId).to.equal('0x9b8a1c156da9096bc89288e9d64df3c897435e962ae7402f0c25c97f3de76e94');

      // Deploy the contract
      const ProverFactory = await ethers.getContractFactory('Secp256k1ProverV1');
      const prover = await upgrades.deployProxy(ProverFactory, [testBatch, MAX_BATCH_AGE, ethers.ZeroAddress], {
        initializer: 'initialize',
      });
      await prover.waitForDeployment();

      expect(prover).to.emit(prover, 'BatchPosted').withArgs(testBatch.batchHeight, expectedBatchId);
    });
  });

  describe('access control', () => {
    it('allows owner to pause and unpause', async () => {
      const { prover } = await loadFixture(deployProverFixture);
      const [owner] = await ethers.getSigners();

      expect(await prover.paused()).to.be.false;

      await expect((prover.connect(owner) as Secp256k1ProverV1).pause())
        .to.emit(prover, 'Paused')
        .withArgs(owner.address);

      expect(await prover.paused()).to.be.true;

      await expect((prover.connect(owner) as Secp256k1ProverV1).unpause())
        .to.emit(prover, 'Unpaused')
        .withArgs(owner.address);

      expect(await prover.paused()).to.be.false;
    });

    it('prevents non-owner from pausing/unpausing', async () => {
      const { prover } = await loadFixture(deployProverFixture);
      const [, nonOwner] = await ethers.getSigners();

      await expect((prover.connect(nonOwner) as Secp256k1ProverV1).pause()).to.be.revertedWithCustomError(
        prover,
        'OwnableUnauthorizedAccount',
      );

      await expect((prover.connect(nonOwner) as Secp256k1ProverV1).unpause()).to.be.revertedWithCustomError(
        prover,
        'OwnableUnauthorizedAccount',
      );
    });

    it('prevents postBatch while paused', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);
      const [owner] = await ethers.getSigners();

      // Pause the contract
      await (prover.connect(owner) as Secp256k1ProverV1).pause();

      // Try to post a batch while paused
      const { newBatch, signatures } = await generateAndSignBatch(wallets, data.initialBatch, [0]);
      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]])).to.be.revertedWithCustomError(
        prover,
        'EnforcedPause',
      );
    });

    it('resumes operations after unpausing', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);
      const [owner] = await ethers.getSigners();

      // Pause the contract
      await (prover.connect(owner) as Secp256k1ProverV1).pause();

      // Try to post a batch while paused
      const { newBatch, signatures } = await generateAndSignBatch(wallets, data.initialBatch, [0]);
      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]])).to.be.revertedWithCustomError(
        prover,
        'EnforcedPause',
      );

      // Unpause the contract
      await (prover.connect(owner) as Secp256k1ProverV1).unpause();

      // Should now be able to post batch
      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]]))
        .to.emit(prover, 'BatchPosted')
        .withArgs(newBatch.batchHeight, deriveBatchId(newBatch), owner.address);
    });
  });

  describe('fee management', () => {
    it('returns zero address when fee manager is not set', async () => {
      // Use the deployWithSize helper which deploys with zero address fee manager
      const { prover } = await deployWithOptions({ validators: 4 });
      const feeManager = await prover.getFeeManager();
      expect(feeManager).to.equal(ethers.ZeroAddress);
    });

    it('returns fee manager address when set', async () => {
      // Use deployWithSize helper with the fee manager address
      const { prover, feeManager } = await deployWithOptions({
        validators: 4,
        feeManager: true,
      });

      const queriedFeeManager = await prover.getFeeManager();
      expect(queriedFeeManager).to.equal(feeManager);
    });
  });
});
