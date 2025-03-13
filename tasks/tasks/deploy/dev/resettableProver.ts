import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { sedaScope } from '../../../index';
import { deployProver } from '../proverBase';

sedaScope
  .task('deploy:dev:prover-reset', 'Deploys the Secp256k1ProverResettable contract (only for testing)')
  .addParam('params', 'The parameters file to use', undefined, types.string)
  .addOptionalParam('feeManagerAddress', 'The address of the FeeManager contract', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deployResettableProver(hre, taskArgs);
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
  return deployProver(hre, 'Secp256k1ProverResettable', options);
}
