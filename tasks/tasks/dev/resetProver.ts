import { logger } from '../../common/logger';
import { sedaScope } from '../../index';

sedaScope
  .task('dev:reset-prover', 'Resets a Secp256k1ProverResettable contract to a specified batch (only for testing)')
  .addParam('prover', 'The address of the resettable prover contract')
  .addParam('height', 'The batch height to reset to')
  .addParam('validatorsRoot', 'The validators root hash')
  .addParam('resultsRoot', 'The results root hash')
  .setAction(async (taskArgs, hre) => {
    logger.section('Reset Prover', 'deploy');

    const prover = await hre.ethers.getContractAt('Secp256k1ProverResettable', taskArgs.prover);
    logger.info(`Prover address: ${taskArgs.prover}`);

    // Validate input parameters
    if (BigInt(taskArgs.height) < 0n) {
      throw new Error('Batch height must be non-negative');
    }
    if (!taskArgs.validatorsRoot.startsWith('0x')) {
      throw new Error('Validators root must be a hex string starting with 0x');
    }
    if (!taskArgs.resultsRoot.startsWith('0x')) {
      throw new Error('Results root must be a hex string starting with 0x');
    }

    const batch = {
      batchHeight: BigInt(taskArgs.height),
      validatorsRoot: taskArgs.validatorsRoot,
      resultsRoot: taskArgs.resultsRoot,
    };

    logger.info('Resetting prover with parameters:');
    logger.info(`  Batch Height: ${batch.batchHeight}`);
    logger.info(`  Validators Root: ${batch.validatorsRoot}`);
    logger.info(`  Results Root: ${batch.resultsRoot}`);

    try {
      const tx = await prover.resetProverState({
        batchHeight: batch.batchHeight,
        blockHeight: 0n,
        validatorsRoot: batch.validatorsRoot,
        resultsRoot: batch.resultsRoot,
        provingMetadata: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      logger.info('Waiting for transaction confirmation...');
      const receipt = await tx.wait();
      logger.info(`Transaction confirmed in block ${receipt?.blockNumber}`);

      logger.success('Prover reset successfully!');
    } catch (error) {
      logger.error(`Error resetting prover:, ${error}`);
      throw error;
    }
  });
