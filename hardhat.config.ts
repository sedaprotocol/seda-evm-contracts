import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import '@openzeppelin/hardhat-upgrades';
import type { HardhatUserConfig } from 'hardhat/config';
import { getEtherscanConfig, getNetworksConfig } from './config';

import './tasks';

const gasReporterConfig = {
  enabled: process.env.REPORT_GAS === 'true',
  currency: 'USD',
  gasPrice: 10,
  token: 'ETH',
  ethPrice: 3600,
  reportPureAndViewMethods: true,
};

const config: HardhatUserConfig = {
  sourcify: {
    enabled: false,
  },
  solidity: {
    version: '0.8.28',
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
