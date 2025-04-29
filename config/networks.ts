import type { Networks } from './types';

export const networks: Networks = {
  arbitrumSepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 421614,
    url: 'https://sepolia-rollup.arbitrum.io/rpc',
    etherscan: {
      apiKey: 'ETHERSCAN_API_KEY',
      apiUrl: 'https://api-sepolia.arbiscan.io/api',
      browserUrl: 'https://sepolia.arbiscan.io',
    },
  },
  baseSepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 84532,
    url: 'https://sepolia.base.org',
    etherscan: {
      apiKey: 'BASE_SEPOLIA_ETHERSCAN_API_KEY',
      apiUrl: 'https://api-sepolia.basescan.org/api',
      browserUrl: 'https://sepolia.basescan.org',
    },
  },
  flowTestnet: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 545,
    url: 'https://testnet.evm.nodes.onflow.org',
    minGasPrice: 100000000,
    etherscan: {
      apiKey: 'NO_API_KEY',
      apiUrl: 'https://evm-testnet.flowscan.io/api',
      browserUrl: 'https://evm-testnet.flowscan.io/',
    },
  },
  holesky: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 17000,
    url: 'https://ethereum-holesky-rpc.publicnode.com',
    etherscan: {
      apiKey: 'HOLESKY_ETHERSCAN_API_KEY',
      apiUrl: 'https://api-holesky.etherscan.io/api',
      browserUrl: 'https://holesky.etherscan.io/',
    },
  },
  inkSepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 763373,
    url: 'https://rpc-gel-sepolia.inkonchain.com/',
    etherscan: {
      apiKey: 'NO_API_KEY',
      apiUrl: 'https://explorer-sepolia.inkonchain.com/api',
      browserUrl: 'https://explorer-sepolia.inkonchain.com',
    },
  },
  seiTestnet: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 1328,
    url: 'https://evm-rpc-testnet.sei-apis.com',
    etherscan: {
      apiKey: 'NO_API_KEY',
      apiUrl: 'https://seitrace.com/atlantic-2/api',
      browserUrl: 'https://seitrace.com/',
    },
  },
  unichainSepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 1301,
    url: 'https://sepolia.unichain.org',
    etherscan: {
      apiKey: 'NO_API_KEY',
      apiUrl: 'https://unichain-sepolia.blockscout.com/api',
      browserUrl: 'https://unichain-sepolia.blockscout.com',
      // apiKey: 'UNICHAIN_SEPOLIA_ETHERSCAN_API_KEY',
      // apiUrl: 'https://api-sepolia.uniscan.xyz/api',
      // browserUrl: 'https://sepolia.uniscan.xyz',
    },
  },
};
