import type { Signer } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type * as v from 'valibot';

import { CONFIG } from '../config';
import { pathExists, prompt } from '../io';
import { logger } from '../logger';
import { readParams } from '../params';
import { getNetworkKey } from '../utils';
import { type UupsContracts, deployProxyContract } from './proxy';
import { updateAddressesFile, updateDeployment } from './reports';

/**
 * Reads parameters from a file, validates them against a schema, and logs the results.
 * This is typically used to ensure contract constructor arguments meet expected format and constraints
 * before deployment.
 */
export async function readAndValidateParams<TInput, TOutput>(
  paramsFilePath: string,
  contractKey: string,
  schema: v.BaseSchema<TInput, TOutput, v.BaseIssue<unknown>>,
): Promise<TOutput> {
  // Contract Parameters
  logger.section('Contract Parameters', 'params');
  logger.info(`Using parameters file: ${paramsFilePath}`);
  const deployParams = await readParams(paramsFilePath, contractKey, schema);

  logger.info(`Deployment Params: \n  ${JSON.stringify(deployParams, null, 2).replace(/\n/g, '\n  ')}`);

  return deployParams;
}

/**
 * Pretty prints constructor arguments with custom formatting.
 */
export function logConstructorArgs(infoText: string, params: object): void {
  logger.section('Contract Parameters', 'params');
  logger.info(infoText);
  logger.info(`Deployment Params: \n  ${JSON.stringify(params, null, 2).replace(/\n/g, '\n  ')}`);
}

/**
 * Safety check to prevent accidental deployments to already deployed networks.
 * If deployments already exist for the target network, requires explicit user confirmation
 * unless the reset flag is set to true.
 */
export async function confirmDeployment(networkKey: string, reset: boolean | undefined): Promise<void> {
  if (!reset && (await pathExists(`${CONFIG.DEPLOYMENTS.FOLDER}/${networkKey}`))) {
    const confirmation = await prompt(`Deployments folder for ${networkKey} already exists. Type "yes" to continue: `);
    if (confirmation !== 'yes') {
      logger.error('Deployment aborted.');
      throw new Error('Deployment aborted: User cancelled the operation');
    }
  }
}

/**
 * Handles the complete proxy contract deployment workflow:
 * 1. Deploys implementation contract
 * 2. Deploys proxy contract pointing to the implementation
 * 3. Updates deployment records and address files
 * 4. Optionally verifies contracts on block explorer
 * Returns both proxy and implementation addresses
 */
export async function deployAndVerifyContractWithProxy<T extends keyof UupsContracts>(
  hre: HardhatRuntimeEnvironment,
  contractName: T,
  constructorArgs: UupsContracts[T]['constructorArgs'],
  owner: Signer,
  verify: boolean | undefined,
): Promise<{ contractAddress: string; contractImplAddress: string }> {
  // Deploy
  logger.section('Deploying Contracts', 'deploy');
  const { contract, contractImplAddress } = await deployProxyContract(hre, contractName, constructorArgs, owner);
  const contractAddress = await contract.getAddress();
  logger.success(`Proxy address: ${contractAddress}`);
  logger.success(`Impl. address: ${contractImplAddress}`);

  // Update deployment files (if not local hardhat)
  if (hre.network.name !== 'hardhat') {
    logger.section('Updating Deployment Files', 'files');
    const networkKey = await getNetworkKey(hre);
    await updateDeployment(hre, contractName);
    await updateAddressesFile(networkKey, contractName, {
      proxy: contractAddress,
      implementation: contractImplAddress,
    });
    if (verify) {
      await verifyContract(hre, contractAddress);
    }
  }

  return { contractAddress, contractImplAddress };
}

/**
 * Attempts to verify contract source code on the network's block explorer (e.g., Etherscan).
 * Handles common verification scenarios including:
 * - Already verified contracts
 * - Failed verifications with detailed error reporting
 */
export async function verifyContract(hre: HardhatRuntimeEnvironment, address: string) {
  logger.section('Verifying Contracts', 'verify');
  try {
    await hre.run('verify:verify', {
      address,
    });
    logger.success('Contract verified successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Already Verified')) {
      logger.info('Contract is already verified on block explorer');
    } else {
      logger.warn(`Verification failed: ${error}`);
    }
  }
}

/**
 * Outputs essential deployment context including:
 * - Target network and chain ID
 * - Deployer address and balance
 * - Contract being deployed
 */
export async function logDeploymentConfig(hre: HardhatRuntimeEnvironment, contractName: string, owner: Signer) {
  const address = await owner.getAddress();

  logger.section('Deployment Configuration', 'config');
  logger.info(`Contract: ${contractName}`);
  logger.info(`Network:  ${hre.network.name}`);
  logger.info(`Chain ID: ${hre.network.config.chainId}`);
  const balance = hre.ethers.formatEther(owner.provider ? await owner.provider.getBalance(address) : '?');
  logger.info(`Deployer: ${address} (${balance} ETH)`);
}

/**
 * Handles the complete standard contract deployment workflow:
 * 1. Deploys contract with provided constructor arguments
 * 2. Updates deployment records and address files
 * 3. Optionally verifies contract on block explorer
 * Similar to deployAndVerifyContractWithProxy but for non-proxy contracts
 */
export async function deployAndVerifyContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  constructorArgs: unknown[],
  verify: boolean | undefined,
): Promise<{ contractAddress: string }> {
  // Deploy
  logger.section('Deploying Contracts', 'deploy');
  const factory = await hre.ethers.getContractFactory(contractName);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  logger.success(`Contract address: ${contractAddress}`);

  // Update deployment files
  logger.section('Updating Deployment Files', 'files');
  const networkKey = await getNetworkKey(hre);
  await updateDeployment(hre, contractName);
  await updateAddressesFile(networkKey, contractName, contractAddress);

  if (verify) {
    await verifyContract(hre, contractAddress);
  }

  return { contractAddress };
}
