import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as v from 'valibot';

import {
  confirmDeployment,
  deployAndVerifyContractWithProxy,
  logDeploymentConfig,
  readAndValidateParams,
} from '../../../common/deploy/helpers';
import { HexString } from '../../../common/params';
import { getNetworkKey } from '../../../common/utils';
import { sedaScope } from '../../../index';

sedaScope
  .task('deploy:dev:prover-reset', 'Deploys the Secp256k1ProverResettable contract (only for testing)')
  .addParam('params', 'The parameters file to use', undefined, types.string)
  .addOptionalParam('feeManagerAddress', 'The address of the FeeManager contract', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deployResettableProver(hre, taskArgs);
  });

const Secp256k1ProverResettableSchema = v.object({
  initialBatch: v.object({
    batchHeight: v.number(),
    blockHeight: v.number(),
    validatorsRoot: HexString,
    resultsRoot: HexString,
    provingMetadata: HexString,
  }),
  feeManagerAddress: v.optional(HexString),
});

export async function deployResettableProver(
  hre: HardhatRuntimeEnvironment,
  options: {
    params: string;
    feeManagerAddress?: string;
    reset?: boolean;
    verify?: boolean;
  },
): Promise<{ contractAddress: string; contractImplAddress: string }> {
  const contractName = 'Secp256k1ProverResettable';

  // Contract Parameters
  const params = await readAndValidateParams(options.params, contractName, Secp256k1ProverResettableSchema);
  const constructorArgs = {
    initialBatch: { ...params.initialBatch },
    feeManagerAddress: options.feeManagerAddress || params.feeManagerAddress,
  };

  if (!constructorArgs.feeManagerAddress) {
    throw new Error('feeManagerAddress must be provided either in the params file or as a command-line argument');
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
    [constructorArgs.initialBatch, constructorArgs.feeManagerAddress],
    owner,
    options.verify,
  );
}
