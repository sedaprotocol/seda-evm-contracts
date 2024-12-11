import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as v from 'valibot';

import {
  confirmDeployment,
  deployAndVerifyContract,
  logConstructorArgs,
  logDeploymentConfig,
  readAndValidateParams,
} from '../../../common/deploy/helpers';
import { getNetworkKey } from '../../../common/utils';
import { sedaScope } from '../../../index';

sedaScope
  .task('deploy:dev:permissioned', 'Deploys the Permissioned SEDA contract (only for testing)')
  .addOptionalParam('maxReplicationFactor', 'The maximum replication factor', undefined, types.int)
  .addOptionalParam('params', 'The parameters file to use', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deployPermissioned(hre, taskArgs);
  });

const SedaPermissionedSchema = v.object({
  maxReplicationFactor: v.number(),
});

async function deployPermissioned(
  hre: HardhatRuntimeEnvironment,
  options: {
    params?: string;
    maxReplicationFactor?: number;
    reset?: boolean;
    verify?: boolean;
  },
): Promise<{ contractAddress: string }> {
  const contractName = 'SedaPermissioned';

  // Contract Parameters
  let constructorArgs = 1;
  if (options.params) {
    constructorArgs = (await readAndValidateParams(options.params, contractName, SedaPermissionedSchema))
      .maxReplicationFactor;
  } else if (options.maxReplicationFactor) {
    constructorArgs = options.maxReplicationFactor;
    logConstructorArgs('Using command line parameters', { maxReplicationFactor: constructorArgs });
  }

  // Configuration
  const [owner] = await hre.ethers.getSigners();
  await logDeploymentConfig(hre, contractName, owner);

  // Confirm deployment (if required)
  const networkKey = await getNetworkKey(hre);
  await confirmDeployment(networkKey, options.reset);

  // Deploy
  return await deployAndVerifyContract(hre, contractName, [[owner.address], '1'], options.verify);
}
