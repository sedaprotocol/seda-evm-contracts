import type { Signer } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type * as v from 'valibot';
import { CONFIG } from '../config';
import { pathExists, prompt } from '../io';
import { logger } from '../logger';
import { getNetworkKey } from '../utils';
import { type ParamsSchema, readParams } from './params';
import { type UupsContracts, deployProxyContract } from './proxy';
import { updateAddressesFile, updateDeployment } from './reports';

/**
 * Validates and prepares constructor arguments from various sources
 */
export async function readAndValidateParams(
  paramsFilePath: string,
  contractKey: string,
): Promise<v.InferOutput<typeof ParamsSchema>[keyof v.InferOutput<typeof ParamsSchema>]> {
  // Contract Parameters
  logger.section('Contract Parameters', 'params');
  logger.info(`Using parameters file: ${paramsFilePath}`);
  const deployParams = await readParams(paramsFilePath);

  // Type guard to check if contractKey is a valid key of proverParams
  if (!(contractKey in deployParams)) {
    throw new Error(`${contractKey} parameters not found in file`);
  }

  // Now TypeScript knows contractKey is a valid key
  const constructorArgs = deployParams[contractKey as keyof typeof deployParams];
  logger.info(`Deployment Params: \n  ${JSON.stringify(constructorArgs, null, 2).replace(/\n/g, '\n  ')}`);

  if (constructorArgs === undefined) {
    throw new Error(`${contractKey} parameters not found in file`);
  }

  return constructorArgs;
}

/**
 * Logs constructor arguments
 */
export function logConstructorArgs(infoText: string, params: object): void {
  logger.section('Contract Parameters', 'params');
  logger.info(infoText);
  logger.info(`Deployment Params: \n  ${JSON.stringify(params, null, 2).replace(/\n/g, '\n  ')}`);
}

/**
 * Confirms deployment by checking if deployment folder exists and prompting for confirmation
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
 * Deploys a contract with a proxy and verifies it (if requested)
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

  // Update deployment files
  logger.section('Updating Deployment Files', 'files');
  const networkKey = await getNetworkKey(hre);
  await updateDeployment(hre, contractName);
  await updateAddressesFile(networkKey, contractName, { proxy: contractAddress, implementation: contractImplAddress });

  if (verify) {
    await verifyContract(hre, contractAddress);
  }

  return { contractAddress, contractImplAddress };
}

/**
 * Verifies a contract
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
 * Logs deployment configuration
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
 * Deploys a contract with a proxy and verifies it (if requested)
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
