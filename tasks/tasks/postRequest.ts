import { logger } from '../common/logger';
import { sedaScope } from '../index';

sedaScope
  .task('post-request', 'Post a data request to a ISedaCore contract')
  .addParam('core', 'The address of the SedaCore contract')
  .setAction(async (taskArgs, hre) => {
    logger.section('Post Data Request', 'deploy');

    const core = await hre.ethers.getContractAt('ISedaCore', taskArgs.core);
    logger.info(`SedaCore address: ${taskArgs.core}`);

    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const request = {
      execProgramId: '0x57ce7bf6a9fdf1782dbc1e709418bd22603797b202453f0c49186bbb60f4b5e4',
      execInputs: '0x6574682d75736463',
      execGasLimit: 300000000000000n,
      tallyProgramId: '0x57ce7bf6a9fdf1782dbc1e709418bd22603797b202453f0c49186bbb60f4b5e4',
      tallyInputs: '0x',
      tallyGasLimit: 300000000000000n,
      replicationFactor: 1,
      consensusFilter: '0x00',
      gasPrice: 1n,
      memo: `0x${timestamp}`,
    };

    logger.info(`Posting DR with memo: ${request.memo}`);
    const tx = await core.postRequest(request);
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
