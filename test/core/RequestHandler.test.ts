import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { compareRequests } from '../helpers/assertions';
import { deployWithOptions } from '../helpers/fixtures';
import { deriveRequestId } from '../utils/crypto';

describe('RequestHandler', () => {
  async function deployFixture() {
    const { core: handler, data } = await deployWithOptions({ requests: 4 });
    return { handler, requests: data.requests };
  }

  describe('deriveRequestId', () => {
    it('generates consistent request IDs', async () => {
      const { handler, requests } = await loadFixture(deployFixture);

      const requestIdFromUtils = deriveRequestId(requests[0]);
      const requestId = await handler.deriveRequestId.staticCall(requests[0]);

      expect(requestId).to.equal(requestIdFromUtils);
    });

    it('generates unique IDs for different requests', async () => {
      const { handler, requests } = await loadFixture(deployFixture);

      const id1 = await handler.deriveRequestId.staticCall(requests[0]);
      const id2 = await handler.deriveRequestId.staticCall(requests[1]);

      expect(id1).to.not.deep.equal(id2);
    });
  });

  describe('postRequest', () => {
    it('posts request and retrieves it successfully', async () => {
      const { handler, requests } = await loadFixture(deployFixture);

      const requestId = await handler.postRequest.staticCall(requests[0]);
      await handler.postRequest(requests[0]);

      const postedRequest = await handler.getRequest(requestId);
      compareRequests(postedRequest, requests[0]);
    });

    it('allows posting duplicate request', async () => {
      const { handler, requests } = await loadFixture(deployFixture);

      const requestId = await handler.postRequest.staticCall(requests[0]);
      await handler.postRequest(requests[0]);

      // Second post of the same request should succeed and return the same ID
      const duplicateRequestId = await handler.postRequest.staticCall(requests[0]);
      expect(duplicateRequestId).to.equal(requestId);

      // Verify the request data remains unchanged
      const postedRequest = await handler.getRequest(requestId);
      compareRequests(postedRequest, requests[0]);
    });

    it('emits RequestPosted event', async () => {
      const { handler, requests } = await loadFixture(deployFixture);

      const requestId = await handler.deriveRequestId.staticCall(requests[0]);

      await expect(handler.postRequest(requests[0])).to.emit(handler, 'RequestPosted').withArgs(requestId);
    });

    it('reverts when replication factor is zero', async () => {
      const { handler, requests } = await loadFixture(deployFixture);

      const invalidRequest = { ...requests[0], replicationFactor: 0 };

      await expect(handler.postRequest(invalidRequest)).to.be.revertedWithCustomError(
        handler,
        'InvalidReplicationFactor',
      );
    });
  });

  describe('getRequest', () => {
    it('reverts for non-existent request', async () => {
      const { handler } = await loadFixture(deployFixture);

      const nonExistentRequestId = ethers.ZeroHash;

      await expect(handler.getRequest(nonExistentRequestId))
        .to.be.revertedWithCustomError(handler, 'RequestNotFound')
        .withArgs(nonExistentRequestId);
    });

    it('retrieves existing request correctly', async () => {
      const { handler, requests } = await loadFixture(deployFixture);

      const requestId = await handler.postRequest.staticCall(requests[0]);
      await handler.postRequest(requests[0]);
      const retrievedRequest = await handler.getRequest(requestId);

      compareRequests(retrievedRequest, requests[0]);
    });
  });
});
