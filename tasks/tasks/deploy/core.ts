import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  confirmDeployment,
  deployAndVerifyContractWithProxy,
  logConstructorArgs,
  logDeploymentConfig,
  readAndValidateParams,
} from '../../common/deploy/helpers';
import { getNetworkKey } from '../../common/utils';
import { sedaScope } from '../../index';

sedaScope
  .task('deploy:core', 'Deploy the SedaCoreV1 contract')
  .addOptionalParam('params', 'The parameters file to use', undefined, types.string)
  .addOptionalParam('proverAddress', 'Direct SedaProver contract address', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deploySedaCore(hre, taskArgs);
  });

export async function deploySedaCore(
  hre: HardhatRuntimeEnvironment,
  options: {
    params?: string;
    proverAddress?: string;
    reset?: boolean;
    verify?: boolean;
  },
) {
  const contractName = 'SedaCoreV1';

  // Constructor arguments
  if (options.params && options.proverAddress) {
    throw new Error('Both params file and proverAddress cannot be provided simultaneously.');
  }
  let constructorArgs: string;
  if (options.params) {
    const params = await readAndValidateParams(options.params, contractName);
    if (params && 'sedaProverAddress' in params && typeof params.sedaProverAddress === 'string') {
      constructorArgs = params.sedaProverAddress;
    } else {
      throw new Error('SedaCoreV1 address not found in params file');
    }
  } else if (options.proverAddress) {
    constructorArgs = options.proverAddress;
    logConstructorArgs('Using user-defined parameter', { sedaProverAddress: constructorArgs });
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
  return await deployAndVerifyContractWithProxy(hre, contractName, [constructorArgs], owner, options.verify);
}
