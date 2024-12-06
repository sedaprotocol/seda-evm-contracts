import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import type { Wallet } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import type { SedaDataTypes } from '../../typechain-types/contracts/libraries';
import {
  computeResultLeafHash,
  computeValidatorLeafHash,
  deriveBatchId,
  deriveDataResultId,
  generateDataFixtures,
  generateNewBatchWithId,
} from '../utils';

describe('Secp256k1ProverV1', () => {
  async function deployProverFixture(length = 4) {
    const wallets = Array.from({ length }, (_, i) => {
      const seed = ethers.id(`validator${i}`);
      return new ethers.Wallet(seed.slice(2, 66));
    });

    const validators = wallets.map((wallet) => wallet.address);
    const votingPowers = Array(wallets.length).fill(1_000_000);
    votingPowers[0] = 75_000_000;
    votingPowers[1] = 25_000_000;
    votingPowers[2] = 25_000_000;
    votingPowers[3] = 25_000_000;

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

    // Results: Create merkle tree and proofs
    const { requests, results } = generateDataFixtures(2);
    const resultsLeaves = results.map(deriveDataResultId).map(computeResultLeafHash);

    const resultsTree = SimpleMerkleTree.of(resultsLeaves, {
      sortLeaves: true,
    });
    const resultProofs = results.map((_, index) => {
      return resultsTree.getProof(index);
    });

    // Create initial batch
    const initialBatch = {
      batchHeight: 0,
      blockHeight: 0,
      validatorsRoot: validatorsTree.root,
      resultsRoot: resultsTree.root,
      provingMetadata: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    const data = {
      initialBatch,
      validatorProofs,
      resultProofs,
      requests,
      results,
    };

    // Deploy the contract
    const ProverFactory = await ethers.getContractFactory('Secp256k1ProverV1');
    const prover = await upgrades.deployProxy(ProverFactory, [initialBatch], { initializer: 'initialize' });
    await prover.waitForDeployment();

    return { prover, wallets, data };
  }

  // Add a helper function to generate and sign a new batch
  async function generateAndSignBatch(wallets: Wallet[], initialBatch: SedaDataTypes.BatchStruct, signerIndices = [0]) {
    const { newBatchId, newBatch } = generateNewBatchWithId(initialBatch);
    const signatures = await Promise.all(signerIndices.map((i) => wallets[i].signingKey.sign(newBatchId).serialized));
    return { newBatchId, newBatch, signatures };
  }

  describe('getCurrentBatch', () => {
    it('should return the current batch', async () => {
      const {
        prover,
        data: { initialBatch },
      } = await loadFixture(deployProverFixture);
      const lastBatchHeight = await prover.getLastBatchHeight();
      expect(lastBatchHeight).to.equal(initialBatch.batchHeight);
    });
  });

  describe('postBatch', () => {
    it('should update a batch with 1 validator (75% voting power)', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatch, signatures } = await generateAndSignBatch(wallets, data.initialBatch, [0]);
      await prover.postBatch(newBatch, signatures, [data.validatorProofs[0]]);

      const lastBatchHeight = await prover.getLastBatchHeight();
      const lastValidatorsRoot = await prover.getLastValidatorsRoot();
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
      expect(lastValidatorsRoot).to.equal(newBatch.validatorsRoot);
    });

    it('should update a batch with 3 validators (75% voting power)', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatch, signatures } = await generateAndSignBatch(wallets, data.initialBatch, [1, 2, 3]);
      await prover.postBatch(newBatch, signatures, data.validatorProofs.slice(1));

      const lastBatchHeight = await prover.getLastBatchHeight();
      const lastValidatorsRoot = await prover.getLastValidatorsRoot();
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
      expect(lastValidatorsRoot).to.equal(newBatch.validatorsRoot);
    });

    it('should emit a BatchUpdated event', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatch, signatures, newBatchId } = await generateAndSignBatch(wallets, data.initialBatch, [0]);

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]]))
        .to.emit(prover, 'BatchPosted')
        .withArgs(newBatch.batchHeight, newBatchId);
    });

    it('should fail to update a batch with 1 validator (25% voting power)', async () => {
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

    it('should fail to update a batch if mismatching signatures and proofs', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];

      await expect(prover.postBatch(newBatch, signatures, data.validatorProofs)).to.be.revertedWithCustomError(
        prover,
        'MismatchedSignaturesAndProofs',
      );
    });

    it('should fail to update a batch if invalid merkle proof', async () => {
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

    it('should fail to update a batch if invalid signature', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = [await wallets[1].signingKey.sign(newBatchId).serialized];

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]])).to.be.revertedWithCustomError(
        prover,
        'InvalidSignature',
      );
    });

    it('should fail to update a batch with lower batch height', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      newBatch.batchHeight = 0; // Set to current batch height
      const signatures = [await wallets[0].signingKey.sign(newBatchId).serialized];

      await expect(prover.postBatch(newBatch, signatures, [data.validatorProofs[0]])).to.be.revertedWithCustomError(
        prover,
        'InvalidBatchHeight',
      );
    });

    it('should update a batch with all validators (100% voting power)', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId(data.initialBatch);
      const signatures = await Promise.all(wallets.map((wallet) => wallet.signingKey.sign(newBatchId).serialized));

      await prover.postBatch(newBatch, signatures, data.validatorProofs);

      const lastBatchHeight = await prover.getLastBatchHeight();
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
    });
  });

  describe('verifyResultProof', () => {
    it('should verify a valid result proof', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      // Generate a mock result and its proof
      const { results } = generateDataFixtures(10);
      const resultIds = results.map(deriveDataResultId);
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
      const isValid = await prover.verifyResultProof(resultIds[1], 1, resultsTree.getProof(1));
      expect(isValid).to.be.true;
    });

    it('should reject an invalid result proof', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      // Generate a mock result and its proof
      const { results } = generateDataFixtures(10);
      const resultIds = results.map(deriveDataResultId);
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
      const isValid = await prover.verifyResultProof(resultIds[0], 1, resultsTree.getProof(1));
      expect(isValid).to.be.false;
    });
  });

  describe('verifyResultProofForBatch', () => {
    it('should verify a valid result proof', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      // Generate a mock result and its proof
      const { results } = generateDataFixtures(10);
      const resultIds = results.map(deriveDataResultId);
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
      const resultBatch = await prover.verifyResultProof(resultIds[0], batch.batchHeight, resultsTree.getProof(0));
      expect(resultBatch).to.be.true;
    });

    it('should reject an invalid result proof', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      // Generate a mock result and its proof
      const { results } = generateDataFixtures(10);
      const resultIds = results.map(deriveDataResultId);
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
      const resultBatch1 = await prover.verifyResultProof(resultIds[0], batch1.batchHeight, resultsTree.getProof(0));
      expect(resultBatch1).to.be.false;
    });
  });

  describe('gas analysis', () => {
    async function runGasAnalysis(validatorCount: number, batchCount: number) {
      const { prover, wallets, data } = await deployProverFixture(validatorCount);

      for (let i = 1; i <= batchCount; i++) {
        const newBatch = {
          ...data.initialBatch,
          batchHeight: i,
          blockHeight: i,
        };
        const newBatchId = deriveBatchId(newBatch);
        const signatures = await Promise.all(
          wallets.slice(0, validatorCount).map((wallet) => wallet.signingKey.sign(newBatchId).serialized),
        );
        await prover.postBatch(newBatch, signatures, data.validatorProofs.slice(0, validatorCount));
        const lastBatchHeight = await prover.getLastBatchHeight();
        expect(lastBatchHeight).to.equal(newBatch.batchHeight);
      }
    }

    it('67 validators', async () => {
      await runGasAnalysis(67, 100);
    });

    it('20 validators', async () => {
      await runGasAnalysis(20, 100);
    });
  });

  describe('batch id', () => {
    it('should generate the correct batch id for test vectors', async () => {
      const testBatch: SedaDataTypes.BatchStruct = {
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
      const prover = await upgrades.deployProxy(ProverFactory, [testBatch], { initializer: 'initialize' });
      await prover.waitForDeployment();

      expect(prover).to.emit(prover, 'BatchPosted').withArgs(testBatch.batchHeight, expectedBatchId);
    });
  });
});
