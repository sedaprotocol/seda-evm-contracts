import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { compareResults } from './helpers';
import {
  computeResultLeafHash,
  deriveDataResultId,
  deriveRequestId,
  generateDataFixtures,
} from './utils';

describe('SedaCoreV1', () => {
  async function deployCoreFixture() {
    const { requests, results } = generateDataFixtures(10);
    const leaves = results.map(deriveDataResultId).map(computeResultLeafHash);

    // Create merkle tree and proofs
    const tree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
    const proofs = results.map((_, index) => tree.getProof(index));

    const data = { requests, results, proofs };

    const initialBatch = {
      batchHeight: 0,
      blockHeight: 0,
      validatorRoot: ethers.ZeroHash,
      resultsRoot: tree.root,
      provingMetadata: ethers.ZeroHash,
    };

    const DataTypesFactory = await ethers.getContractFactory('SedaDataTypes');
    const dataTypes = await DataTypesFactory.deploy();

    const ProverFactory = await ethers.getContractFactory('Secp256k1Prover', {
      libraries: { SedaDataTypes: await dataTypes.getAddress() },
    });
    const prover = await ProverFactory.deploy(initialBatch);

    const CoreFactory = await ethers.getContractFactory('SedaCoreV1', {
      libraries: { SedaDataTypes: await dataTypes.getAddress() },
    });
    const core = await CoreFactory.deploy(await prover.getAddress());

    return { prover, core, data };
  }

  describe('getPendingRequests', () => {
    it('should return correct requests with pagination', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const requests1 = await core.getPendingRequests(0, 2);
      const requests2 = await core.getPendingRequests(2, 2);

      expect(requests1.length).to.equal(2);
      expect(requests2.length).to.equal(2);
      expect(requests1[0]).to.not.equal(requests2[0]);
      expect(requests1[1]).to.not.equal(requests2[1]);
    });

    it('should return zero requests if offset > length', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const requests = await core.getPendingRequests(10, 2);
      expect(requests.length).to.equal(0);
    });
  });

  describe('postResult', () => {
    it('should allow posting a result without a prior request', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Attempt to post a result without a corresponding request
      await expect(core.postResult(data.results[0], data.proofs[0])).to.not.be
        .reverted;

      // Verify that the result was posted
      const postedResult = await core.getResult(data.results[0].drId);
      compareResults(postedResult, data.results[0]);

      // Verify that no request is in the pending list
      const requests = await core.getPendingRequests(0, 1);
      expect(requests.length).to.equal(0);
    });
    it('should post a request and then post its result', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      const requestId = await core.postRequest.staticCall(data.requests[0]);
      await core.postRequest(data.requests[0]);

      let requests = await core.getPendingRequests(0, 1);
      expect(requests.length).to.equal(1);
      expect(requests[0]).to.equal(requestId);

      await core.postResult(data.results[0], data.proofs[0]);

      requests = await core.getPendingRequests(0, 1);
      expect(requests.length).to.equal(0);

      const postedResult = await core.getResult(data.results[0].drId);
      compareResults(postedResult, data.results[0]);
    });

    it('should handle multiple requests and results correctly', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      let requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(data.requests.length);

      for (let i = 0; i < data.results.length / 2; i++) {
        await core.postResult(data.results[i], data.proofs[i]);
      }

      requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(data.requests.length / 2);

      for (let i = 0; i < data.results.length / 2; i++) {
        const postedResult = await core.getResult(data.results[i].drId);
        compareResults(postedResult, data.results[i]);
      }
    });
  });

  describe('request management', () => {
    it('should maintain correct order of requests (no removals)', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests) {
        await core.postRequest(request);
      }

      const allRequests = await core.getPendingRequests(
        0,
        data.requests.length
      );
      for (let i = 0; i < data.requests.length; i++) {
        expect(allRequests[i]).to.equal(
          await deriveRequestId(data.requests[i])
        );
      }
    });

    it('should handle edge cases in getPendingRequests', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests.slice(0, 5)) {
        await core.postRequest(request);
      }

      const requests1 = await core.getPendingRequests(0, 10);
      const requests2 = await core.getPendingRequests(4, 2);
      const requests3 = await core.getPendingRequests(5, 1);

      expect(requests1.length).to.equal(5);
      expect(requests2.length).to.equal(1);
      expect(requests3.length).to.equal(0);
    });

    it('should not add duplicate requests', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      let requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(0);

      const pr1 = await core.postRequest(data.requests[0]);

      await expect(
        core.postRequest(data.requests[0])
      ).to.be.revertedWithCustomError(core, 'RequestAlreadyExists');

      expect(pr1)
        .to.emit(core, 'RequestPosted')
        .withArgs(await deriveRequestId(data.requests[0]));

      requests = await core.getPendingRequests(0, 10);
      expect(requests.length).to.equal(1);
    });

    it('should efficiently remove requests from the middle', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      for (const request of data.requests.slice(0, 5)) {
        await core.postRequest(request);
      }

      const gasUsed = await core.postResult.estimateGas(
        data.results[2],
        data.proofs[2]
      );

      // This is rough esimate
      expect(gasUsed).to.be.lessThan(250000);
    });

    it('should maintain pending requests (with removals)', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Post 5 requests
      const requestIds = [];
      for (const request of data.requests.slice(0, 5)) {
        const requestId = await core.postRequest.staticCall(request);
        await core.postRequest(request);
        requestIds.push(requestId);
      }

      // Verify that all requests are pending
      let pending = await core.getPendingRequests(0, 10);
      expect(pending.length).to.equal(5);
      expect(Array.from(pending)).to.have.members(requestIds);

      // Post results for first and third requests
      await core.postResult(data.results[0], data.proofs[0]);
      await core.postResult(data.results[2], data.proofs[2]);

      // Expected remaining pending requests
      const expectedPending = [requestIds[1], requestIds[3], requestIds[4]];

      // Retrieve pending requests
      pending = await core.getPendingRequests(0, 10);
      expect(pending.length).to.equal(3);
      expect(Array.from(pending)).to.have.members(expectedPending);

      // Post another result
      await core.postResult(data.results[4], data.proofs[4]);

      // Expected remaining pending requests
      const finalPending = [requestIds[1], requestIds[3]];

      // Retrieve final pending requests
      pending = await core.getPendingRequests(0, 10);
      expect(pending.length).to.equal(2);
      expect(Array.from(pending)).to.have.members(finalPending);
    });

    it('should correctly handle removing the last request', async () => {
      const { core, data } = await loadFixture(deployCoreFixture);

      // Post several requests
      for (let i = 0; i < 3; i++) {
        await core.postRequest(data.requests[i]);
      }

      // Verify that all requests are pending
      let pendingRequests = await core.getPendingRequests(0, 3);
      expect(pendingRequests.length).to.equal(3);

      // Post the result for the last request
      await core.postResult(data.results[2], data.proofs[2]);

      // Verify that the last request has been removed
      pendingRequests = await core.getPendingRequests(0, 3);
      expect(pendingRequests.length).to.equal(2);
      expect(pendingRequests).to.not.include(
        await core.deriveRequestId(data.requests[2])
      );

      // Verify the remaining requests are still in order
      expect(pendingRequests[0]).to.equal(
        await core.deriveRequestId(data.requests[0])
      );
      expect(pendingRequests[1]).to.equal(
        await core.deriveRequestId(data.requests[1])
      );
    });
  });
});
