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
  async function deployProverFixture() {
    // Create wallets from the given private keys in decimal format
    const privateKeysDec = [
      '19364754072319078679550301671505040179035858431960811629105035944776133510182',
      '68619014097430004589532778183241588574857414830238493947312392711069044622953',
      '58435399889922176161880059996414222578881241975318132253376082907538942305313',
      '64770165991303981399885074754284222540880024302873026014683458694822777728452',
    ];

    const wallets = privateKeysDec.map((pkDec) => {
      const pkHex = BigInt(pkDec).toString(16).padStart(64, '0');
      return new ethers.Wallet(`0x${pkHex}`);
    });

    // // Alternative way to generate wallets
    // const wallets = Array.from({ length: 4 }, (_, i) => {
    //     const seed = ethers.id(`validator${i}`);
    //     return new ethers.Wallet(seed.slice(2, 66));
    // });

    const validators = wallets.map((wallet) => wallet.address);
    const votingPowers = [75_000_000, 25_000_000, 25_000_000, 25_000_000];

    const validatorLeaves = validators.map(
      (validator, index) =>
        computeValidatorLeafHash(validator, votingPowers[index])
      // ethers.solidityPackedKeccak256(
      //   ['string', 'address', 'uint32'],
      //   ['SECP256K1', validator, votingPowers[index]]
      // )
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

  describe('updateBatch', () => {
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
      await prover.updateBatch(newBatch, signatures, [proofs[0]]);

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

      await prover.updateBatch(newBatch, signatures, proofs.slice(1));

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

      await expect(prover.updateBatch(newBatch, signatures, [proofs[0]]))
        .to.emit(prover, 'BatchUpdated')
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
        prover.updateBatch(newBatch, signatures, [proofs[1]])
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
        prover.updateBatch(newBatch, signatures, proofs)
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
        prover.updateBatch(newBatch, signatures, invalidProofs)
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
        prover.updateBatch(newBatch, signatures, [proofs[0]])
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
        prover.updateBatch(newBatch, signatures, [proofs[0]])
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
        prover.updateBatch(newBatch, signatures, [proofs[0]])
      ).to.be.revertedWithCustomError(prover, 'InvalidBlockHeight');
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
      await prover.updateBatch(newBatch, signatures, [data.validatorProofs[0]]);

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
      await prover.updateBatch(newBatch, signatures, [data.validatorProofs[0]]);

      // Verify a proof for the wrong result ID
      const resultId = resultIds[0];
      const proof = resultsTree.getProof(1);
      const isValid = await prover.verifyResultProof(resultId, proof);
      expect(isValid).to.be.false;
    });
  });
});
