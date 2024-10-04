import type { Networks } from './types';

export const networks: Networks = {
  baseSepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 84532,
    url: 'https://sepolia.base.org',
    etherscan: {
      apiKey: 'BASE_SEPOLIA_ETHERSCAN_API_KEY',
      apiUrl: 'https://api-sepolia.basescan.org/api',
      explorerUrl: 'https://sepolia.basescan.org',
    },
  },
};
