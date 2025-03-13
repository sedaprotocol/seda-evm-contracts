import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { sedaScope } from '../../index';
import { deployProver } from './proverBase';

sedaScope
  .task('deploy:prover', 'Deploys the Secp256k1ProverV1 contract')
  .addParam('params', 'The parameters file to use', undefined, types.string)
  .addOptionalParam('feeManagerAddress', 'The address of the FeeManager contract', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deploySecp256k1Prover(hre, taskArgs);
  });

export async function deploySecp256k1Prover(
  hre: HardhatRuntimeEnvironment,
  options: {
    params: string;
    feeManagerAddress?: string;
    reset?: boolean;
    verify?: boolean;
  },
): Promise<{ contractAddress: string; contractImplAddress: string }> {
  return deployProver(hre, 'Secp256k1ProverV1', options);
}
