import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { sedaScope } from '../../..';
import { logger } from '../../../common/logger';
import { deploySedaCore } from '../core';
import { deployFeeManager } from '../feeManager';
import { deployResettableProver } from './resettableProver';

sedaScope
  .task('deploy:dev:all-reset', 'Deploys the Secp256k1ProverV1 and SedaCoreV1 contracts')
  .addParam('params', 'The parameters file to use', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deployAll(hre, taskArgs);
  });

export async function deployAll(
  hre: HardhatRuntimeEnvironment,
  options: {
    params: string;
    reset?: boolean;
    verify?: boolean;
  },
) {
  // 1. Deploy FeeManager
  logger.section('1. Deploy FeeManager contracts', 'meta');
  const { contractAddress: feeManagerAddress } = await deployFeeManager(hre, {
    verify: options.verify,
    reset: options.reset,
  });

  // 1. Deploy Secp256k1Prover
  logger.section('1. Deploy Secp256k1Prover contracts', 'meta');
  const { contractAddress: proverAddress } = await deployResettableProver(hre, {
    params: options.params,
    feeManagerAddress: feeManagerAddress,
    verify: options.verify,
    reset: options.reset,
  });

  // 2. Deploy SedaCore using the prover address
  logger.section('2. Deploy SedaCoreV1 contracts', 'meta');
  await deploySedaCore(hre, {
    proverAddress: proverAddress,
    verify: options.verify,
    reset: true,
  });
}
