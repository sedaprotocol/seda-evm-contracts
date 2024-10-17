import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  computeResultLeafHash,
  computeValidatorLeafHash,
  deriveBatchId,
  deriveDataResultId,
  generateDataFixtures,
  generateNewBatchWithId,
} from './utils';

import { compareBatches } from './helpers';

describe('Secp256k1Prover', () => {
  async function deployProverFixture(length = 4) {
    const wallets = Array.from({ length }, (_, i) => {
      const seed = ethers.id(`validator${i}`);
      return new ethers.Wallet(seed.slice(2, 66));
    });

    // Remove the "uncompressed" prefix (0x04) from the public key
    const validators = wallets.map(
      (wallet) => `0x${wallet.signingKey.publicKey.slice(4)}`
    );
    const votingPowers = Array(wallets.length).fill(1_000_000);
    votingPowers[0] = 75_000_000;
    votingPowers[1] = 25_000_000;
    votingPowers[2] = 25_000_000;
    votingPowers[3] = 25_000_000;

    const validatorLeaves = validators.map((validator, index) =>
      computeValidatorLeafHash(validator, votingPowers[index])
    );

    // Validators: Create merkle tree and proofs
    const validatorTree = SimpleMerkleTree.of(validatorLeaves, {
      sortLeaves: true,
    });
    const validatorProofs = validators.map((validator, index) => {
      const proof = validatorTree.getProof(index);
      return {
        publicKey: validator,
        votingPower: votingPowers[index],
        merkleProof: proof,
      };
    });

    // Create initial batch
    const initialBatch = {
      batchHeight: 0,
      blockHeight: 0,
      validatorRoot: validatorTree.root,
      resultsRoot: ethers.ZeroHash,
      provingMetadata: ethers.ZeroHash,
    };

    const data = {
      initialBatch,
      validatorProofs,
    };

    // Deploy the SedaDataTypes library first
    const DataTypesFactory = await ethers.getContractFactory('SedaDataTypes');
    const dataTypes = await DataTypesFactory.deploy();

    // Deploy the contract
    const ProverFactory = await ethers.getContractFactory('Secp256k1Prover', {
      libraries: {
        SedaDataTypes: await dataTypes.getAddress(),
      },
    });
    const prover = await ProverFactory.deploy(initialBatch);

    return { prover, wallets, data };
  }

  describe('getCurrentBatch', () => {
    it('should return the current batch', async () => {
      const {
        prover,
        data: { initialBatch },
      } = await loadFixture(deployProverFixture);
      const currentBatch = await prover.currentBatch();
      compareBatches(currentBatch, initialBatch);
    });
  });

  describe('postBatch', () => {
    it('should update a batch with 1 validator (75% voting power)', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = [
        await wallets[0].signingKey.sign(newBatchId).serialized,
      ];
      await prover.postBatch(newBatch, signatures, [proofs[0]]);

      const updatedBatch = await prover.currentBatch();
      expect(updatedBatch.batchHeight).to.equal(1);
    });

    it('should update a batch with 3 validators (75% voting power)', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = await Promise.all(
        wallets
          .slice(1)
          .map((wallet) => wallet.signingKey.sign(newBatchId).serialized)
      );

      await prover.postBatch(newBatch, signatures, proofs.slice(1));

      const updatedBatch = await prover.currentBatch();
      compareBatches(updatedBatch, newBatch);
    });

    it('should emit a BatchUpdated event', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = [
        await wallets[0].signingKey.sign(newBatchId).serialized,
      ];

      await expect(prover.postBatch(newBatch, signatures, [proofs[0]]))
        .to.emit(prover, 'BatchPosted')
        .withArgs(newBatch.batchHeight, newBatchId);

      const updatedBatch = await prover.currentBatch();
      compareBatches(updatedBatch, newBatch);
    });

    it('should fail to update a batch with 1 validator (25% voting power)', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = [
        await wallets[1].signingKey.sign(newBatchId).serialized,
      ];

      await expect(
        prover.postBatch(newBatch, signatures, [proofs[1]])
      ).to.be.revertedWithCustomError(prover, 'ConsensusNotReached');

      const currentBatch = await prover.currentBatch();
      expect(currentBatch.batchHeight).to.equal(0);
    });

    it('should fail to update a batch if mismatching signatures and proofs', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = [
        await wallets[0].signingKey.sign(newBatchId).serialized,
      ];

      await expect(
        prover.postBatch(newBatch, signatures, proofs)
      ).to.be.revertedWithCustomError(prover, 'MismatchedSignaturesAndProofs');
    });

    it('should fail to update a batch if invalid merkle proof', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = [
        await wallets[0].signingKey.sign(newBatchId).serialized,
      ];
      const invalidProofs = [
        {
          ...proofs[0],
          merkleProof: [],
        },
      ];

      await expect(
        prover.postBatch(newBatch, signatures, invalidProofs)
      ).to.be.revertedWithCustomError(prover, 'InvalidValidatorProof');
    });

    it('should fail to update a batch if invalid signature', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = [
        await wallets[1].signingKey.sign(newBatchId).serialized,
      ];

      await expect(
        prover.postBatch(newBatch, signatures, [proofs[0]])
      ).to.be.revertedWithCustomError(prover, 'InvalidSignature');
    });

    it('should fail to update a batch with lower batch height', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      newBatch.batchHeight = 0; // Set to current batch height
      const signatures = [
        await wallets[0].signingKey.sign(newBatchId).serialized,
      ];

      await expect(
        prover.postBatch(newBatch, signatures, [proofs[0]])
      ).to.be.revertedWithCustomError(prover, 'InvalidBatchHeight');
    });

    it('should fail to update a batch with lower block height', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      newBatch.blockHeight = 0; // Set to current block height
      const signatures = [
        await wallets[0].signingKey.sign(newBatchId).serialized,
      ];

      await expect(
        prover.postBatch(newBatch, signatures, [proofs[0]])
      ).to.be.revertedWithCustomError(prover, 'InvalidBlockHeight');
    });

    it('should update a batch with all validators (100% voting power)', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await loadFixture(deployProverFixture);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = await Promise.all(
        wallets.map((wallet) => wallet.signingKey.sign(newBatchId).serialized)
      );

      await prover.postBatch(newBatch, signatures, proofs);

      const updatedBatch = await prover.currentBatch();
      compareBatches(updatedBatch, newBatch);
    });
  });

  describe('verifyResultProof', () => {
    it('should verify a valid result proof', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      // Generate a mock result and its proof
      const { results } = generateDataFixtures(10);
      const resultIds = results.slice(-2).map(deriveDataResultId);
      const resultLeaves = resultIds.map(computeResultLeafHash);
      const resultsTree = SimpleMerkleTree.of(resultLeaves);
      const newBatch = {
        batchHeight: 1,
        blockHeight: 1,
        validatorRoot: ethers.ZeroHash,
        resultsRoot: resultsTree.root,
        provingMetadata: ethers.ZeroHash,
      };
      const newBatchId = deriveBatchId(newBatch);

      // Update the batch
      const signatures = [
        await wallets[0].signingKey.sign(newBatchId).serialized,
      ];
      await prover.postBatch(newBatch, signatures, [data.validatorProofs[0]]);

      // Verify a valid proof
      const resultId = resultIds[1];
      const proof = resultsTree.getProof(1);
      const isValid = await prover.verifyResultProof(resultId, proof);
      expect(isValid).to.be.true;
    });

    it('should reject an invalid result proof', async () => {
      const { prover, wallets, data } = await loadFixture(deployProverFixture);

      // Generate a mock result and its proof
      const { results } = generateDataFixtures(10);
      const resultIds = results.slice(-2).map(deriveDataResultId);
      const resultLeaves = resultIds.map(computeResultLeafHash);
      const resultsTree = SimpleMerkleTree.of(resultLeaves);
      const newBatch = {
        batchHeight: 1,
        blockHeight: 1,
        validatorRoot: ethers.ZeroHash,
        resultsRoot: resultsTree.root,
        provingMetadata: ethers.ZeroHash,
      };
      const newBatchId = deriveBatchId(newBatch);

      // Update the batch
      const signatures = [
        await wallets[0].signingKey.sign(newBatchId).serialized,
      ];
      await prover.postBatch(newBatch, signatures, [data.validatorProofs[0]]);

      // Verify a proof for the wrong result ID
      const resultId = resultIds[0];
      const proof = resultsTree.getProof(1);
      const isValid = await prover.verifyResultProof(resultId, proof);
      expect(isValid).to.be.false;
    });
  });
});
