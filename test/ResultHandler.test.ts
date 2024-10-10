import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';

import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  deriveDataResultId,
  deriveRequestId,
  generateRequestsAndResults,
} from './utils';

describe('ResultHandler', () => {
  async function deployProverFixture() {
    const { requests, results } = generateRequestsAndResults(2);
    const leaves = results.map(deriveDataResultId);

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

    const ResultHandlerFactory = await ethers.getContractFactory('SedaCoreV1', {
      libraries: {
        SedaDataTypes: await dataTypes.getAddress(),
      },
    });
    const handler = await ResultHandlerFactory.deploy(prover.getAddress());

    return { handler, data };
  }

  it('should generate consistent data result IDs', async () => {
    const { handler, data } = await loadFixture(deployProverFixture);

    const resultIdFromUtils = deriveDataResultId(data.results[0]);
    const resultId = await handler.deriveResultId.staticCall(data.results[0]);

    expect(resultId).to.equal(resultIdFromUtils);
  });

  it('should successfully post a data result with valid proof', async () => {
    const { handler, data } =
      await loadFixture(deployProverFixture);

    await handler.postResult(data.results[0], data.proofs[0]);
  });

  it('should fail to post a data result with invalid proof', async () => {
    const { handler, data } =
      await loadFixture(deployProverFixture);

    // Use the merkle proof from data[1] for data[0]
    await expect(
      handler.postResult(data.results[1], data.proofs[0])
    ).to.be.revertedWith('Invalid data result proof');
  });

  it('should fail to post a data result that has already been posted', async () => {
    const { handler, data } =
      await loadFixture(deployProverFixture);

    // Post the data result for the first time
    await handler.postResult(data.results[0], data.proofs[0]);

    // Attempt to post the same data result again
    await expect(
      handler.postResult(data.results[0], data.proofs[0])
    ).to.be.revertedWith('Data result already posted');
  });

  it('should fail to post a data result with mismatched data', async () => {
    const { handler, data } =
      await loadFixture(deployProverFixture);

    // Modify the data result but keep the original merkle proof
    const modifiedDataResult = { ...data.results[0], exitCode: 1 };

    await expect(
      handler.postResult(modifiedDataResult, data.proofs[0])
    ).to.be.revertedWith('Invalid data result proof');
  });

  it('should successfully post a data result and read it back', async () => {
    const { handler, data } =
      await loadFixture(deployProverFixture);

    // Post the data result
    await handler.postResult(data.results[0], data.proofs[0]);

    // Read the posted result
    const postedResult = await handler.getResult(data.results[0].drId);

    // Verify that the posted result matches the original data
    expect(postedResult.version).to.equal(data.results[0].version);
    expect(postedResult.drId).to.equal(data.results[0].drId);
    expect(postedResult.consensus).to.equal(data.results[0].consensus);
    expect(postedResult.exitCode).to.equal(data.results[0].exitCode);
    expect(postedResult.result).to.equal(data.results[0].result);
    expect(postedResult.blockHeight).to.equal(data.results[0].blockHeight);
    expect(postedResult.gasUsed).to.equal(data.results[0].gasUsed);
    expect(postedResult.paybackAddress).to.equal(
      data.results[0].paybackAddress
    );
    expect(postedResult.sedaPayload).to.equal(data.results[0].sedaPayload);
  });

});
