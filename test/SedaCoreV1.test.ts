import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';

import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  deriveDataResultId,
  deriveRequestId,
  generateRequestsAndResults,
} from './utils';

describe('SedaCoreV1', () => {
  async function deployProverFixture() {
    const { requests, results } = generateRequestsAndResults(4);
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

    const CoreFactory = await ethers.getContractFactory('SedaCoreV1', {
      libraries: {
        SedaDataTypes: await dataTypes.getAddress(),
      },
    });
    const core = await CoreFactory.deploy(prover.getAddress());

    return { prover, core, data };
  }

  it('should add request to requestIds when posting a request', async () => {
    const { core } = await loadFixture(deployProverFixture);

    const requestInputs = {
      execProgramId: ethers.randomBytes(32),
      execInputs: ethers.randomBytes(64),
      tallyProgramId: ethers.randomBytes(32),
      tallyInputs: ethers.randomBytes(64),
      replicationFactor: 3,
      consensusFilter: ethers.randomBytes(32),
      gasPrice: ethers.parseUnits('1', 'gwei'),
      gasLimit: 1000000,
      memo: ethers.toUtf8Bytes('Test request'),
    };

    const requestId = await core.postRequest.staticCall(requestInputs);
    await core.postRequest(requestInputs);

    const requests = await core.getRequests(0, 1);
    expect(requests.length).to.equal(1);
    expect(requests[0]).to.equal(requestId);
  });

  it('should return multiple requests when more than one request is posted', async () => {
    const { core } = await loadFixture(deployProverFixture);

    const requestInputs1 = {
      execProgramId: ethers.randomBytes(32),
      execInputs: ethers.randomBytes(64),
      tallyProgramId: ethers.randomBytes(32),
      tallyInputs: ethers.randomBytes(64),
      replicationFactor: 3,
      consensusFilter: ethers.randomBytes(32),
      gasPrice: ethers.parseUnits('1', 'gwei'),
      gasLimit: 1000000,
      memo: ethers.toUtf8Bytes('Test request 1'),
    };

    const requestInputs2 = {
      ...requestInputs1,
      memo: ethers.toUtf8Bytes('Test request 2'),
    };

    const requestId1 = await core.postRequest.staticCall(requestInputs1);
    await core.postRequest(requestInputs1);

    const requestId2 = await core.postRequest.staticCall(requestInputs2);
    await core.postRequest(requestInputs2);

    const requests = await core.getRequests(0, 2);
    expect(requests.length).to.equal(2);
    expect(requests).to.include(requestId1);
    expect(requests).to.include(requestId2);
  });

  it('should remove request from requestIds when posting a result', async () => {
    const { core, data } = await loadFixture(deployProverFixture);

    await core.postRequest(data.requests[0]);

    let getRequestsResponse = await core.getRequests(0, 1);
    expect(getRequestsResponse.length).to.equal(1);
    expect(getRequestsResponse[0]).to.equal(
      deriveRequestId(data.requests[0])
    );

    await core.postResult(data.results[0], data.proofs[0]);

    getRequestsResponse = await core.getRequests(0, 1);
    expect(getRequestsResponse.length).to.equal(0);
  });

  it('should update getRequests after posting requests and results', async () => {
    const { core, data } = await loadFixture(deployProverFixture);

    const requestId1 = await core.postRequest.staticCall(data.requests[0]);
    await core.postRequest(data.requests[0]);

    const requestId2 = await core.postRequest.staticCall(data.requests[1]);
    await core.postRequest(data.requests[1]);

    let retrievedRequests = await core.getRequests(0, 2);
    expect(retrievedRequests.length).to.equal(2);
    expect(retrievedRequests).to.include(requestId1);
    expect(retrievedRequests).to.include(requestId2);

    await core.postResult(data.results[1], data.proofs[1]);

    retrievedRequests = await core.getRequests(0, 2);
    expect(retrievedRequests.length).to.equal(1);
    expect(retrievedRequests[0]).to.equal(requestId1);
  });
});
