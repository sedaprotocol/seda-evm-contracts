import fs from 'node:fs';
import path from 'node:path';
import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { deploySedaCore } from '../tasks/tasks/deploy/core';
import { deployResettableProver } from '../tasks/tasks/deploy/dev/resettableProver';
import { deployFeeManager } from '../tasks/tasks/deploy/feeManager';
import { deploySecp256k1Prover } from '../tasks/tasks/deploy/prover';

async function main() {
  console.log('🧪 Testing All Deployment Functions');

  // Proper bytes32 value (32 bytes = 64 hex chars + 0x prefix)
  const bytes32Value = `0x${'0'.repeat(64)}`;

  const testParams = {
    Secp256k1ProverV1: {
      initialBatch: {
        batchHeight: 1,
        blockHeight: 1,
        validatorsRoot: bytes32Value,
        resultsRoot: bytes32Value,
        provingMetadata: bytes32Value,
      },
      maxBatchAge: 100,
    },
    Secp256k1ProverResettable: {
      initialBatch: {
        batchHeight: 1,
        blockHeight: 1,
        validatorsRoot: bytes32Value,
        resultsRoot: bytes32Value,
        provingMetadata: bytes32Value,
      },
      maxBatchAge: 100,
    },
    SedaCoreV1: {
      timeoutPeriod: 86400,
    },
    SedaPermissioned: {
      maxReplicationFactor: 1,
    },
  };

  try {
    // 1. Deploy FeeManager
    console.log('\n1. Testing FeeManager deployment');
    const { contractAddress: feeManagerAddress } = await deployFeeManager(hre, { reset: true });
    console.log(`✓ FeeManager deployed at: ${feeManagerAddress}`);

    // 2. Deploy Secp256k1ProverV1
    console.log('\n2. Testing Secp256k1ProverV1 deployment');
    const { contractAddress: proverAddress } = await deploySecp256k1Prover(hre, {
      params: testParams.Secp256k1ProverV1,
      feeManagerAddress,
      reset: true,
    });
    console.log(`✓ Secp256k1ProverV1 deployed at: ${proverAddress}`);

    // 3. Deploy Secp256k1ProverResettable
    console.log('\n3. Testing Secp256k1ProverResettable deployment');
    const { contractAddress: resettableProverAddress } = await deployResettableProver(hre, {
      params: testParams.Secp256k1ProverResettable,
      feeManagerAddress,
      reset: true,
    });
    console.log(`✓ Secp256k1ProverResettable deployed at: ${resettableProverAddress}`);

    // 4. Deploy SedaCoreV1
    console.log('\n4. Testing SedaCoreV1 deployment');
    const { contractAddress: coreAddress } = await deploySedaCore(hre, {
      params: testParams.SedaCoreV1,
      proverAddress,
      reset: true,
    });
    console.log(`✓ SedaCoreV1 deployed at: ${coreAddress}`);

    console.log('\n✅ All Deployment Functions Passed!');
  } catch (error) {
    console.error(`❌ Deployment tests failed: ${error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
