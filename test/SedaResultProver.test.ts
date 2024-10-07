import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';

import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('SedaResultProver', () => {
  async function deployProverFixture() {
    const dataResults = [
      {
        version: '0.0.1',
        drId: ethers.keccak256(ethers.toUtf8Bytes('DR_1')),
        consensus: true,
        exitCode: 0,
        result: ethers.keccak256(ethers.toUtf8Bytes('SUCCESS')),
        blockHeight: 0,
        gasUsed: 0,
        paybackAddress: ethers.ZeroAddress,
        sedaPayload: ethers.ZeroHash,
      },
      {
        version: '0.0.1',
        drId: ethers.keccak256(ethers.toUtf8Bytes('DR_2')),
        consensus: true,
        exitCode: 2,
        result: ethers.keccak256(ethers.toUtf8Bytes('SUCCESS')),
        blockHeight: 0,
        gasUsed: 0,
        paybackAddress: ethers.ZeroAddress,
        sedaPayload: ethers.ZeroHash,
      },
    ];

    const leaves = dataResults.map(deriveDataResultId);

    // Create merkle tree and proofs
    const tree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
    const data = dataResults.map((dataResult, index) => {
      const merkleProof = tree.getProof(index);
      return {
        dataResult,
        merkleProof,
      };
    });

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
    const ProverFactory = await ethers.getContractFactory('SedaK256Prover', {
      libraries: {
        SedaDataTypes: await dataTypes.getAddress(),
      },
    });
    const batchProver = await ProverFactory.deploy(initialBatch);

    const ResultProverFactory = await ethers.getContractFactory(
      'SedaResultProver',
      {
        libraries: {
          SedaDataTypes: await dataTypes.getAddress(),
        },
      }
    );
    const resultProver = await ResultProverFactory.deploy(
      batchProver.getAddress()
    );

    return { batchProver, resultProver, data };
  }

  it('should successfully verify a data result ID using the batch prover', async () => {
    const { batchProver, data } = await loadFixture(deployProverFixture);

    // Use the merkle proof from data[1] for data[0]
    const result = await batchProver._verifyDataResultProof(
      deriveDataResultId(data[0].dataResult),
      data[0].merkleProof
    );

    expect(result).to.be.true;
  });

  it('should successfully post a data result with valid proof', async () => {
    const { resultProver, data } = await loadFixture(deployProverFixture);

    await resultProver.postDataResult(data[0].dataResult, data[0].merkleProof);
  });

  it('should fail to post a data result with invalid proof', async () => {
    const { resultProver, data } = await loadFixture(deployProverFixture);

    // Use the merkle proof from data[1] for data[0]
    await expect(
      resultProver.postDataResult(data[0].dataResult, data[1].merkleProof)
    ).to.be.revertedWith('Invalid data result proof');
  });

  it('should fail to post a data result that has already been posted', async () => {
    const { resultProver, data } = await loadFixture(deployProverFixture);

    // Post the data result for the first time
    await resultProver.postDataResult(data[0].dataResult, data[0].merkleProof);

    // Attempt to post the same data result again
    await expect(
      resultProver.postDataResult(data[0].dataResult, data[0].merkleProof)
    ).to.be.revertedWith('Data result already posted');
  });

  it('should fail to post a data result with mismatched data', async () => {
    const { resultProver, data } = await loadFixture(deployProverFixture);

    // Modify the data result but keep the original merkle proof
    const modifiedDataResult = { ...data[0].dataResult, exitCode: 1 };

    await expect(
      resultProver.postDataResult(modifiedDataResult, data[0].merkleProof)
    ).to.be.revertedWith('Invalid data result proof');
  });

  it('should fail to verify a data result ID with invalid proof using the batch prover', async () => {
    const { batchProver, data } = await loadFixture(deployProverFixture);

    // Use the merkle proof from data[1] for data[0]
    const result = await batchProver._verifyDataResultProof(
      deriveDataResultId(data[0].dataResult),
      data[1].merkleProof
    );

    expect(result).to.be.false;
  });
});

function deriveDataResultId(dataResult: {
  version: string;
  drId: string;
  consensus: boolean;
  exitCode: number;
  result: string;
  blockHeight: number;
  gasUsed: number;
  paybackAddress: string;
  sedaPayload: string;
}): string {
  return ethers.keccak256(
    ethers.concat([
      ethers.keccak256(ethers.toUtf8Bytes('0.0.1')), // Hash the version string
      dataResult.drId,
      dataResult.consensus ? new Uint8Array([1]) : new Uint8Array([0]),
      new Uint8Array([dataResult.exitCode]),
      ethers.keccak256(dataResult.result),
      ethers.zeroPadValue(ethers.toBeArray(BigInt(dataResult.blockHeight)), 8),
      ethers.zeroPadValue(ethers.toBeArray(BigInt(dataResult.gasUsed)), 8),
      ethers.keccak256(dataResult.paybackAddress),
      ethers.keccak256(dataResult.sedaPayload),
    ])
  );
}
