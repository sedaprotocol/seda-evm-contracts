import { homedir } from 'node:os';
import { join } from 'node:path';
import dotenvx from '@dotenvx/dotenvx';

dotenvx.config({
  path: process.env.DOTENV_CONFIG_PATH,
  envKeysFile: process.env.DOTENV_KEYS_PATH ?? join(homedir(), '.dotenvx', 'seda-evm-contracts.keys'),
});