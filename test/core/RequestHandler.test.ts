import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import type { RequestHandlerBase } from '../../typechain-types';
import { compareRequests } from '../helpers';
import { deriveRequestId, generateDataFixtures } from '../utils';

describe('RequestHandler', () => {
  async function deployRequestHandlerFixture() {
    const { requests } = generateDataFixtures(4);

    // Deploy the RequestHandler contract
    const RequestHandlerFactory = await ethers.getContractFactory('SedaCoreV1');
    const handler = (await RequestHandlerFactory.deploy()) as unknown as RequestHandlerBase;

    return { handler, requests };
  }

  describe('deriveRequestId', () => {
    it('generates consistent request IDs', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestIdFromUtils = deriveRequestId(requests[0]);
      const requestId = await handler.deriveRequestId.staticCall(requests[0]);

      expect(requestId).to.equal(requestIdFromUtils);
    });

    it('generates unique IDs for different requests', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const id1 = await handler.deriveRequestId.staticCall(requests[0]);
      const id2 = await handler.deriveRequestId.staticCall(requests[1]);

      expect(id1).to.not.equal(id2);
    });
  });

  describe('postRequest', () => {
    it('posts request and retrieves it successfully', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestId = await handler.postRequest.staticCall(requests[0]);
      await handler.postRequest(requests[0]);

      const postedRequest = await handler.getRequest(requestId);
      compareRequests(postedRequest, requests[0]);
    });

    it('reverts when posting duplicate request', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestId = await handler.deriveRequestId.staticCall(requests[0]);
      await handler.postRequest(requests[0]);

      await expect(handler.postRequest(requests[0]))
        .to.be.revertedWithCustomError(handler, 'RequestAlreadyExists')
        .withArgs(requestId);
    });

    it('emits RequestPosted event', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestId = await handler.deriveRequestId.staticCall(requests[0]);

      await expect(handler.postRequest(requests[0])).to.emit(handler, 'RequestPosted').withArgs(requestId);
    });

    it('reverts when replication factor is zero', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const invalidRequest = { ...requests[0], replicationFactor: 0 };

      await expect(handler.postRequest(invalidRequest)).to.be.revertedWithCustomError(
        handler,
        'InvalidReplicationFactor',
      );
    });
  });

  describe('getRequest', () => {
    it('reverts for non-existent request', async () => {
      const { handler } = await loadFixture(deployRequestHandlerFixture);

      const nonExistentRequestId = ethers.ZeroHash;

      await expect(handler.getRequest(nonExistentRequestId))
        .to.be.revertedWithCustomError(handler, 'RequestNotFound')
        .withArgs(nonExistentRequestId);
    });

    it('retrieves existing request correctly', async () => {
      const { handler, requests } = await loadFixture(deployRequestHandlerFixture);

      const requestId = await handler.postRequest.staticCall(requests[0]);
      await handler.postRequest(requests[0]);
      const retrievedRequest = await handler.getRequest(requestId);

      compareRequests(retrievedRequest, requests[0]);
    });
  });
});
