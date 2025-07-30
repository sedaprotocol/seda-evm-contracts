import { logger } from '../../common/logger';
import { getContractAddress } from '../../common/utils';
import { sedaScope } from '../../index';

sedaScope
  .task('utils:pause', 'Pause or unpause a contract (core or prover)')
  .addParam('action', 'Action to perform: pause or unpause')
  .addOptionalParam('contract', 'The type of contract: core or prover', 'core')
  .addOptionalParam('address', 'The address of the contract (if not provided, will use deployed address)')
  .setAction(async (taskArgs, hre) => {
    const { action, contract, address } = taskArgs;

    if (!['pause', 'unpause'].includes(action)) {
      throw new Error('Action must be either "pause" or "unpause"');
    }

    if (!['core', 'prover'].includes(contract)) {
      throw new Error('Contract must be either "core" or "prover"');
    }

    logger.section(`${action.charAt(0).toUpperCase() + action.slice(1)} ${contract} contract`, 'deploy');

    // Get contract address - either from parameter or deployment files
    let contractAddress = address;
    const contractName = contract === 'core' ? 'SedaCoreV1' : 'Secp256k1ProverV1';

    if (!contractAddress) {
      contractAddress = await getContractAddress(hre, contractName);
      if (!contractAddress) {
        throw new Error(
          `No ${contract} address provided and no deployment found for current network. Please provide --address parameter.`,
        );
      }
      logger.info(`Using deployed ${contractName} address: ${contractAddress}`);
    } else {
      logger.info(`Using provided ${contractName} address: ${contractAddress}`);
    }

    const contractInstance = await hre.ethers.getContractAt(contractName, contractAddress);

    try {
      // Check current pause status
      const isPaused = await contractInstance.paused();
      logger.info(`Current pause status: ${isPaused ? 'PAUSED' : 'UNPAUSED'}`);

      // Check if we're trying to pause an already paused contract or unpause an unpaused contract
      if (action === 'pause' && isPaused) {
        logger.warn('Contract is already paused');
        return;
      }

      if (action === 'unpause' && !isPaused) {
        logger.warn('Contract is already unpaused');
        return;
      }

      // Get the signer (should be the owner)
      const [signer] = await hre.ethers.getSigners();
      logger.info(`Using signer: ${signer.address}`);

      // Check if signer is the owner
      const owner = await contractInstance.owner();
      if (signer.address !== owner) {
        throw new Error(`Signer ${signer.address} is not the contract owner ${owner}`);
      }

      // Execute the pause/unpause action
      const tx =
        action === 'pause'
          ? await contractInstance.connect(signer).pause()
          : await contractInstance.connect(signer).unpause();

      logger.info(`Transaction hash: ${tx.hash}`);
      await tx.wait();

      logger.success(`${action.charAt(0).toUpperCase() + action.slice(1)} transaction confirmed!`);
    } catch (error) {
      logger.error(`Failed to ${action} ${contract} contract: ${error}`);
      throw error;
    }
  });
