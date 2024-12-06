import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { SedaDataTypes } from '../typechain-types/contracts/libraries/SedaDataTypes';
import { updateAddresses } from './common/addresses';
import { CONFIG } from './common/config';
import { updateDeployment } from './common/deployment';
import { directoryExists } from './common/io';
import { prompt } from './common/io';
import { logger } from './common/logger';
import { readParams } from './common/params';
import { deployProxyContract } from './common/proxy';

interface Secp256k1ProverV1Params {
  initialBatch: SedaDataTypes.BatchStruct;
}

export async function deploySecp256k1Prover(
  hre: HardhatRuntimeEnvironment,
  options: {
    params: string;
    verify?: boolean;
  },
): Promise<{ contractAddress: string; contractImplAddress: string }> {
  const { params, verify } = options;
  const contractName = 'Secp256k1ProverV1';

  // Contract Parameters
  logger.section('Contract Parameters', 'params');
  const proverParams = await readParams<Secp256k1ProverV1Params>(
    params,
    ['batchHeight', 'blockHeight', 'validatorsRoot', 'resultsRoot', 'provingMetadata'],
    ['Secp256k1ProverV1', 'initialBatch'],
  );
  logger.info(`Using parameters file: ${params}`);
  logger.info(`File Content: \n  ${JSON.stringify(proverParams, null, 2).replace(/\n/g, '\n  ')}`);

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
  // If deployments folder exists, ask user to confirm by typing 'yes'
  if (await directoryExists(CONFIG.DEPLOYMENTS.FOLDER)) {
    const confirmation = await prompt('Deployments folder already exists. Type "yes" to continue: ');
    if (confirmation !== 'yes') {
      logger.error('Deployment aborted.');
      throw new Error('Deployment aborted: User cancelled the operation');
    }
  }
  const { contract, contractImplAddress } = await deployProxyContract(hre, contractName, [proverParams], owner);
  const contractAddress = await contract.getAddress();
  logger.success(`Proxy address: ${contractAddress}`);
  logger.success(`Impl. address: ${contractImplAddress}`);

  // Update deployment files
  logger.section('Updating Deployment Files', 'files');
  await updateDeployment(hre, contractName);
  await updateAddresses(hre, contractName, contractAddress, contractImplAddress);

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
        logger.info('Contract is already verified on block explorer');
      } else {
        logger.warn(`Verification failed: ${error}`);
      }
    }
  }

  return { contractAddress, contractImplAddress };
}
