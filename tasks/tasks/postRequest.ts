import { parseUnits } from 'ethers';
import { logger } from '../common/logger';
import { sedaScope } from '../index';

sedaScope
  .task('post-request', 'Post a data request to a ISedaCore contract with attached funds')
  .addParam('core', 'The address of the SedaCore contract')
  .addOptionalParam('requestFee', 'The fee for executing the request in gwei', '25000')
  .addOptionalParam('resultFee', 'The fee for posting the result in gwei', '10000')
  .addOptionalParam('batchFee', 'The fee for posting the batch in gwei', '10000')
  .setAction(async (taskArgs, hre) => {
    logger.section('Post Data Request with funds', 'deploy');

    const core = await hre.ethers.getContractAt('ISedaCore', taskArgs.core);
    logger.info(`SedaCore address: ${taskArgs.core}`);

    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const request = {
      execProgramId: '0x577cd378ec40de8f3a3fa3d19c49bd1f1dbd97d59934440b38fa8c162852537d',
      execInputs: '0x6574682d75736474',
      execGasLimit: 300000000000000n,
      tallyProgramId: '0x577cd378ec40de8f3a3fa3d19c49bd1f1dbd97d59934440b38fa8c162852537d',
      tallyInputs: '0x6574682d75736474',
      tallyGasLimit: 150000000000000n,
      replicationFactor: 10,
      consensusFilter: '0x00',
      gasPrice: 5000n,
      memo: `0x${timestamp}`,
    };

    const requestFee = parseUnits(taskArgs.requestFee, 'gwei');
    const resultFee = parseUnits(taskArgs.resultFee, 'gwei');
    const batchFee = parseUnits(taskArgs.batchFee, 'gwei');
    const totalValue = requestFee + resultFee + batchFee;

    logger.info(`Posting DR with memo: ${request.memo}`);

    const tx = await core.postRequest(request, requestFee, resultFee, batchFee, {
      value: totalValue,
    });

    logger.info(`Tx hash: ${tx?.hash}`);
    const receipt = await tx.wait();

    const logs = await core.queryFilter(core.filters.RequestPosted(), receipt?.blockNumber, receipt?.blockNumber);
    const requestId = logs[0]?.args[0];

    if (requestId) {
      logger.success('Data request posted successfully!');
      logger.info(`Data Request ID: ${requestId}`);
    } else {
      logger.error('Data request failed');
    }
  });
