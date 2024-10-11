import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { compareResults } from './helpers';
import {
  computeResultLeafHash,
  deriveDataResultId,
  generateDataFixtures,
} from './utils';

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
      validatorRoot: ethers.ZeroHash,
      resultsRoot: tree.root,
      provingMetadata: ethers.ZeroHash,
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

    const ResultHandlerFactory = await ethers.getContractFactory(
      'ResultHandler',
      {
        libraries: {
          SedaDataTypes: await dataTypes.getAddress(),
        },
      }
    );
    const handler = await ResultHandlerFactory.deploy(prover.getAddress());

    return { handler, data };
  }

  describe('deriveResultId', () => {
    it('should generate consistent data result IDs', async () => {
      const { handler, data } = await loadFixture(deployResultHandlerFixture);

      const resultIdFromUtils = deriveDataResultId(data.results[0]);
      const resultId = await handler.deriveResultId.staticCall(data.results[0]);

      expect(resultId).to.equal(resultIdFromUtils);
    });

    it('should generate different IDs for different results', async () => {
      const { handler, data } = await loadFixture(deployResultHandlerFixture);

      const id1 = await handler.deriveResultId.staticCall(data.results[0]);
      const id2 = await handler.deriveResultId.staticCall(data.results[1]);

      expect(id1).to.not.equal(id2);
    });
  });

  describe('postResult', () => {
    it('should successfully post a result and read it back', async () => {
      const { handler, data } = await loadFixture(deployResultHandlerFixture);

      await handler.postResult(data.results[0], data.proofs[0]);

      const postedResult = await handler.getResult(data.results[0].drId);
      compareResults(postedResult, data.results[0]);
    });

    it('should fail to post a result that already exists', async () => {
      const { handler, data } = await loadFixture(deployResultHandlerFixture);

      await handler.postResult(data.results[0], data.proofs[0]);

      const resultId = deriveDataResultId(data.results[0]);
      await expect(handler.postResult(data.results[0], data.proofs[0]))
        .to.be.revertedWithCustomError(handler, 'ResultAlreadyPosted')
        .withArgs(resultId);
    });

    it('should fail to post a result with invalid proof', async () => {
      const { handler, data } = await loadFixture(deployResultHandlerFixture);

      const resultId = deriveDataResultId(data.results[1]);
      await expect(handler.postResult(data.results[1], data.proofs[0]))
        .to.be.revertedWithCustomError(handler, 'InvalidResultProof')
        .withArgs(resultId);
    });

    it('should emit a ResultPosted event', async () => {
      const { handler, data } = await loadFixture(deployResultHandlerFixture);

      await expect(handler.postResult(data.results[0], data.proofs[0]))
        .to.emit(handler, 'ResultPosted')
        .withArgs(deriveDataResultId(data.results[0]));
    });
  });

  describe('getResult', () => {
    it('should return an empty result for non-existent result id', async () => {
      const { handler } = await loadFixture(deployResultHandlerFixture);

      const nonExistentResultId = ethers.ZeroHash;
      const emptyResult = await handler.getResult(nonExistentResultId);

      expect(emptyResult.version).to.empty;
      expect(emptyResult.drId).to.equal(ethers.ZeroHash);
      expect(emptyResult.consensus).to.be.false;
      expect(emptyResult.exitCode).to.equal(0);
      expect(emptyResult.result).to.equal('0x');
      expect(emptyResult.blockHeight).to.equal(0);
      expect(emptyResult.gasUsed).to.equal(0);
      expect(emptyResult.paybackAddress).to.equal('0x');
      expect(emptyResult.sedaPayload).to.equal('0x');
    });

    it('should return the correct result for an existing result id', async () => {
      const { handler, data } = await loadFixture(deployResultHandlerFixture);

      await handler.postResult(data.results[0], data.proofs[0]);
      const retrievedResult = await handler.getResult(data.results[0].drId);

      compareResults(retrievedResult, data.results[0]);
    });
  });
});
