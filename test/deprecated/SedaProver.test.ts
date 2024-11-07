import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SedaProver } from "../../typechain-types";

describe("SedaProver", () => {
  const MAX_REPLICATION_FACTOR = 10;

  async function deployFixture() {
    const [admin, relayer, user] = await ethers.getSigners();

    const SedaProver = await ethers.getContractFactory("SedaProver");
    const prover = await SedaProver.deploy(
      admin.address,
      [relayer.address],
      MAX_REPLICATION_FACTOR
    );

    return { prover, admin, relayer, user };
  }

  const createMockRequest = (index: number) => ({
    dr_binary_id: "0x541d1faf3b6e167ea5369928a24a0019f4167ca430da20a271c5a7bc5fa2657a",
    dr_inputs: "0x1234",
    tally_binary_id: "0x541d1faf3b6e167ea5369928a24a0019f4167ca430da20a271c5a7bc5fa2657a",
    tally_inputs: "0x5678",
    replication_factor: 1,
    consensus_filter: "0x00",
    gas_price: 1000n,
    gas_limit: 100000n,
    memo: ethers.hexlify(ethers.toUtf8Bytes(index.toString()))
  });

  const createMockResult = (drId: string) => ({
    version: "0.0.1",
    dr_id: drId,
    consensus: true,
    exit_code: 0,
    result: "0xabcd",
    block_height: 100n,
    gas_used: 50000n,
    payback_address: "0x",
    seda_payload: "0x"
  });

  describe("Data Request Operations", () => {

    it("should allow anyone to post a data request", async () => {
      const { prover, user } = await loadFixture(deployFixture);
      const mockRequest = createMockRequest(0);

      await expect(prover.connect(user).postDataRequest(mockRequest)).to.emit(prover, 'DataRequestPosted');

      const drId = await prover.generateDataRequestId(mockRequest);
      const storedRequest = await prover.getDataRequest(drId);
      expect(storedRequest.dr_binary_id).to.equal(mockRequest.dr_binary_id);
    });

    it("should handle multiple data requests and results", async () => {
      const { prover, relayer } = await loadFixture(deployFixture);
      const requests = Array.from({ length: 5 }, (_, index) => createMockRequest(index));

      // Post all requests
      const drIds = await Promise.all(
        requests.map(async (req) => {
          await prover.postDataRequest(req);
          return prover.generateDataRequestId(req);
        })
      );

      // Post results in different order: 2, 4, 1, 3, 5
      const resultOrder = [1, 3, 0, 2, 4];
      for (const index of resultOrder) {
        const mockResult = createMockResult(drIds[index]);
        await prover.connect(relayer).postDataResult(mockResult);
      }

      // Verify all results are stored
      for (const drId of drIds) {
        const result = await prover.getDataResult(drId);
        expect(result.dr_id).to.equal(drId);
      }
    });
  });

  describe("Data Request Pool", () => {
    it("should correctly maintain data requests in the pool", async () => {
      const { prover, user } = await loadFixture(deployFixture);
      const requests = Array.from({ length: 3 }, (_, index) => createMockRequest(index));

      // Post requests
      await Promise.all(
        requests.map(async (req) => {
          await expect(prover.connect(user).postDataRequest(req)).to.emit(prover, 'DataRequestPosted');
        })
      );

      // Check pool size using array length
      let poolSize = await prover.getDataRequestsFromPool(0, 5);
      expect(poolSize.length).to.equal(3);

      // Check pool size using array length
      poolSize = await prover.getDataRequestsFromPool(1, 5);
      expect(poolSize.length).to.equal(2);

      // Check pool size using array length
      poolSize = await prover.getDataRequestsFromPool(2, 5);
      expect(poolSize.length).to.equal(1);

      // Check pool size using array length
      poolSize = await prover.getDataRequestsFromPool(3, 5);
      expect(poolSize.length).to.equal(0);

      // Check pool size using array length
      poolSize = await prover.getDataRequestsFromPool(4, 5);
      expect(poolSize.length).to.equal(0);
    });
  });

});
