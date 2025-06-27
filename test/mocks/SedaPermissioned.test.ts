import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { compareRequests, compareResults } from '../helpers/assertions';
import { convertPendingToRequestInputs } from '../helpers/conversions';
import { generateDataFixtures } from '../helpers/fixtures';
import { deriveRequestId, deriveResultId } from '../utils/crypto';

describe('SedaPermissioned', () => {
  const MAX_REPLICATION_FACTOR = 1;

  async function deployFixture() {
    const [admin, relayer, anyone] = await ethers.getSigners();
    const signers = {
      admin,
      relayer,
      anyone,
    };

    const PermissionedFactory = await ethers.getContractFactory('SedaPermissioned');
    const core = await PermissionedFactory.deploy([relayer.address], MAX_REPLICATION_FACTOR);

    return { core, signers };
  }

  it('allows anyone to post a data request', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests } = generateDataFixtures(1);
    const inputs = requests[0];

    // Check the request ID before posting
    const expectedRequestId = await core.connect(signers.anyone).postRequest.staticCall(inputs);

    // Post the request
    await expect(core.connect(signers.anyone).postRequest(inputs))
      .to.emit(core, 'RequestPosted')
      .withArgs(expectedRequestId);

    // Verify the request is in the pending list
    const pendingRequests = await core.getPendingRequests(0, 10);
    expect(pendingRequests).to.have.lengthOf(1);
    compareRequests(pendingRequests[0].request, requests[0]);

    // Verify the request details
    const storedRequest = await core.getRequest(expectedRequestId);
    compareRequests(storedRequest, inputs);
  });

  it('allows relayer to post a data result', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests, results } = generateDataFixtures(1);

    await core.connect(signers.relayer).postRequest(requests[0]);

    const requestId = deriveRequestId(requests[0]);
    await expect(core.getResult(requestId)).to.be.revertedWithCustomError(core, 'ResultNotFound').withArgs(requestId);

    await expect(core.connect(signers.relayer).postResult(results[0], 0, []))
      .to.emit(core, 'ResultPosted')
      .withArgs(results[0].drId, deriveResultId(results[0]));

    const result = await core.getResult(requestId);
    compareResults(result, results[0]);

    const pendingRequests = await core.getPendingRequests(0, 1);
    expect(pendingRequests).to.be.empty;
  });

  it('handles pagination for pending requests', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests } = generateDataFixtures(5);

    for (const request of requests) {
      await core.connect(signers.relayer).postRequest(request);
    }

    const requests1 = await core.getPendingRequests(0, 2);
    const requests2 = await core.getPendingRequests(2, 2);
    const requests3 = await core.getPendingRequests(0, 10);
    const requests4 = await core.getPendingRequests(4, 2);
    const requests5 = await core.getPendingRequests(5, 1);

    expect(requests1).to.have.lengthOf(2);
    expect(requests2).to.have.lengthOf(2);
    expect(requests3).to.have.lengthOf(5);
    expect(requests4).to.have.lengthOf(1);
    expect(requests5).to.be.empty;

    expect(requests1[0]).to.not.deep.equal(requests2[0]);
    expect(requests1[1]).to.not.deep.equal(requests2[1]);
  });

  it('maintains pending requests after posting results', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests, results } = generateDataFixtures(5);

    const requestIds = [];
    for (const request of requests) {
      const requestId = await core.connect(signers.relayer).postRequest.staticCall(request);
      await core.connect(signers.relayer).postRequest(request);
      requestIds.push(requestId);
    }

    let pending = (await core.getPendingRequests(0, 10)).map(convertPendingToRequestInputs);
    expect(pending.length).to.equal(5);
    expect(pending).to.deep.include.members(requests);

    await core.connect(signers.relayer).postResult(results[0], 0, []);
    await core.connect(signers.relayer).postResult(results[2], 0, []);

    pending = (await core.getPendingRequests(0, 10)).map(convertPendingToRequestInputs);
    expect(pending.length).to.equal(3);
    expect(pending).to.deep.include.members([requests[1], requests[3], requests[4]]);

    await core.connect(signers.relayer).postResult(results[4], 0, []);

    pending = (await core.getPendingRequests(0, 10)).map(convertPendingToRequestInputs);
    expect(pending).to.have.lengthOf(2);
    expect(pending).to.deep.include.members([requests[1], requests[3]]);
  });

  it('only allows relayer to post data result', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests, results } = generateDataFixtures(1);

    await core.connect(signers.relayer).postRequest(requests[0]);

    await expect(core.connect(signers.admin).postResult(results[0], 0, [])).to.be.revertedWithCustomError(
      core,
      'AccessControlUnauthorizedAccount',
    );
    await expect(core.connect(signers.anyone).postResult(results[0], 0, [])).to.be.revertedWithCustomError(
      core,
      'AccessControlUnauthorizedAccount',
    );
    await expect(core.connect(signers.relayer).postResult(results[0], 0, [])).to.not.be.reverted;
  });

  it('manages relayers correctly', async () => {
    const { core, signers } = await loadFixture(deployFixture);

    await expect(core.connect(signers.anyone).addRelayer(signers.anyone.address)).to.be.revertedWithCustomError(
      core,
      'AccessControlUnauthorizedAccount',
    );

    await core.connect(signers.admin).addRelayer(signers.anyone.address);
    expect(await core.hasRole(await core.RELAYER_ROLE(), signers.anyone.address)).to.be.true;

    await expect(core.connect(signers.anyone).removeRelayer(signers.anyone.address)).to.be.revertedWithCustomError(
      core,
      'AccessControlUnauthorizedAccount',
    );

    await core.connect(signers.admin).removeRelayer(signers.anyone.address);
    expect(await core.hasRole(await core.RELAYER_ROLE(), signers.anyone.address)).to.be.false;
  });

  it('gets request and result data correctly', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests, results } = generateDataFixtures(1);

    const requestId = await core.connect(signers.relayer).postRequest.staticCall(requests[0]);
    await core.connect(signers.relayer).postRequest(requests[0]);

    const storedRequest = await core.getRequest(requestId);
    compareRequests(storedRequest, requests[0]);

    await core.connect(signers.relayer).postResult(results[0], 0, []);

    const storedResult = await core.getResult(requestId);
    compareResults(storedResult, results[0]);

    const nonExistentId = ethers.randomBytes(32);
    await expect(core.getRequest(nonExistentId)).to.be.revertedWithCustomError(core, 'RequestNotFound');
    await expect(core.getResult(nonExistentId)).to.be.revertedWithCustomError(core, 'ResultNotFound');
  });

  it('generates correct request and result IDs', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests, results } = generateDataFixtures(1);
    const request = requests[0];
    const result = results[0];

    const requestId = await core.postRequest.staticCall(request);
    const resultId = await core.connect(signers.relayer).postResult.staticCall(result, 0, []);

    expect(requestId).to.equal(deriveRequestId(request));
    expect(resultId).to.equal(deriveResultId(result));
  });

  it('enforces replication factor constraints', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests } = generateDataFixtures(1);

    const invalidRequest1 = {
      ...requests[0],
      replicationFactor: MAX_REPLICATION_FACTOR + 1,
    };
    await expect(core.connect(signers.relayer).postRequest(invalidRequest1)).to.be.revertedWithCustomError(
      core,
      'InvalidReplicationFactor',
    );
    const invalidRequest2 = { ...requests[0], replicationFactor: 0 };
    await expect(core.connect(signers.relayer).postRequest(invalidRequest2))
      .to.be.revertedWithCustomError(core, 'InvalidParameter')
      .withArgs('replicationFactor', 0, 1);
  });

  it('allows admin to set max replication factor', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const newMaxReplicationFactor = 5;

    await expect(
      core.connect(signers.anyone).setMaxReplicationFactor(newMaxReplicationFactor),
    ).to.be.revertedWithCustomError(core, 'AccessControlUnauthorizedAccount');

    await expect(core.connect(signers.admin).setMaxReplicationFactor(newMaxReplicationFactor)).to.not.be.reverted;

    expect(await core.maxReplicationFactor()).to.equal(newMaxReplicationFactor);
  });

  it('allows admin to pause and unpause the contract', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests } = generateDataFixtures(1);

    await expect(core.connect(signers.anyone).pause()).to.be.revertedWithCustomError(
      core,
      'AccessControlUnauthorizedAccount',
    );

    await core.connect(signers.admin).pause();

    await expect(core.connect(signers.anyone).postRequest(requests[0])).to.be.revertedWithCustomError(
      core,
      'EnforcedPause',
    );

    await expect(core.connect(signers.anyone).unpause()).to.be.revertedWithCustomError(
      core,
      'AccessControlUnauthorizedAccount',
    );

    await core.connect(signers.admin).unpause();

    await expect(core.connect(signers.anyone).postRequest(requests[0])).to.not.be.reverted;
  });

  it('handles getPendingRequests with various offsets and limits', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests } = generateDataFixtures(10);

    for (const request of requests) {
      await core.connect(signers.relayer).postRequest(request);
    }

    const allRequests = await core.getPendingRequests(0, 100);
    expect(allRequests).to.have.lengthOf(10);

    const firstHalf = await core.getPendingRequests(0, 5);
    const secondHalf = await core.getPendingRequests(5, 5);
    expect(firstHalf).to.have.lengthOf(5);
    expect(secondHalf).to.have.lengthOf(5);

    const outOfBounds = await core.getPendingRequests(10, 5);
    expect(outOfBounds).to.be.empty;

    const partialPage = await core.getPendingRequests(8, 5);
    expect(partialPage).to.have.lengthOf(2);
  });

  it('correctly removes pending requests when posting results in different orders', async () => {
    const { core, signers } = await loadFixture(deployFixture);
    const { requests, results } = generateDataFixtures(5);

    for (const request of requests) {
      await core.connect(signers.relayer).postRequest(request);
    }

    let pending = await core.getPendingRequests(0, 10);
    expect(pending).to.have.lengthOf(5);

    // Post results in a different order: 2, 4, 1, 3, 5
    await core.connect(signers.relayer).postResult(results[1], 0, []);
    await core.connect(signers.relayer).postResult(results[3], 0, []);
    await core.connect(signers.relayer).postResult(results[0], 0, []);
    await core.connect(signers.relayer).postResult(results[2], 0, []);
    await core.connect(signers.relayer).postResult(results[4], 0, []);

    pending = await core.getPendingRequests(0, 10);
    expect(pending).to.be.empty;
  });
});
