import type { ChainConfig, EtherscanConfig } from '@nomicfoundation/hardhat-verify/types';
import type { NetworksUserConfig } from 'hardhat/types';
import { networks } from './networks';
import type { Account } from './types';
import { getAccount, getDefaultAccount, getEnv } from './utils';

export const getNetworksConfig = (): NetworksUserConfig => {
  return Object.fromEntries(
    Object.entries(networks).map(([key, network]) => {
      const accounts = network.accounts
        ? typeof network.accounts === 'object' && 'mnemonic' in network.accounts
          ? network.accounts
          : getAccount(network.accounts)
        : getDefaultAccount();

      return [
        key,
        {
          accounts,
          url: network.url,
          chainId: network.chainId,
          gasPrice: network.gasPrice ? network.gasPrice : 'auto',
          gas: network.gas ? network.gas : 'auto',
          minGasPrice: network.minGasPrice ? network.minGasPrice : 0,
        },
      ];
    }),
  );
};

export const getEtherscanConfig = (): Partial<EtherscanConfig> | undefined => {
  const apiKey = Object.fromEntries(
    Object.entries(networks)
      .filter(([_, network]) => network.etherscan?.apiKey)
      .map(([key, network]) => [key, getEnv(network.etherscan?.apiKey ?? '')]),
  ) as Record<string, string>;

  const customChains: ChainConfig[] = Object.entries(networks)
    .filter(([_, network]) => network.etherscan?.apiUrl || network.etherscan?.browserUrl)
    .map(([key, network]) => ({
      network: key,
      chainId: network.chainId,
      urls: {
        apiURL: network.etherscan?.apiUrl ?? '',
        browserURL: network.etherscan?.browserUrl ?? '',
      },
    }));

  return {
    apiKey,
    enabled: true,
    customChains,
  };
};
