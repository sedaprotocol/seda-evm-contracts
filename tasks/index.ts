import { scope, types } from 'hardhat/config';

/**
 * Defines the scope for SEDA-related tasks.
 */
export const sedaScope = scope('seda', 'Deploy and interact with SEDA contracts');

import './postRequest';

import { deployAll } from './deployAll';
import { deploySedaCore } from './deployCore';
import { deployMock } from './deployPermissioned';
import { deploySecp256k1Prover } from './deployProver';

sedaScope
  .task('deploy:core', 'Deploy the SedaCoreV1 contract')
  .addOptionalParam('params', 'The parameters file to use', undefined, types.string)
  .addOptionalParam('proverAddress', 'Direct SedaProver contract address', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deploySedaCore(hre, taskArgs);
  });

sedaScope
  .task('deploy:prover', 'Deploy the Secp256k1ProverV1 contract')
  .addParam('params', 'The parameters file to use', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deploySecp256k1Prover(hre, taskArgs);
  });

sedaScope
  .task('deploy:all', 'Deploy the Secp256k1ProverV1 and SedaCoreV1 contracts')
  .addParam('params', 'The parameters file to use', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deployAll(hre, taskArgs);
  });

sedaScope
  .task('deploy:permissioned', 'Deploy the Permissioned Seda contract (only for testing)')
  .addOptionalParam('maxReplicationFactor', 'The maximum replication factor', undefined, types.int)
  .addOptionalParam('params', 'The parameters file to use', undefined, types.string)
  .addFlag('reset', 'Replace existing deployment files')
  .addFlag('verify', 'Verify the contract on etherscan')
  .setAction(async (taskArgs, hre) => {
    await deployMock(hre, taskArgs);
  });