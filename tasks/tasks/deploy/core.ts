import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as v from 'valibot';

import {
  confirmDeployment,
  deployAndVerifyContractWithProxy,
  logConstructorArgs,
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
  sedaProverAddress: HexString,
  timeoutPeriod: v.number(),
});

export async function deploySedaCore(
  hre: HardhatRuntimeEnvironment,
  options: {
    params?: string;
    proverAddress?: string;
    timeoutPeriod?: number;
    reset?: boolean;
    verify?: boolean;
  },
) {
  const contractName = 'SedaCoreV1';

  let constructorArgs: { sedaProverAddress: string; timeoutPeriod: number } | undefined;
  if (options.params) {
    constructorArgs = await readAndValidateParams(options.params, contractName, SedaCoreV1Schema);
  } else if (options.proverAddress) {
    constructorArgs = {
      sedaProverAddress: options.proverAddress,
      timeoutPeriod: options.timeoutPeriod ?? DEFAULT_TIMEOUT_PERIOD,
    };
  } else {
    throw new Error('Either params file or proverAddress must be provided');
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
