import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { logger } from './common/logger';
import { deploySedaCore } from './deployCore';
import { deploySecp256k1Prover } from './deployProver';

export async function deployAll(
  hre: HardhatRuntimeEnvironment,
  options: {
    params: string;
    reset?: boolean;
    verify?: boolean;
  },
) {
  // 1. Deploy Secp256k1Prover
  logger.section('1. Deploy Secp256k1Prover contracts', 'meta');
  const { contractAddress } = await deploySecp256k1Prover(hre, {
    params: options.params,
    verify: options.verify,
    reset: options.reset,
  });

  // 2. Deploy SedaCore using the prover address
  logger.section('2. Deploy SedaCoreV1 contracts', 'meta');
  await deploySedaCore(hre, {
    proverAddress: contractAddress,
    verify: options.verify,
    reset: options.reset,
  });
}
