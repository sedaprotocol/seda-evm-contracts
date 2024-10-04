export type Account =
  | string[]
  | {
      mnemonic: string;
    };

interface NetworkConfig {
  accounts?: string | Account;
  chainId: number;
  url: string;
  etherscan?: {
    apiKey: string;
    apiUrl: string;
    explorerUrl: string;
  };
}

export type Networks = Record<string, NetworkConfig>;
