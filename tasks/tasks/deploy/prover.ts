import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  confirmDeployment,
  deployAndVerifyContractWithProxy,
  logDeploymentConfig,
  readAndValidateParams,
} from '../../common/deploy/helpers';
import { getNetworkKey } from '../../common/utils';
import { sedaScope } from '../../index';

sedaScope
  .task('deploy:prover', 'Deploy the Secp256k1ProverV1 contract')
  .addParam('params', 'The parameters file to use', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deploySecp256k1Prover(hre, taskArgs);
  });

export async function deploySecp256k1Prover(
  hre: HardhatRuntimeEnvironment,
  options: {
    params: string;
    reset?: boolean;
    verify?: boolean;
  },
): Promise<{ contractAddress: string; contractImplAddress: string }> {
  const contractName = 'Secp256k1ProverV1';

  // Contract Parameters
  let constructorArgs: {
    batchHeight: number;
    blockHeight: number;
    validatorsRoot: string;
    resultsRoot: string;
    provingMetadata: string;
  };
  const params = await readAndValidateParams(options.params, contractName);
  if (params && 'initialBatch' in params) {
    constructorArgs = params.initialBatch;
  } else {
    throw new Error('SedaCoreV1 address not found in params file');
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
