import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { compareRequests } from '../helpers';
import { deriveRequestId, generateDataFixtures } from '../utils';

describe('RequestHandler', () => {
  async function deployRequestHandlerFixture() {
    const { requests } = generateDataFixtures(4);

    // Deploy the RequestHandler contract
    const RequestHandlerFactory = await ethers.getContractFactory('SedaCoreV1');
    const handler = await RequestHandlerFactory.deploy();

    return { handler, requests };
  }

  describe('deriveRequestId', () => {
    it('should generate consistent data request IDs', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestIdFromUtils = deriveRequestId(requests[0]);
      const requestId = await handler.deriveRequestId.staticCall(requests[0]);

      expect(requestId).to.equal(requestIdFromUtils);
    });

    it('should generate different IDs for different requests', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const id1 = await handler.deriveRequestId.staticCall(requests[0]);
      const id2 = await handler.deriveRequestId.staticCall(requests[1]);

      expect(id1).to.not.equal(id2);
    });
  });

  describe('postRequest', () => {
    it('should successfully post a request and read it back', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestId = await handler.postRequest.staticCall(requests[0]);
      await handler.postRequest(requests[0]);

      const postedRequest = await handler.getRequest(requestId);
      compareRequests(postedRequest, requests[0]);
    });

    it('should fail to post a request that already exists', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestId = await handler.deriveRequestId.staticCall(requests[0]);
      await handler.postRequest(requests[0]);

      await expect(handler.postRequest(requests[0]))
        .to.be.revertedWithCustomError(handler, 'RequestAlreadyExists')
        .withArgs(requestId);
    });

    it('should emit a RequestPosted event', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestId = await handler.deriveRequestId.staticCall(requests[0]);

      await expect(handler.postRequest(requests[0])).to.emit(handler, 'RequestPosted').withArgs(requestId);
    });

    it('should revert when replicationFactor is 0', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const invalidRequest = { ...requests[0], replicationFactor: 0 };

      await expect(handler.postRequest(invalidRequest)).to.be.revertedWithCustomError(
        handler,
        'InvalidReplicationFactor',
      );
    });
  });

  describe('getRequest', () => {
    it('should revert with RequestNotFound for non-existent request id', async () => {
      const { handler } = await loadFixture(deployRequestHandlerFixture);

      const nonExistentRequestId = ethers.ZeroHash;

      await expect(handler.getRequest(nonExistentRequestId))
        .to.be.revertedWithCustomError(handler, 'RequestNotFound')
        .withArgs(nonExistentRequestId);
    });

    it('should return the correct request for an existing request id', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestId = await handler.postRequest.staticCall(requests[0]);
      await handler.postRequest(requests[0]);
      const retrievedRequest = await handler.getRequest(requestId);

      compareRequests(retrievedRequest, requests[0]);
    });
  });
});
