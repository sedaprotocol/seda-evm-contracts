import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CONFIG } from './common/config';
import { pathExists } from './common/io';
import { prompt } from './common/io';
import { logger } from './common/logger';
import { readParams } from './common/params';
import { updateAddressesFile, updateDeployment } from './common/reports';
import { deployProxyContract } from './common/uupsProxy';

interface SedaCoreV1Params {
  sedaProverAddress: string;
}

export async function deploySedaCore(
  hre: HardhatRuntimeEnvironment,
  options: {
    params?: string;
    proverAddress?: string;
    reset?: boolean;
    verify?: boolean;
  },
) {
  const { params, proverAddress, verify } = options;
  const contractName = 'SedaCoreV1';

  // Add Contract Parameters section
  logger.section('Contract Parameters', 'params');
  // Check for conflicting parameters
  if (params && proverAddress) {
    throw new Error('Both params file and proverAddress cannot be provided simultaneously.');
  }

  // Validate parameters
  let sedaProverAddress: string;
  if (params) {
    const sedaProverParams = await readParams<SedaCoreV1Params>(params, ['sedaProverAddress'], ['SedaCoreV1']);
    sedaProverAddress = sedaProverParams.sedaProverAddress;
    logger.info(`Using parameters file: ${params}`);
    logger.info(`File content: \n  ${JSON.stringify(sedaProverParams, null, 2).replace(/\n/g, '\n  ')}`);
  } else if (proverAddress) {
    // Use the directly provided prover address
    sedaProverAddress = proverAddress;
    logger.info(`Using provided prover address parameter: ${sedaProverAddress}`);
  } else {
    // Try to read from deployments/addresses.json
    try {
      const networkKey = `${hre.network.name}-${hre.network.config.chainId}`;
      const addressesPath = `../../${CONFIG.DEPLOYMENTS.FOLDER}/${CONFIG.DEPLOYMENTS.FILES.ADDRESSES}`;
      const addresses = require(addressesPath);
      const proverDeployment = addresses[networkKey]?.Secp256k1ProverV1;

      if (!proverDeployment?.proxy) {
        throw new Error(`No Secp256k1ProverV1 proxy address found in ${CONFIG.DEPLOYMENTS.FILES.ADDRESSES}`);
      }

      sedaProverAddress = proverDeployment.proxy;
      logger.info(`Using prover address from deployments/addresses.json: ${sedaProverAddress}`);
    } catch {
      throw new Error('Either params file or proverAddress must be provided, or Secp256k1ProverV1 must be deployed');
    }
  }

  // Configuration
  logger.section('Deployment Configuration', 'config');
  logger.info(`Contract:  ${contractName}`);
  logger.info(`Network:   ${hre.network.name}`);
  logger.info(`Chain ID:  ${hre.network.config.chainId}`);
  const [owner] = await hre.ethers.getSigners();
  const balance = hre.ethers.formatEther(await owner.provider.getBalance(owner.address));
  logger.info(`Deployer:  ${owner.address} (${balance} ETH)`);

  // Deploy
  logger.section('Deploying Contracts', 'deploy');
  const networkKey = `${hre.network.name}-${hre.network.config.chainId}`;
  if (!options.reset && (await pathExists(`${CONFIG.DEPLOYMENTS.FOLDER}/${networkKey}`))) {
    const confirmation = await prompt(`Deployments folder for ${networkKey} already exists. Type "yes" to continue: `);
    if (confirmation !== 'yes') {
      logger.error('Deployment aborted.');
      return;
    }
  }

  const { contract, contractImplAddress } = await deployProxyContract(hre, contractName, [sedaProverAddress], owner);
  const contractAddress = await contract.getAddress();
  logger.success(`Proxy address: ${contractAddress}`);
  logger.success(`Impl. address: ${contractImplAddress}`);

  // Update deployment files
  logger.section('Updating Deployment Files', 'files');
  await updateDeployment(hre, contractName);
  await updateAddressesFile(hre, contractName, contractAddress, contractImplAddress);

  if (verify) {
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
        logger.success('Contract is already verified on block explorer');
      } else {
        logger.warn(`Verification failed: ${error}`);
      }
    }
  }

  return { contract, contractAddress, contractImplAddress };
}
