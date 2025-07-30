import { logger } from '../../common/logger';
import { getContractAddress } from '../../common/utils';
import { sedaScope } from '../../index';

sedaScope
  .task('utils:transfer-ownership', 'Transfer ownership of a contract (core or prover)')
  .addPositionalParam('contract', 'The type of contract: core or prover')
  .addPositionalParam('newOwner', 'The address of the new owner')
  .addOptionalParam('address', 'The address of the contract (if not provided, will use deployed address)')
  .setAction(async (taskArgs, hre) => {
    const { newOwner, contract, address } = taskArgs;

    if (!['core', 'prover'].includes(contract)) {
      throw new Error('Contract must be either "core" or "prover"');
    }

    // Validate the new owner address
    if (!hre.ethers.isAddress(newOwner)) {
      throw new Error('Invalid new owner address provided');
    }

    logger.section(`Transfer ownership of ${contract} contract`, 'deploy');

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
      // Get the signer (should be the current owner)
      const [signer] = await hre.ethers.getSigners();
      logger.info(`Using signer: ${signer.address}`);

      // Check current owner
      const currentOwner = await contractInstance.owner();
      logger.info(`Current owner: ${currentOwner}`);

      // Check if signer is the current owner
      if (signer.address !== currentOwner) {
        throw new Error(`Signer ${signer.address} is not the current owner ${currentOwner}`);
      }

      // Check if new owner is different from current owner
      if (newOwner === currentOwner) {
        logger.warn('New owner is the same as current owner. No transfer needed.');
        return;
      }

      // Check if new owner is the zero address (which would renounce ownership)
      if (newOwner === hre.ethers.ZeroAddress) {
        logger.warn(
          'Transferring to zero address will renounce ownership. Consider using renounceOwnership() instead.',
        );
      }

      logger.info(`Transferring ownership to: ${newOwner}`);

      // Execute the ownership transfer
      const tx = await contractInstance.connect(signer).transferOwnership(newOwner);
      logger.info(`Transaction hash: ${tx.hash}`);
      const receipt = await tx.wait();

      logger.success('Ownership transfer transaction confirmed!');
      logger.info(`Block number: ${receipt?.blockNumber}`);

      // Verify the new owner
      const newOwnerAfterTransfer = await contractInstance.owner();
      logger.info(`New owner: ${newOwnerAfterTransfer}`);

      if (newOwnerAfterTransfer === newOwner) {
        logger.success('Ownership transfer completed successfully!');
      } else {
        logger.error('Ownership transfer may have failed. Please verify the transaction.');
      }
    } catch (error) {
      logger.error(`Failed to transfer ownership of ${contract} contract: ${error}`);
      throw error;
    }
  });
