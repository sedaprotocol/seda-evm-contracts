import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { ethers } from 'hardhat';
import { deployWithSize } from '../helpers/fixtures';
import { ONE_DAY_IN_SECONDS } from '../utils/constants';
import { deriveRequestId, deriveResultId } from '../utils/crypto';

describe('SedaCoreV1 Gas Analysis', () => {
  // Test vectors for different sizes
  const TEST_SCENARIOS = {
    XS: { requests: 1 },
    SMALL: { requests: 5 },
    MEDIUM: { requests: 10 },
    LARGE: { requests: 50 },
    XL: { requests: 100 },
    XXL: { requests: 500 },
  };

  // Helper to measure gas
  // biome-ignore lint/suspicious/noExplicitAny: gas analysis test
  async function measureGas(tx: Promise<any>): Promise<bigint> {
    const receipt = await (await tx).wait();
    return receipt?.gasUsed ?? 0n;
  }

  describe('Request size-dependent operations', () => {
    const consoleIndentation = '        ';

    // Define scenarios we want to test
    const SCENARIOS_TO_TEST = [
      { name: 'XS', config: TEST_SCENARIOS.XS },
      { name: 'SMALL', config: TEST_SCENARIOS.SMALL },
      { name: 'MEDIUM', config: TEST_SCENARIOS.MEDIUM },
      { name: 'LARGE', config: TEST_SCENARIOS.LARGE },
      { name: 'XL', config: TEST_SCENARIOS.XL },
      { name: 'XXL', config: TEST_SCENARIOS.XXL },
    ];

    // Generate test suites for each scenario
    for (const { name, config } of SCENARIOS_TO_TEST) {
      describe(`${name} Size Scenario (${config.requests} requests)`, () => {
        async function scenarioFixture() {
          return deployWithSize(config);
        }

        it('measures gas for requests, results and verifications', async () => {
          const { core, prover, data } = await loadFixture(scenarioFixture);

          const requestFee = ethers.parseEther('0.01');
          const resultFee = ethers.parseEther('0.005');
          const batchFee = ethers.parseEther('0.002');

          let totalRequestGas = 0n;
          for (const request of data.requests) {
            const usedGas = await measureGas(
              core.postRequest(request, requestFee, resultFee, batchFee, { value: requestFee + resultFee + batchFee }),
            );
            totalRequestGas += usedGas;
          }
          const avgRequestGas = Number(totalRequestGas) / data.requests.length;
          console.log(`${consoleIndentation}• Requests: ${Math.round(avgRequestGas).toLocaleString()} gas`);

          let totalResultGas = 0n;
          for (let i = 0; i < data.results.length; i++) {
            const usedGas = await measureGas(core.postResult(data.results[i], 0, data.resultProofs[i], { value: 0 }));
            totalResultGas += usedGas;
          }
          const avgResultGas = Number(totalResultGas) / data.results.length;
          console.log(`${consoleIndentation}• Results: ${Math.round(avgResultGas).toLocaleString()} gas`);

          // Add result proof verification gas estimation
          let totalVerifyProofGas = 0n;
          for (let i = 0; i < data.results.length; i++) {
            const resultId = deriveResultId(data.results[i]);
            const estimatedGas = await prover.verifyResultProof.estimateGas(
              resultId,
              data.initialBatch.batchHeight,
              data.resultProofs[i],
            );
            totalVerifyProofGas += estimatedGas;
          }

          const avgVerifyProofGas = Number(totalVerifyProofGas) / data.results.length;
          console.log(
            `${consoleIndentation}• Verify Result Proofs: ${Math.round(avgVerifyProofGas).toLocaleString()} gas`,
          );
        });
      });
    }
  });

  describe(`Result length-dependent operations (${TEST_SCENARIOS.MEDIUM.requests} requests/batch)`, () => {
    const consoleIndentation = '        ';

    // Define result length scenarios we want to test (up to 1KB protocol limit)
    const RESULT_LENGTHS = [
      { name: 'XS', resultLength: 32 }, // 32 bytes
      { name: 'SMALL', resultLength: 128 }, // 128 bytes
      { name: 'MEDIUM', resultLength: 512 }, // 512 bytes
      { name: 'LARGE', resultLength: 1024 }, // 1KB (protocol maximum)
    ];

    for (const { name, resultLength } of RESULT_LENGTHS) {
      describe(`${name} Result Length (${resultLength} bytes)`, () => {
        async function resultLengthFixture() {
          // Use MEDIUM scenario with 10 requests and specify resultLength
          return deployWithSize({
            ...TEST_SCENARIOS.MEDIUM,
            resultLength,
          });
        }

        it(`measures gas for results of ${resultLength} bytes`, async () => {
          const { core, prover, data } = await loadFixture(resultLengthFixture);

          // Measure postResult gas
          let totalResultGas = 0n;
          for (let i = 0; i < data.results.length; i++) {
            const usedGas = await measureGas(core.postResult(data.results[i], 0, data.resultProofs[i], { value: 0 }));
            totalResultGas += usedGas;
          }
          const avgResultGas = Number(totalResultGas) / data.results.length;
          console.log(
            `${consoleIndentation}• Post Result (${resultLength} bytes): ${Math.round(avgResultGas).toLocaleString()} gas`,
          );

          // Measure proof verification gas
          let totalVerifyProofGas = 0n;
          for (let i = 0; i < data.results.length; i++) {
            const resultId = deriveResultId(data.results[i]);
            const estimatedGas = await prover.verifyResultProof.estimateGas(
              resultId,
              data.initialBatch.batchHeight,
              data.resultProofs[i],
            );
            totalVerifyProofGas += estimatedGas;
          }
          const avgVerifyProofGas = Number(totalVerifyProofGas) / data.results.length;
          console.log(
            `${consoleIndentation}• Verify Result Proof (${resultLength} bytes): ${Math.round(avgVerifyProofGas).toLocaleString()} gas`,
          );
        });
      });
    }
  });

  describe('Scenario-independent operations', () => {
    const consoleIndentation = '      ';

    async function baseFixture() {
      return deployWithSize(TEST_SCENARIOS.SMALL);
    }

    it('measures gas for fee operations', async () => {
      const { core, data } = await loadFixture(baseFixture);

      // Setup initial request with fees
      const requestFee = ethers.parseEther('0.01');
      const resultFee = ethers.parseEther('0.005');
      const batchFee = ethers.parseEther('0.002');

      const request = data.requests[0];
      // Wait for transaction to be mined and get the request ID
      const tx = await core.postRequest(request, requestFee, resultFee, batchFee, {
        value: requestFee + resultFee + batchFee,
      });
      await tx.wait();

      // Calculate the request ID based on the request data
      const requestId = deriveRequestId(request);

      // Test increaseFees
      const additionalFees = {
        request: ethers.parseEther('0.002'),
        result: ethers.parseEther('0.001'),
        batch: ethers.parseEther('0.0005'),
      };

      const increaseFeesGas = await measureGas(
        core.increaseFees(requestId, additionalFees.request, additionalFees.result, additionalFees.batch, {
          value: additionalFees.request + additionalFees.result + additionalFees.batch,
        }),
      );
      console.log(`${consoleIndentation}• Increase Fees: ${Number(increaseFeesGas).toLocaleString()} gas`);

      // Fast forward time to allow withdrawal
      await ethers.provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + 1]);
      await ethers.provider.send('evm_mine', []);

      // Test withdrawTimedOutRequest
      const withdrawGas = await measureGas(core.withdrawTimedOutRequest(requestId));
      console.log(`${consoleIndentation}• Withdraw Timed Out Request: ${Number(withdrawGas).toLocaleString()} gas`);
    });

    it('measures gas for admin operations', async () => {
      const { core } = await loadFixture(baseFixture);

      // Test pause
      const pauseGas = await measureGas(core.pause());
      console.log(`${consoleIndentation}• Pause: ${Number(pauseGas).toLocaleString()} gas`);

      // Test unpause
      const unpauseGas = await measureGas(core.unpause());
      console.log(`${consoleIndentation}• Unpause: ${Number(unpauseGas).toLocaleString()} gas`);

      // Test timeout period update
      const setTimeoutGas = await measureGas(core.setTimeoutPeriod(ONE_DAY_IN_SECONDS * 2));
      console.log(`${consoleIndentation}• Set Timeout Period: ${Number(setTimeoutGas).toLocaleString()} gas`);
    });
  });
});
