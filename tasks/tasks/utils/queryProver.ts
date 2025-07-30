import { logger } from '../../common/logger';
import { getContractAddress } from '../../common/utils';
import { sedaScope } from '../../index';

sedaScope
  .task('utils:query-prover', 'Query data from the Prover contract')
  .addOptionalPositionalParam('prover', 'The address of the Prover contract')
  .setAction(async (taskArgs, hre) => {
    logger.section('Query Secp256k1ProverV1 Contract', 'default');

    // Get contract address - either from parameter or deployment files
    let proverAddress = taskArgs.prover;
    if (!proverAddress) {
      proverAddress = await getContractAddress(hre, 'Secp256k1ProverV1');
      if (!proverAddress) {
        throw new Error(
          'No prover address provided and no deployment found for current network. Please provide --prover address parameter.',
        );
      }
      logger.info(`Using deployed Secp256k1ProverV1 address: ${proverAddress}`);
    } else {
      logger.info(`Using provided Secp256k1ProverV1 address: ${proverAddress}`);
    }

    try {
      const prover = await hre.ethers.getContractAt('Secp256k1ProverV1', proverAddress);

      // Basic contract information
      logger.section('Contract Information', 'config');
      const feeManager = await prover.getFeeManager();
      logger.info(`Fee Manager: ${feeManager.toString()}`);

      const lastBatchHeight = await prover.getLastBatchHeight();
      logger.info(`Last Batch Height: ${lastBatchHeight.toString()}`);

      const lastValidatorsRoot = await prover.getLastValidatorsRoot();
      logger.info(`Last Validators Root: ${lastValidatorsRoot}`);

      const maxBatchAge = await prover.getMaxBatchAge();
      logger.info(`Max Batch Age: ${maxBatchAge.toString()}`);

      // Check if contract is paused
      const paused = await prover.paused();
      logger.info(`Contract Paused: ${paused}`);

      // Get owner
      const owner = await prover.owner();
      logger.info(`Contract Owner: ${owner}`);

      // Get consensus percentage (constant)
      const consensusPercentage = await prover.CONSENSUS_PERCENTAGE();
      logger.info(
        `Consensus Percentage: ${consensusPercentage.toString()} (${Number(consensusPercentage) / 1000000}%)`,
      );

      // Batch information
      logger.section('Last Batch Information', 'params');
      if (lastBatchHeight > 0) {
        // Get the latest batch data
        const latestBatch = await prover.getBatch(lastBatchHeight);
        logger.info(`Batch Height: ${lastBatchHeight}`);
        logger.info(`Results Root: ${latestBatch.resultsRoot}`);
        logger.info(`Sender: ${latestBatch.sender}`);
      } else {
        logger.info(`No batches have been posted yet.`);
      }
    } catch (error) {
      logger.error(`Failed to query prover contract: ${error}`);
      throw error;
    }
  });
