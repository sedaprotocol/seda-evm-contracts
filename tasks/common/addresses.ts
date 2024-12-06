import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CONFIG } from './config';
import { readFile, writeFile } from './io';

const DEPLOYMENTS_FOLDER = CONFIG.DEPLOYMENTS.FOLDER;
const ADDRESSES_FILE = CONFIG.DEPLOYMENTS.FILES.ADDRESSES;

// Define the type for the addresses object
type Addresses = {
  [networkName: string]: {
    [contractName: string]: {
      proxy: string;
      implementation: string;
      gitCommitHash: string;
    };
  };
};

export async function updateAddresses(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  proxyAddress: string,
  implAddress: string,
) {
  const addressesPath = path.join(DEPLOYMENTS_FOLDER, ADDRESSES_FILE);
  let addresses: Addresses = {};

  if (fs.existsSync(addressesPath)) {
    const content = await readFile(addressesPath);
    if (content.trim()) {
      addresses = JSON.parse(content) as Addresses;
    }
  }

  const networkName = `${hre.network.name}-${(await hre.ethers.provider.getNetwork()).chainId.toString()}`;
  if (!addresses[networkName]) {
    addresses[networkName] = {};
  }

  const gitCommitHash = require('node:child_process').execSync('git rev-parse HEAD').toString().trim();

  addresses[networkName][contractName] = {
    proxy: proxyAddress,
    implementation: implAddress,
    gitCommitHash,
  };

  await writeFile(addressesPath, addresses);
}
