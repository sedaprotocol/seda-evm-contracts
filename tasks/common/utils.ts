import type { HardhatRuntimeEnvironment } from 'hardhat/types';

export function getNetworkKey(hre: HardhatRuntimeEnvironment): string {
  return `${hre.network.name}-${hre.network.config.chainId}`;
}
