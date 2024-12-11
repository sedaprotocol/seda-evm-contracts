import { scope, types } from 'hardhat/config';

/**
 * Defines the scope for SEDA-related tasks.
 */
export const sedaScope = scope('seda', 'Deploy and interact with SEDA contracts');

// Deploy tasks
import './tasks/deploy/core';
import './tasks/deploy/prover';
import './tasks/deploy/all';
import './tasks/deploy/dev/permissioned';
import './tasks/deploy/dev/resettableProver';

// Request tasks
import './tasks/request/post';
