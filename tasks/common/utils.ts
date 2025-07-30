import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { readFile } from './io';

export function getNetworkKey(hre: HardhatRuntimeEnvironment): string {
  return `${hre.network.name}-${hre.network.config.chainId}`;
}

export async function getContractAddress(hre: HardhatRuntimeEnvironment, contractName: string): Promise<string | null> {
  try {
    const networkKey = await getNetworkKey(hre);
    const addressesPath = 'deployments/addresses.json';
    const content = await readFile(addressesPath);
    const addresses = JSON.parse(content);

    if (addresses[networkKey]?.[contractName]) {
      const address = addresses[networkKey][contractName].address;
      if (typeof address === 'object' && address.proxy) {
        return address.proxy;
      }
      return address;
    }
    return null;
  } catch {
    return null;
  }
}
