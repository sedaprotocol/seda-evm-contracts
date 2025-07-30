import { logger } from '../../common/logger';
import { getContractAddress } from '../../common/utils';
import { sedaScope } from '../../index';

sedaScope
  .task('utils:query-core', 'Query data from the Core contract')
  .addOptionalPositionalParam('core', 'The address of the Core contract')
  .setAction(async (taskArgs, hre) => {
    logger.section('Query SedaCoreV1 Contract', 'default');

    // Get contract address - either from parameter or deployment files
    let coreAddress = taskArgs.core;
    if (!coreAddress) {
      coreAddress = await getContractAddress(hre, 'SedaCoreV1');
      if (!coreAddress) {
        throw new Error(
          'No core address provided and no deployment found for current network. Please provide --core address parameter.',
        );
      }
      logger.info(`Using deployed SedaCoreV1 address: ${coreAddress}`);
    } else {
      logger.info(`Using provided SedaCoreV1 address: ${coreAddress}`);
    }

    try {
      const core = await hre.ethers.getContractAt('SedaCoreV1', coreAddress);

      // Basic contract information
      logger.section('Contract Information', 'config');
      const feeManager = await core.getFeeManager();
      logger.info(`Fee Manager: ${feeManager.toString()}`);

      const prover = await core.getSedaProver();
      logger.info(`Prover: ${prover.toString()}`);

      const timeoutPeriod = await core.getTimeoutPeriod();
      logger.info(`Timeout Period: ${timeoutPeriod.toString()} seconds`);

      // Check if contract is paused
      const paused = await core.paused();
      logger.info(`Contract Paused: ${paused}`);

      // Get owner
      const owner = await core.owner();
      logger.info(`Contract Owner: ${owner}`);

      // Pending requests information
      logger.section('Pending Requests Information', 'params');
      const pendingRequests = await core.getPendingRequests(0, 100);
      logger.info(`Pending Requests IDs (total: ${pendingRequests.length})`);

      if (pendingRequests.length > 0) {
        for (let i = 0; i < Math.min(pendingRequests.length, 5); i++) {
          const request = pendingRequests[i];
          logger.withPrefix(`${i}`).info(`${request.id}`);
        }

        if (pendingRequests.length > 5) {
          logger.info(`... and ${pendingRequests.length - 5} more requests`);
        }
      }
    } catch (error) {
      logger.error(`Failed to query core contract: ${error}`);
      throw error;
    }
  });
