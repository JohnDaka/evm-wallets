/**
 * The wallets the page can tell apart. The values are the keys Coinbase Wallet gives each wallet
 * in `window.ethereum.providerMap` when more than one is installed.
 */
export const WALLET_TYPE = {
  METAMASK: 'MetaMask',
  COINBASE: 'CoinbaseWallet',
} as const;
export type WALLET_TYPE = (typeof WALLET_TYPE)[keyof typeof WALLET_TYPE];

export type InstalledWalletList = {
  [key in WALLET_TYPE]: boolean;
};

export type WalletAddress = string;

export type ConnectedWallet = {
  address: WalletAddress | null;
  type: WALLET_TYPE | null;
};

export type Web3Listeners = [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { title: 'accountsChanged'; function: (payload: any) => void },
  { title: 'chainChanged'; function: (payload: string) => void },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { title: 'disconnect'; function: (payload: any) => void },
];
