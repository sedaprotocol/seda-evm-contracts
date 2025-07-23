import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as v from 'valibot';

import {
  confirmDeployment,
  deployAndVerifyContractWithProxy,
  logDeploymentConfig,
  readAndValidateParams,
} from '../../common/deploy/helpers';
import { HexString } from '../../common/params';
import { getNetworkKey } from '../../common/utils';
import { sedaScope } from '../../index';

const DEFAULT_TIMEOUT_PERIOD = 24 * 60 * 60; // 1 day in seconds

sedaScope
  .task('deploy:core', 'Deploys the SedaCoreV1 contract')
  .addOptionalParam('params', 'The parameters file to use', undefined, types.string)
  .addOptionalParam('proverAddress', 'Direct SedaProver contract address', undefined, types.string)
  .addOptionalParam('timeoutPeriod', 'The withdraw timeout period in seconds', undefined, types.int)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deploySedaCore(hre, taskArgs);
  });

const SedaCoreV1Schema = v.object({
  sedaProverAddress: v.optional(HexString),
  timeoutPeriod: v.optional(v.number()),
});

export async function deploySedaCore(
  hre: HardhatRuntimeEnvironment,
  options: {
    params?: string | object;
    proverAddress?: string;
    timeoutPeriod?: number;
    reset?: boolean;
    verify?: boolean;
  },
) {
  const contractName = 'SedaCoreV1';

  // Read params file if provided
  let paramsFromFile: { sedaProverAddress?: string; timeoutPeriod?: number } = {};
  if (options.params) {
    paramsFromFile = await readAndValidateParams(options.params, contractName, SedaCoreV1Schema);
  }

  // Prioritize command-line options, then params file values
  const sedaProverAddress = options.proverAddress || paramsFromFile.sedaProverAddress;
  if (!sedaProverAddress) {
    throw new Error('Either sedaProverAddress in params file or proverAddress option must be provided');
  }

  const timeoutPeriod = options.timeoutPeriod ?? paramsFromFile.timeoutPeriod ?? DEFAULT_TIMEOUT_PERIOD;

  const constructorArgs = {
    sedaProverAddress,
    timeoutPeriod,
  };

  // Validate prover address
  try {
    const provertContract = await hre.ethers.getContractAt('IProver', sedaProverAddress);
    // Verify the prover contract has getFeeManager function
    await provertContract.getFeeManager();
  } catch (_error) {
    console.error(`Error validating prover contract at ${sedaProverAddress}:`);
    throw new Error('The provided prover address appears to be invalid or does not implement the required interface');
  }

  // Configuration
  const [owner] = await hre.ethers.getSigners();
  await logDeploymentConfig(hre, contractName, owner);

  // Confirm deployment (if required)
  const networkKey = await getNetworkKey(hre);
  await confirmDeployment(networkKey, options.reset);

  // Deploy and verify
  return await deployAndVerifyContractWithProxy(
    hre,
    contractName,
    [constructorArgs.sedaProverAddress, constructorArgs.timeoutPeriod],
    owner,
    options.verify,
  );
}
