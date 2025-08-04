import type { ChainConfig, EtherscanConfig } from '@nomicfoundation/hardhat-verify/types';
import dotenv from 'dotenv';
import type { NetworksUserConfig } from 'hardhat/types';
import { networks } from './networks';
import { getAccount, getEnv, getUrl } from './utils';

dotenv.config();

export const getNetworksConfig = (): NetworksUserConfig => {
  return Object.fromEntries(
    Object.entries(networks).map(([key, network]) => [
      key,
      {
        // Only add accounts if we have a private key
        ...(network.accounts && typeof network.accounts === 'string' && getEnv(network.accounts, '')
          ? { accounts: getAccount(network.accounts) }
          : {}),
        url: getUrl(network.url),
        chainId: network.chainId,
        gasPrice: network.gasPrice ?? 'auto',
        gas: network.gas ?? 'auto',
        minGasPrice: network.minGasPrice ?? 0,
      },
    ]),
  );
};

export const getEtherscanConfig = (): Partial<EtherscanConfig> => {
  // If CUSTOM_CHAINS is false, use a single apiKey for all networks
  if (!process.env.CUSTOM_CHAINS) {
    const apiKey = getEnv('ETHERSCAN_API_KEY');

    if (!apiKey) {
      console.log('Warning: ETHERSCAN_API_KEY is not set');
    }

    return {
      enabled: true,
      apiKey,
    };
  }

  // If CUSTOM_CHAINS is true, use a different apiKey and URLs for each network
  const apiKey: Record<string, string> = {};
  const customChains: ChainConfig[] = [];

  Object.entries(networks).forEach(([networkName, network]) => {
    const { etherscan } = network;
    if (!etherscan) return;

    // Add API key
    if (etherscan.apiKey) {
      apiKey[networkName] = getEnv(etherscan.apiKey, '');
    }

    // Add custom chain if it has custom URLs
    if (etherscan.apiUrl && etherscan.browserUrl) {
      customChains.push({
        network: networkName,
        chainId: network.chainId,
        urls: {
          apiURL: etherscan.apiUrl,
          browserURL: etherscan.browserUrl,
        },
      });
    }
  });

  return {
    enabled: true,
    apiKey,
    customChains,
  };
};
