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
  berachain: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 80094,
    url: 'https://berachain-mainnet.g.alchemy.com/v2/{ALCHEMY_MAINNET_API_KEY}',
    etherscan: {
      apiKey: 'ETHERSCAN_API_KEY',
      apiUrl: 'https://api.etherscan.io/v2/api?chainid=80094',
      browserUrl: 'https://berascan.com/',
    },
  },
  gnosis: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 100,
    url: 'https://gnosis-mainnet.g.alchemy.com/v2/{ALCHEMY_MAINNET_API_KEY}',
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
  plume: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 98866,
    url: 'https://rpc.plume.org',
    etherscan: {
      apiKey: 'NO_API_KEY',
      apiUrl: 'https://explorer-plume-mainnet-1.t.conduit.xyz/api',
      browserUrl: 'https://explorer-plume-mainnet-1.t.conduit.xyz:443',
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
  berachainBepolia: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 80069,
    url: 'https://berachain-bepolia.g.alchemy.com/v2/{ALCHEMY_TESTNET_API_KEY}',
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
  injectiveTestnet: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 1439,
    url: 'https://k8s.testnet.json-rpc.injective.network/',
    gasPrice: 160e6,
    etherscan: {
      apiKey: 'NO_API_KEY',
      apiUrl: 'https://testnet.blockscout-api.injective.network/api',
      browserUrl: 'https://testnet.blockscout.injective.network/',
    },
  },
  mantraDukong: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 5887,
    url: 'https://evm.dukong.mantrachain.io',
  },
  neonDevnet: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 245022926,
    url: 'https://devnet.neonevm.org',
  },
  plumeTestnet: {
    accounts: 'EVM_PRIVATE_KEY',
    chainId: 98867,
    url: 'https://testnet-rpc.plume.org',
    etherscan: {
      apiKey: 'NO_API_KEY',
      apiUrl: 'https://explorer-plume-testnet-1.t.conduit.xyz/api',
      browserUrl: 'https://explorer-plume-testnet-1.t.conduit.xyz:443',
    },
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
