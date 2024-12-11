interface NetworkConfig {
  accounts?:
    | string
    | {
        mnemonic: string;
      };
  chainId: number;
  url: string;
  etherscan?: {
    apiKey: string;
    apiUrl: string;
    browserUrl: string;
  };
  maxFeePerGas?: number;
  maxPriorityFeePerGas?: number;
  gas?: number;
  gasPrice?: number;
  minGasPrice?: number;
}

export type Networks = Record<string, NetworkConfig>;
