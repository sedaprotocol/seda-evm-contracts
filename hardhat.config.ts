import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import { getEtherscanConfig, getNetworksConfig } from './config';

const gasReporterConfig = {
  currency: 'USD',
  gasPrice: 20,
  token: 'ETH',
  ethPrice: 2600,
};

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.25',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: getNetworksConfig(),
  etherscan: getEtherscanConfig(),
  gasReporter: gasReporterConfig,
};

export default config;
