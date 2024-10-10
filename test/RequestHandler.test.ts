import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';

import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  deriveDataResultId,
  deriveRequestId,
  generateRequestsAndResults,
} from './utils';

describe('RequestHandler', () => {
  async function deployProverFixture() {
    const { requests } = generateRequestsAndResults(4);

    // Deploy the SedaDataTypes library first
    const DataTypesFactory = await ethers.getContractFactory('SedaDataTypes');
    const dataTypes = await DataTypesFactory.deploy();

    const RequestHandlerFactory = await ethers.getContractFactory('RequestHandler', {
      libraries: {
        SedaDataTypes: await dataTypes.getAddress(),
      },
    });
    const handler = await RequestHandlerFactory.deploy();

    return { handler, requests };
  }

  it('should generate consistent data request IDs', async () => {
    const { handler, requests } = await loadFixture(deployProverFixture);

    const requestIdFromUtils = deriveRequestId(requests[0]);
    const requestId = await handler.deriveRequestId.staticCall(requests[0]);

    expect(requestId).to.equal(requestIdFromUtils);
  });

  it('should successfully post a request and read it back', async () => {
    const { handler } = await loadFixture(deployProverFixture);

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

    // Get the requestId using staticCall
    const requestId = await handler.postRequest.staticCall(requestInputs);

    // Actually submit the transaction
    const tx = await handler.postRequest(requestInputs);
    await tx.wait();

    // Now you can use this requestId to get the request
    const postedRequest = await handler.getRequest(requestId);

    // Convert Uint8Array to hex strings for comparison
    expect(postedRequest.execProgramId).to.equal(
      `0x${Buffer.from(requestInputs.execProgramId).toString('hex')}`
    );
    expect(postedRequest.execInputs).to.equal(
      `0x${Buffer.from(requestInputs.execInputs).toString('hex')}`
    );
    expect(postedRequest.tallyProgramId).to.equal(
      `0x${Buffer.from(requestInputs.tallyProgramId).toString('hex')}`
    );
    expect(postedRequest.tallyInputs).to.equal(
      `0x${Buffer.from(requestInputs.tallyInputs).toString('hex')}`
    );
    expect(postedRequest.replicationFactor).to.equal(
      requestInputs.replicationFactor
    );
    expect(postedRequest.consensusFilter).to.equal(
      `0x${Buffer.from(requestInputs.consensusFilter).toString('hex')}`
    );
    expect(postedRequest.gasPrice).to.equal(requestInputs.gasPrice);
    expect(postedRequest.gasLimit).to.equal(requestInputs.gasLimit);
    expect(postedRequest.memo).to.equal(
      `0x${Buffer.from(requestInputs.memo).toString('hex')}`
    );
  });

  it('should fail to post a request that already exists', async () => {
    const { handler } = await loadFixture(deployProverFixture);

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

    await handler.postRequest(requestInputs);

    await expect(handler.postRequest(requestInputs)).to.be.revertedWith(
      'RequestHandler: Request already exists'
    );
  });

  it('should return an empty request for non-existent request id', async () => {
    const { handler } = await loadFixture(deployProverFixture);

    const nonExistentRequestId = ethers.randomBytes(32);
    const emptyRequest = await handler.getRequest(nonExistentRequestId);

    expect(emptyRequest.execProgramId).to.equal(ethers.ZeroHash);
    expect(emptyRequest.execInputs).to.equal('0x');
    expect(emptyRequest.tallyProgramId).to.equal(ethers.ZeroHash);
    expect(emptyRequest.tallyInputs).to.equal('0x');
    expect(emptyRequest.replicationFactor).to.equal(0);
    expect(emptyRequest.consensusFilter).to.equal('0x');
    expect(emptyRequest.gasPrice).to.equal(0);
    expect(emptyRequest.gasLimit).to.equal(0);
    expect(emptyRequest.memo).to.equal('0x');
  });

});
