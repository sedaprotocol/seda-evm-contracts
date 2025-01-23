import '@nomicfoundation/hardhat-toolbox';
import '@openzeppelin/hardhat-upgrades';
import type { HardhatUserConfig } from 'hardhat/config';
import { getEtherscanConfig, getNetworksConfig } from './config';

import './tasks';

const gasReporterConfig = {
  currency: 'USD',
  gasPrice: 20,
  token: 'ETH',
  ethPrice: 3200,
  reportPureAndViewMethods: true,
};

const config: HardhatUserConfig = {
  sourcify: {
    enabled: false,
  },
  solidity: {
    version: '0.8.24',
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
