import type { ChainConfig, EtherscanConfig } from '@nomicfoundation/hardhat-verify/types';
import type { NetworksUserConfig } from 'hardhat/types';

import { networks } from './networks';
import { getAccount, getDefaultAccount, getEnv } from './utils';

export const getNetworksConfig = (): NetworksUserConfig => {
  const skippedNetworks: { network: string; reason: string }[] = [];

  const config = Object.fromEntries(
    Object.entries(networks)
      .map(([key, network]) => {
        try {
          // Special case for hardhat network - use default test accounts
          if (key === 'hardhat') {
            return [
              key,
              {
                chainId: network.chainId,
                url: network.url,
              },
            ];
          }

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
        } catch (error: unknown) {
          skippedNetworks.push({
            network: key,
            reason: error instanceof Error ? error.message : 'Unknown error',
          });
          return null;
        }
      })
      .filter((entry) => entry !== null),
  );

  if (skippedNetworks.length > 0) {
    console.warn(
      `Skipped networks during configuration:\n${skippedNetworks.map(({ network, reason }) => `  - ${network}: ${reason}`).join('\n')}`,
    );
  }

  return config;
};

export const getEtherscanConfig = (): Partial<EtherscanConfig> | undefined => {
  const skippedNetworks: { network: string; reason: string }[] = [];

  const apiKey = getEnv('ETHERSCAN_API_KEY');

  const customChains: ChainConfig[] = Object.entries(networks)
    .map(([key, network]) => {
      try {
        if (!network.etherscan?.apiUrl && !network.etherscan?.browserUrl) return null;
        return {
          network: key,
          chainId: network.chainId,
          urls: {
            apiURL: network.etherscan?.apiUrl ?? '',
            browserURL: network.etherscan?.browserUrl ?? '',
          },
        };
      } catch (error: unknown) {
        skippedNetworks.push({
          network: key,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
      }
    })
    .filter((chain): chain is ChainConfig => chain !== null);

  if (skippedNetworks.length > 0) {
    console.warn(
      `Skipped networks during Etherscan configuration:\n${skippedNetworks.map(({ network, reason }) => `  - ${network}: ${reason}`).join('\n')}`,
    );
  }

  return {
    apiKey,
    enabled: true,
    customChains,
  };
};
