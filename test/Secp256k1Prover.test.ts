import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  computeResultLeafHash,
  computeValidatorLeafHash,
  deriveBatchId,
  deriveDataResultId,
  generateBatchWithId,
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

    const validators = wallets.map((wallet) => wallet.address);
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
    const validatorProofs = validators.map((signer, index) => {
      const proof = validatorTree.getProof(index);
      return {
        signer,
        votingPower: votingPowers[index],
        merkleProof: proof,
      };
    });

    // Results: Create merkle tree and proofs
    const { requests, results } = generateDataFixtures(2);
    const resultsLeaves = results
      .map(deriveDataResultId)
      .map(computeResultLeafHash);

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
      validatorRoot: validatorTree.root,
      resultsRoot: resultsTree.root,
      provingMetadata: ethers.ZeroHash,
    };

    const data = {
      initialBatch,
      validatorProofs,
      resultProofs,
      requests,
      results,
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
      const currentBatch = await prover.getCurrentBatch();
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

      const lastBatch = await prover.getCurrentBatch();
      compareBatches(lastBatch, newBatch);
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

      const lastBatch = await prover.getCurrentBatch();
      compareBatches(lastBatch, newBatch);
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

      const lastBatchHeight = (await prover.getCurrentBatch()).batchHeight;
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
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

      const lastBatchHeight = (await prover.getCurrentBatch()).batchHeight;
      expect(lastBatchHeight).to.equal(0);
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

      const lastBatchHeight = (await prover.getCurrentBatch()).batchHeight;
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
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

  describe('gas analysis', () => {
    // Worst case scenario: 67 validators (each validator has 1%, but we only need 2/3 of them to update a batch)
    it('67 validators', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await deployProverFixture(67);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = await Promise.all(
        wallets.map((wallet) => wallet.signingKey.sign(newBatchId).serialized)
      );

      await prover.postBatch(newBatch, signatures, proofs);

      const lastBatchHeight = (await prover.getCurrentBatch()).batchHeight;
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
    });

    // Average case scenario: 20 validators (chains usually have 20 validators holding > 2/3 of the voting power)
    it('20 validators', async () => {
      const {
        prover,
        wallets,
        data: { validatorProofs: proofs },
      } = await deployProverFixture(100);

      const { newBatchId, newBatch } = generateNewBatchWithId();
      const signatures = await Promise.all(
        wallets.map((wallet) => wallet.signingKey.sign(newBatchId).serialized)
      );

      await prover.postBatch(
        newBatch,
        signatures.slice(0, 20),
        proofs.slice(0, 20)
      );

      const lastBatchHeight = (await prover.getCurrentBatch()).batchHeight;
      expect(lastBatchHeight).to.equal(newBatch.batchHeight);
    });
  });

  describe('postBatch (multiple batch support)', () => {
    it('should post several batches sequentially and verify result proofs', async () => {
      const { prover, wallets, data } = await deployProverFixture(100);

      // Helper function to post a batch
      async function postBatch(batchHeight: number, resultsRoot: string) {
        const { newBatchId, newBatch } = generateBatchWithId(
          batchHeight,
          batchHeight,
          data.initialBatch.validatorRoot,
          resultsRoot,
          ethers.ZeroHash
        );

        const signatures = await Promise.all(
          wallets
            .slice(0, 20)
            .map((wallet) => wallet.signingKey.sign(newBatchId).serialized)
        );

        await prover.postBatch(
          newBatch,
          signatures,
          data.validatorProofs.slice(0, 20)
        );

        const lastBatchHeight = await prover.lastBatchHeight();
        expect(lastBatchHeight).to.be.equal(newBatch.batchHeight);
      }

      // Helper function to verify result proof for a range of batches
      async function verifyResultProofRange(
        start: number,
        end: number,
        expectedResult: boolean
      ) {
        for (let i = start; i <= end; i++) {
          expect(
            await prover.verifyResultProofForBatch(
              i,
              deriveDataResultId(data.results[0]),
              data.resultProofs[0]
            )
          ).to.equal(expectedResult);
        }
      }

      // Post initial batches with valid results root
      for (let i = 1; i <= 9; i++) {
        await postBatch(i, data.initialBatch.resultsRoot);
      }

      // Verify result proof is valid
      expect(
        await prover.verifyResultProof(
          deriveDataResultId(data.results[0]),
          data.resultProofs[0]
        )
      ).to.be.true;

      // Post batches with zero results root
      for (let i = 10; i <= 15; i++) {
        await postBatch(i, ethers.ZeroHash);
      }

      // Verify result proof is invalid because of new batches with zero results root
      expect(
        await prover.verifyResultProof(
          deriveDataResultId(data.results[0]),
          data.resultProofs[0]
        )
      ).to.be.false;

      // Verify result proofs for different batch ranges
      await verifyResultProofRange(0, 5, true);
      await verifyResultProofRange(6, 9, true);
      await verifyResultProofRange(10, 15, false);

      // Post more batches with zero results root
      for (let i = 16; i <= 100; i++) {
        await postBatch(i, ethers.ZeroHash);
      }

      // Verify result proof is now invalid (too many batches with zero results root)
      expect(
        await prover.verifyResultProof(
          deriveDataResultId(data.results[0]),
          data.resultProofs[0]
        )
      ).to.be.false;

      // Post final batches with valid results root
      for (let i = 101; i <= 200; i++) {
        await postBatch(i, data.initialBatch.resultsRoot);
      }

      // Final verification
      expect(
        await prover.verifyResultProof(
          deriveDataResultId(data.results[0]),
          data.resultProofs[0]
        )
      ).to.be.true;
    });
  });
});
