import { scope, types } from 'hardhat/config';

/**
 * Defines the scope for SEDA-related tasks.
 */
export const sedaScope = scope('seda', 'Deploy and interact with SEDA contracts');

// Deploy tasks
import './tasks/deploy/core';
import './tasks/deploy/prover';
import './tasks/deploy/feeManager';
import './tasks/deploy/all';

// Development tasks
import './tasks/dev/permissioned';
import './tasks/dev/resettableProver';
import './tasks/dev/allResettable';
import './tasks/dev/resetProver';

// Utils tasks
import './tasks/utils/postRequest';
import './tasks/utils/proxyUpgrade';
