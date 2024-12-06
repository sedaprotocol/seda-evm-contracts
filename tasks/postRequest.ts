import { sedaScope } from '.';
import { logger } from './common/logger';

sedaScope
  .task('post-request', 'Posts a data request to the SedaProver contract')
  .addParam('core', 'The address of the SedaCore contract')
  .setAction(async (taskArgs, hre) => {
    logger.section('Post Data Request', 'deploy');

    const core = await hre.ethers.getContractAt('ISedaCore', taskArgs.core);
    logger.info(`SedaCore address: ${taskArgs.core}`);

    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const request = {
      execProgramId: '0x541d1faf3b6e167ea5369928a24a0019f4167ca430da20a271c5a7bc5fa2657a',
      execInputs: '0x1234',
      execGasLimit: 100000n,
      tallyProgramId: '0x541d1faf3b6e167ea5369928a24a0019f4167ca430da20a271c5a7bc5fa2657a',
      tallyInputs: '0x5678',
      tallyGasLimit: 100000n,
      replicationFactor: 1,
      consensusFilter: '0x00',
      gasPrice: 1000n,
      memo: `0x${timestamp}`,
    };

    logger.info(`Posting DR with memo: ${request.memo}`);
    const tx = await core.postRequest(request);
    const receipt = await tx.wait();
    logger.success('Data request posted successfully!');

    // Get requestId from event logs
    const logs = await core.queryFilter(core.filters.RequestPosted(), receipt?.blockNumber, receipt?.blockNumber);
    const requestId = logs[0].args[0];

    logger.info(`Data Request ID: ${requestId}`);
  });
