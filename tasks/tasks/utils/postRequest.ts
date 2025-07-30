import { parseUnits } from 'ethers';
import type { SedaCoreV1 } from '../../../typechain-types';
import { logger } from '../../common/logger';
import { getContractAddress } from '../../common/utils';
import { sedaScope } from '../../index';

sedaScope
  .task('utils:post-request', 'Post a data request to an ISedaCore contract with attached funds')
  .addOptionalParam('core', 'The address of the SedaCore contract')
  .addOptionalParam('requestFee', 'The fee for executing the request in gwei', '25000')
  .addOptionalParam('resultFee', 'The fee for posting the result in gwei', '10000')
  .addOptionalParam('batchFee', 'The fee for posting the batch in gwei', '10000')
  .setAction(async (taskArgs, hre) => {
    logger.section('Post Data Request with funds', 'deploy');

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
    const core = (await hre.ethers.getContractAt('SedaCoreV1', coreAddress)) as SedaCoreV1;

    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const request = {
      execProgramId: '0x86c31245770e22a393f8d32daef2c4add5960ffbf73dd3820738b0864b4daecb',
      tallyProgramId: '0x86c31245770e22a393f8d32daef2c4add5960ffbf73dd3820738b0864b4daecb',
      execInputs: '0x',
      tallyInputs: '0x',
      execGasLimit: 50000000000000n,
      tallyGasLimit: 50000000000000n,
      replicationFactor: 1,
      consensusFilter: '0x00',
      gasPrice: 2000n,
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
      logger.error('Data request possibly failed, check transaction');
    }
  });
