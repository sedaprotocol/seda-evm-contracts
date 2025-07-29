import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import {
  confirmDeployment,
  logDeploymentConfig,
  upgradeAndVerifyContractWithProxy,
  verifyContract,
} from '../../common/deploy/helpers';
import type { UupsContracts } from '../../common/deploy/proxy';
import { logger } from '../../common/logger';
import { getNetworkKey } from '../../common/utils';
import { sedaScope } from '../../index';

/**
 * Example usage for this task:
 *
 * 1. Start local node:
 *    `npx hardhat node`
 *
 * 2. Deploy initial contract:
 *    `bun run seda deploy:prover --params deployments/parameters-example.json --network local`
 *
 * 3. Copy the proxy address from deployment output
 *
 * 4. Run upgrade:
 *    `bun run seda utils:upgrade-proxy <proxy-address> MockSecp256k1ProverV2 --network local`
 *
 * Example usage for Base Sepolia Testnet:
 * - Deploy: `bun run seda deploy:prover --params deployments/parameters-example.json --verify --network baseSepolia`
 * - Upgrade: `bun run seda utils:upgrade-proxy 0xC1b213990a78De8E8A4efAFd2F47406d65481C45 MockSecp256k1ProverV2 --verify --network baseSepolia`
 */

sedaScope
  .task('utils:upgrade-proxy', 'Deploys and upgrades a proxy implementation contract')
  .addPositionalParam('proxy', 'The proxy address to upgrade', undefined, types.string)
  .addPositionalParam('contractName', 'The contract name to upgrade', undefined, types.string)
  .addOptionalParam('args', 'The initialize arguments to use', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .addFlag('noinit', 'Do not initialize the contract')
  .setAction(async (taskArgs, hre) => {
    await upgradeProver(hre, taskArgs);
  });

export async function upgradeProver(
  hre: HardhatRuntimeEnvironment,
  options: {
    contractName: string;
    proxy: string;
    args: string | undefined;
    reset?: boolean;
    verify?: boolean;
    noinit?: boolean;
  },
): Promise<{ contractImplAddress: string }> {
  const contractName = options.contractName;

  // Configuration
  const [owner] = await hre.ethers.getSigners();
  await logDeploymentConfig(hre, contractName, owner);

  // Confirm deployment (if required)
  const networkKey = await getNetworkKey(hre);
  await confirmDeployment(networkKey, options.reset);

  // Deploy and verify
  const result = await upgradeAndVerifyContractWithProxy(
    hre,
    options.proxy,
    contractName as keyof UupsContracts,
    owner,
  );

  // Call the initialize function
  logger.section('Initializing implementation contract', 'upgrade');
  logger.info(`Initialize args: ${options.args}`);
  const proxy = await hre.ethers.getContractAt(contractName, options.proxy, owner);
  if (!options.noinit) {
    const tx = options.args ? await proxy.initialize(options.args) : await proxy.initialize();
    logger.info(`Transaction: ${tx.hash}`);
    await tx.wait();
  }

  if (options.verify) {
    await verifyContract(hre, result.contractImplAddress);
    await verifyContract(hre, options.proxy);
  }

  // Example: Query contract version (function in the new implementation)
  // const version = await proxy.getVersion();
  // logger.info(`Contract version: ${version}`);

  logger.success('Upgrade complete');

  return result;
}
