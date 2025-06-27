import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { compareResults } from '../helpers/assertions';
import { deployWithOptions } from '../helpers/fixtures';
import { deriveResultId } from '../utils/crypto';

describe('ResultHandler', () => {
  async function deployResultHandlerFixture() {
    const { core, data } = await deployWithOptions({ requests: 2 });
    return { core, data };
  }

  describe('deriveResultId', () => {
    it('generates consistent result IDs', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultIdFromUtils = deriveResultId(data.results[0]);
      const resultId = await core.deriveResultId.staticCall(data.results[0]);

      expect(resultId).to.equal(resultIdFromUtils);
    });

    it('generates unique IDs for different results', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const id1 = await core.deriveResultId.staticCall(data.results[0]);
      const id2 = await core.deriveResultId.staticCall(data.results[1]);

      expect(id1).to.not.deep.equal(id2);
    });
  });

  describe('postResult', () => {
    it('posts result and retrieves it successfully', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      await core.postResult(data.results[0], 0, data.resultProofs[0]);

      const postedResult = await core.getResult(data.results[0].drId);
      compareResults(postedResult, data.results[0]);
    });

    it('reverts when posting duplicate result', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      await core.postResult(data.results[0], 0, data.resultProofs[0]);

      await expect(core.postResult(data.results[0], 0, data.resultProofs[0]))
        .to.be.revertedWithCustomError(core, 'ResultAlreadyExists')
        .withArgs(data.results[0].drId);
    });

    it('reverts when proof is invalid', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = deriveResultId(data.results[1]);
      await expect(core.postResult(data.results[1], 0, data.resultProofs[0]))
        .to.be.revertedWithCustomError(core, 'InvalidResultProof')
        .withArgs(resultId);
    });

    it('emits ResultPosted event', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      await expect(core.postResult(data.results[0], 0, data.resultProofs[0]))
        .to.emit(core, 'ResultPosted')
        .withArgs(data.results[0].drId, deriveResultId(data.results[0]));
    });

    it('reverts when proof is empty', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = deriveResultId(data.results[0]);
      await expect(core.postResult(data.results[0], 0, []))
        .to.be.revertedWithCustomError(core, 'InvalidResultProof')
        .withArgs(resultId);
    });

    it('reverts when drId is invalid', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const invalidResult = { ...data.results[0], drId: ethers.ZeroHash };
      const resultId = deriveResultId(invalidResult);
      await expect(core.postResult(invalidResult, 0, data.resultProofs[0]))
        .to.be.revertedWithCustomError(core, 'InvalidResultProof')
        .withArgs(resultId);
    });
  });

  describe('getResult', () => {
    it('reverts for non-existent result', async () => {
      const { core } = await loadFixture(deployResultHandlerFixture);

      const nonExistentId = ethers.ZeroHash;
      await expect(core.getResult(nonExistentId))
        .to.be.revertedWithCustomError(core, 'ResultNotFound')
        .withArgs(nonExistentId);
    });

    it('retrieves existing result correctly', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      await core.postResult(data.results[0], 0, data.resultProofs[0]);
      const retrievedResult = await core.getResult(data.results[0].drId);

      compareResults(retrievedResult, data.results[0]);
    });

    it('retrieves multiple results correctly', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      // Post two results
      await core.postResult(data.results[0], 0, data.resultProofs[0]);
      await core.postResult(data.results[1], 0, data.resultProofs[1]);

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
    it('verifies valid result successfully', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = await core.verifyResult(data.results[0], 0, data.resultProofs[0]);
      expect(resultId).to.equal(deriveResultId(data.results[0]));
    });

    it('reverts when proof is invalid', async () => {
      const { core, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = deriveResultId(data.results[1]);
      await expect(core.verifyResult(data.results[1], 0, data.resultProofs[0]))
        .to.be.revertedWithCustomError(core, 'InvalidResultProof')
        .withArgs(resultId);
    });
  });
});
