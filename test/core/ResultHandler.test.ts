import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';

import { compareResults } from '../helpers';
import { computeResultLeafHash, deriveDataResultId, generateDataFixtures } from '../utils';

describe('ResultHandler', () => {
  async function deployResultHandlerFixture() {
    const { requests, results } = generateDataFixtures(2);
    const leaves = results.map(deriveDataResultId).map(computeResultLeafHash);

    // Create merkle tree and proofs
    const tree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
    const proofs = results.map((_, index) => {
      return tree.getProof(index);
    });

    const data = {
      requests,
      results,
      proofs,
    };

    // Create initial batch with data results
    const initialBatch = {
      batchHeight: 0,
      blockHeight: 0,
      validatorsRoot: ethers.ZeroHash,
      resultsRoot: tree.root,
      provingMetadata: ethers.ZeroHash,
    };

    // Deploy the contract
    const ProverFactory = await ethers.getContractFactory('Secp256k1ProverV1');
    const prover = await upgrades.deployProxy(ProverFactory, [initialBatch], { initializer: 'initialize' });
    await prover.waitForDeployment();

    const CoreFactory = await ethers.getContractFactory('SedaCoreV1');
    const core = await upgrades.deployProxy(CoreFactory, [await prover.getAddress()], { initializer: 'initialize' });
    await core.waitForDeployment();

    return { core, data };
  }

  describe('deriveResultId', () => {
    it('should generate consistent data result IDs', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultIdFromUtils = deriveDataResultId(data.results[0]);
      const resultId = await core.deriveResultId.staticCall(data.results[0]);

      expect(resultId).to.equal(resultIdFromUtils);
    });

    it('should generate different IDs for different results', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const id1 = await core.deriveResultId.staticCall(data.results[0]);
      const id2 = await core.deriveResultId.staticCall(data.results[1]);

      expect(id1).to.not.equal(id2);
    });
  });

  describe('postResult', () => {
    it('should successfully post a result and read it back', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      await core.postResult(data.results[0], 0, data.proofs[0]);

      const postedResult = await core.getResult(data.results[0].drId);
      compareResults(postedResult, data.results[0]);
    });

    it('should fail to post a result that already exists', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      await core.postResult(data.results[0], 0, data.proofs[0]);

      const resultId = deriveDataResultId(data.results[0]);
      await expect(core.postResult(data.results[0], 0, data.proofs[0]))
        .to.be.revertedWithCustomError(core, 'ResultAlreadyExists')
        .withArgs(resultId);
    });

    it('should fail to post a result with invalid proof', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = deriveDataResultId(data.results[1]);
      await expect(core.postResult(data.results[1], 0, data.proofs[0]))
        .to.be.revertedWithCustomError(core, 'InvalidResultProof')
        .withArgs(resultId);
    });

    it('should emit a ResultPosted event', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      await expect(core.postResult(data.results[0], 0, data.proofs[0]))
        .to.emit(core, 'ResultPosted')
        .withArgs(deriveDataResultId(data.results[0]));
    });

    it('should fail to post a result with empty proof', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = deriveDataResultId(data.results[0]);
      await expect(core.postResult(data.results[0], 0, []))
        .to.be.revertedWithCustomError(core, 'InvalidResultProof')
        .withArgs(resultId);
    });

    it('should fail to post a result with invalid drId', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const invalidResult = { ...data.results[0], drId: ethers.ZeroHash };
      const resultId = deriveDataResultId(invalidResult);
      await expect(core.postResult(invalidResult, 0, data.proofs[0]))
        .to.be.revertedWithCustomError(core, 'InvalidResultProof')
        .withArgs(resultId);
    });
  });

  describe('getResult', () => {
    it('should revert with ResultNotFound for non-existent result id', async () => {
      const { core } = await loadFixture(deployResultHandlerFixture);

      const nonExistentId = ethers.ZeroHash;
      await expect(core.getResult(nonExistentId))
        .to.be.revertedWithCustomError(core, 'ResultNotFound')
        .withArgs(nonExistentId);
    });

    it('should return the correct result for an existing result id', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      await core.postResult(data.results[0], 0, data.proofs[0]);
      const retrievedResult = await core.getResult(data.results[0].drId);

      compareResults(retrievedResult, data.results[0]);
    });

    it('should return the correct result for multiple posted results', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      // Post two results
      await core.postResult(data.results[0], 0, data.proofs[0]);
      await core.postResult(data.results[1], 0, data.proofs[1]);

      // Retrieve and verify both results
      const retrievedResult1 = await core.getResult(data.results[0].drId);
      const retrievedResult2 = await core.getResult(data.results[1].drId);

      compareResults(retrievedResult1, data.results[0]);
      compareResults(retrievedResult2, data.results[1]);

      // Try to get a non-existent result
      const nonExistentId = ethers.randomBytes(32);
      await expect(core.getResult(nonExistentId))
        .to.be.revertedWithCustomError(core, 'ResultNotFound')
        .withArgs(nonExistentId);
    });
  });

  describe('verifyResult', () => {
    it('should successfully verify a valid result', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = await core.verifyResult(data.results[0], 0, data.proofs[0]);
      expect(resultId).to.equal(deriveDataResultId(data.results[0]));
    });

    it('should fail to verify a result with invalid proof', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = deriveDataResultId(data.results[1]);
      await expect(core.verifyResult(data.results[1], 0, data.proofs[0]))
        .to.be.revertedWithCustomError(core, 'InvalidResultProof')
        .withArgs(resultId);
    });
  });
});
