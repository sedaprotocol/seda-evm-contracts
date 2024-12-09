import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CONFIG } from './common/config';
import { pathExists } from './common/io';
import { prompt } from './common/io';
import { logger } from './common/logger';
import { readParams } from './common/params';
import { updateAddressesFile, updateDeployment } from './common/reports';

export async function deployMock(
  hre: HardhatRuntimeEnvironment,
  options: {
    params?: string;
    maxReplicationFactor?: number;
    reset?: boolean;
    verify?: boolean;
  },
): Promise<{ contractAddress: string }> {
  const contractName = 'SedaPermissioned';

  // Contract Parameter: Replication Factor (1 by default)
  logger.section('Contract Parameters', 'params');
  let maxReplicationFactor = 1;

  if (options.params) {
    logger.info(`Using parameters file: ${options.params}`);
    const params = await readParams(options.params);
    maxReplicationFactor = params.SedaPermissioned.maxReplicationFactor;
  } else if (options.maxReplicationFactor) {
    maxReplicationFactor = options.maxReplicationFactor;
  }
  logger.info(`Max Replication Factor: ${maxReplicationFactor}`);

  // Configuration
  logger.section('Deployment Configuration', 'config');
  logger.info(`Contract: ${contractName}`);
  logger.info(`Network:  ${hre.network.name}`);
  logger.info(`Chain ID: ${hre.network.config.chainId}`);
  const [owner] = await hre.ethers.getSigners();
  const balance = hre.ethers.formatEther(await owner.provider.getBalance(owner.address));
  logger.info(`Deployer: ${owner.address} (${balance} ETH)`);

  // Deploy
  logger.section('Deploying Contracts', 'deploy');
  const networkKey = `${hre.network.name}-${hre.network.config.chainId}`;
  if (!options.reset && (await pathExists(`${CONFIG.DEPLOYMENTS.FOLDER}/${networkKey}`))) {
    const confirmation = await prompt('Deployments folder already exists. Type "yes" to continue: ');
    if (confirmation !== 'yes') {
      logger.error('Deployment aborted.');
      throw new Error('Deployment aborted: User cancelled the operation');
    }
  }

  const factory = await hre.ethers.getContractFactory(contractName);
  const contract = await factory.deploy([owner.address], maxReplicationFactor);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  logger.success(`Contract address: ${contractAddress}`);

  // Update deployment files
  logger.section('Updating Deployment Files', 'files');
  await updateDeployment(hre, contractName);
  await updateAddressesFile(networkKey, contractName, contractAddress);

  if (options.verify) {
    logger.section('Verifying Contracts', 'verify');
    try {
      await hre.run('verify:verify', {
        address: contractAddress,
      });
      logger.success('Contract verified successfully');
    } catch (error) {
      // Check if the error is "Already Verified"
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Already Verified')) {
        logger.info('Contract is already verified on block explorer');
      } else {
        logger.warn(`Verification failed: ${error}`);
      }
    }
  }

  return { contractAddress };
}
