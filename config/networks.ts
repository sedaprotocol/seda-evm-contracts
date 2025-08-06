import type { Networks } from './types';

export const networks: Networks = {
  // MAINNETS
  arbitrumOne: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 42161,
    url: 'https://arb-mainnet.g.alchemy.com/v2/{ALCHEMY_MAINNET_API_KEY}',
  },
  base: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 8453,
    url: 'https://base-mainnet.g.alchemy.com/v2/{ALCHEMY_MAINNET_API_KEY}',
  },
  hyperliquid: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 999,
    url: 'https://hyperliquid-mainnet.g.alchemy.com/v2/{ALCHEMY_MAINNET_API_KEY}',
    etherscan: {
      apiKey: 'ETHERSCAN_API_KEY',
      apiUrl: 'https://api.etherscan.io/v2/api?chainid=999',
      browserUrl: 'https://hyperevmscan.io/',
    },
  },
  // TESTNETS
  arbitrumSepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 421614,
    url: 'https://arb-sepolia.g.alchemy.com/v2/{ALCHEMY_TESTNET_API_KEY}',
  },
  baseSepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 84532,
    url: 'https://base-sepolia.g.alchemy.com/v2/{ALCHEMY_TESTNET_API_KEY}',
  },
  gnosisChiado: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 10200,
    url: 'https://gnosis-chiado.g.alchemy.com/v2/{ALCHEMY_TESTNET_API_KEY}',
    etherscan: {
      apiKey: 'NO_API_KEY',
      apiUrl: 'https://gnosis-chiado.blockscout.com/api',
      browserUrl: 'https://gnosis-chiado.blockscout.com/',
    },
  },
  hyperliquidPurrsec: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 998,
    url: 'https://rpc.hyperliquid-testnet.xyz/evm',
  },
  mantraDukong: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 5887,
    url: 'https://evm.dukong.mantrachain.io',
  },
  superseedSepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 53302,
    url: 'https://superseed-sepolia.g.alchemy.com/v2/{ALCHEMY_TESTNET_API_KEY}',
    etherscan: {
      apiKey: 'CONDUIT_API_KEY',
      apiUrl: 'https://explorer-sepolia-superseed-826s35710w.t.conduit.xyz/api',
      browserUrl: 'https://explorer-sepolia-superseed-826s35710w.t.conduit.xyz',
    },
  },
};
