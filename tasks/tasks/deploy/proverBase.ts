import { types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as v from 'valibot';

import {
  confirmDeployment,
  deployAndVerifyContractWithProxy,
  logDeploymentConfig,
  readAndValidateParams,
} from '../../common/deploy/helpers';
import type { UupsContracts } from '../../common/deploy/proxy';
import { HexString } from '../../common/params';
import { getNetworkKey } from '../../common/utils';

// Common schema for both prover types
export const ProverSchema = v.object({
  initialBatch: v.object({
    batchHeight: v.number(),
    blockHeight: v.number(),
    validatorsRoot: HexString,
    resultsRoot: HexString,
    provingMetadata: HexString,
  }),
  maxBatchAge: v.optional(v.number()),
  feeManagerAddress: v.optional(HexString),
});

// Generic deployment function for both prover types
export async function deployProver(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  options: {
    params: string | object;
    maxBatchAge?: number;
    feeManagerAddress?: string;
    reset?: boolean;
    verify?: boolean;
  },
): Promise<{ contractAddress: string; contractImplAddress: string }> {
  console.log('options', options);
  // Contract Parameters
  const params = await readAndValidateParams(options.params, contractName, ProverSchema);
  const constructorArgs = {
    initialBatch: { ...params.initialBatch },
    maxBatchAge: options.maxBatchAge || params.maxBatchAge,
    feeManagerAddress: options.feeManagerAddress || params.feeManagerAddress,
  };

  if (!constructorArgs.maxBatchAge) {
    throw new Error('maxBatchAge must be provided either in the params file or as a command-line argument');
  }

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
    contractName as keyof UupsContracts,
    [constructorArgs.initialBatch, constructorArgs.maxBatchAge, constructorArgs.feeManagerAddress],
    owner,
    options.verify,
  );
}
