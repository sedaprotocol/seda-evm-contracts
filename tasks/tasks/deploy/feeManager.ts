import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { confirmDeployment, deployAndVerifyContract, logDeploymentConfig } from '../../common/deploy/helpers';
import { getNetworkKey } from '../../common/utils';
import { sedaScope } from '../../index';

sedaScope
  .task('deploy:fee-manager', 'Deploys the SedaFeeManager contract')
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deployFeeManager(hre, taskArgs);
  });

export async function deployFeeManager(
  hre: HardhatRuntimeEnvironment,
  options: {
    reset?: boolean;
    verify?: boolean;
  },
): Promise<{ contractAddress: string }> {
  const contractName = 'SedaFeeManager';

  // Configuration
  const [owner] = await hre.ethers.getSigners();
  await logDeploymentConfig(hre, contractName, owner);

  // Confirm deployment (if required)
  const networkKey = await getNetworkKey(hre);
  await confirmDeployment(networkKey, options.reset);

  // Deploy and verify - SedaFeeManager has no constructor arguments
  return await deployAndVerifyContract(hre, contractName, [], options.verify);
}
