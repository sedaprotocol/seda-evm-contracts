import type { Networks } from './types';

// Example network configuration:
// export const networks: Networks = {
//   mainnet: {
//     accounts: ['MAINNET_PRIVATE_KEY'],
//     chainId: 1,
//     url: 'https://mainnet.infura.io/v3/YOUR-PROJECT-ID',
//     etherscan: {
//       apiKey: 'ETHERSCAN_API_KEY',
//       apiUrl: 'https://api.etherscan.io/api',
//       explorerUrl: 'https://etherscan.io',
//     },
//   },
//   goerli: {
//     accounts: {
//       mnemonic: 'test test test test test test test test test test test junk',
//     },
//     chainId: 5,
//     url: 'https://goerli.infura.io/v3/YOUR-PROJECT-ID',
//   },
//   // Add more networks as needed
// };

export const networks: Networks = {
  baseSepolia: {
    // accounts: 'EVM_PRIVATE_KEY', // Consider using environment variables for sensitive data
    chainId: 84532,
    url: 'https://sepolia.base.org',
    // etherscan: { // Uncomment if you need Etherscan integration
    //   apiKey: 'BASE_SEPOLIA_ETHERSCAN_API_KEY', // Use environment variable
    //   apiUrl: 'https://api-sepolia.basescan.org/api',
    //   explorerUrl: 'https://sepolia.basescan.org',
    // },
  },
};
