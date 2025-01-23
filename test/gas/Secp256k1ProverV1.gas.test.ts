import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { deployWithSize } from '../helpers/fixtures';
import { deriveBatchId } from '../utils/crypto';

describe('Secp256k1ProverV1 Gas Analysis', () => {
  // Test vectors for different validator set sizes
  const TEST_SCENARIOS = {
    XS: { validators: 100, signers: 4 },
    SMALL: { validators: 100, signers: 10 },
    MEDIUM: { validators: 100, signers: 20 },
    LARGE: { validators: 100, signers: 50 },
    XL: { validators: 100, signers: 67 },
    XXL: { validators: 100, signers: 100 },
  };

  // Helper to measure gas
  // biome-ignore lint/suspicious/noExplicitAny: gas analysis test
  async function measureGas(tx: Promise<any>): Promise<bigint> {
    const receipt = await (await tx).wait();
    return receipt?.gasUsed ?? 0n;
  }

  describe('Validator set size-dependent operations', () => {
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
      describe(`${name} Size Scenario (${config.signers}/${config.validators} signers)`, () => {
        async function scenarioFixture() {
          return deployWithSize(config);
        }

        it('measures gas for batch posting', async () => {
          const { prover, data } = await loadFixture(scenarioFixture);
          const NUM_SAMPLES = 10; // Number of batches to test
          const gasResults: bigint[] = [];

          for (let i = 1; i <= NUM_SAMPLES; i++) {
            const newBatch = {
              ...data.initialBatch,
              batchHeight: i,
              blockHeight: i,
            };
            const newBatchId = deriveBatchId(newBatch);
            const signatures = await Promise.all(
              data.wallets.slice(0, config.signers).map((wallet) => wallet.signingKey.sign(newBatchId).serialized),
            );
            const gas = await measureGas(
              prover.postBatch(newBatch, signatures, data.validatorProofs.slice(0, config.signers)),
            );
            gasResults.push(gas);
          }

          const avgGas = gasResults.reduce((a, b) => a + b, 0n) / BigInt(NUM_SAMPLES);
          console.log(`${consoleIndentation}• ${config.signers} signers: ${Number(avgGas).toLocaleString()} gas`);
        });
      });
    }
  });

  describe('Scenario-independent operations', () => {
    const consoleIndentation = '      ';

    async function baseFixture() {
      return deployWithSize(TEST_SCENARIOS.SMALL);
    }

    it('measures gas for admin operations', async () => {
      const { prover } = await loadFixture(baseFixture);

      // Test pause
      const pauseGas = await measureGas(prover.pause());
      console.log(`${consoleIndentation}• Pause: ${Number(pauseGas).toLocaleString()} gas`);

      // Test unpause
      const unpauseGas = await measureGas(prover.unpause());
      console.log(`${consoleIndentation}• Unpause: ${Number(unpauseGas).toLocaleString()} gas`);
    });
  });
});
