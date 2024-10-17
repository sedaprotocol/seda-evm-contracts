import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import { getEtherscanConfig, getNetworksConfig } from './config';

const config: HardhatUserConfig = {
  solidity: '0.8.25',
  networks: getNetworksConfig(),
  etherscan: getEtherscanConfig(),
  gasReporter: {
    currency: 'USD',
    gasPrice: 20,
    token: 'ETH',
    ethPrice: 2600,
  },
};

export default config;
