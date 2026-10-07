import type { PROVIDER_EVENT } from './ethereum.ts';

/**
 * The wallets the package tells apart. Each value is the key Coinbase Wallet files that wallet's
 * provider under in `window.ethereum.providerMap` when both are installed, so one name finds a
 * wallet in `WALLET_MAP`, in `INSTALLED_WALLETS` and in `providerMap` alike.
 *
 * @example
 * const wallet = WALLET_MAP.get(WALLET_TYPE.METAMASK);
 * INSTALLED_WALLETS[WALLET_TYPE.COINBASE]; // true when Coinbase Wallet is installed
 */
export const WALLET_TYPE = {
  /** MetaMask, `'MetaMask'`: its key in `providerMap`. */
  METAMASK: 'MetaMask',
  /** Coinbase Wallet, `'CoinbaseWallet'`: its key in `providerMap`. */
  COINBASE: 'CoinbaseWallet',
} as const;
/** One of the {@link WALLET_TYPE} values: a wallet's name, as `providerMap` keys it. */
export type WALLET_TYPE = (typeof WALLET_TYPE)[keyof typeof WALLET_TYPE];

/**
 * Which wallets are installed on the page, one entry per {@link WALLET_TYPE}: `true` when it is
 * there, `false` when it is not. The shape of `INSTALLED_WALLETS`.
 */
export type InstalledWalletList = {
  [key in WALLET_TYPE]: boolean;
};

/**
 * An account's address as the wallet reports it: `0x` and 40 hex digits (20 bytes), in whatever
 * letter case the wallet gives. Compare two addresses without regard to case.
 */
export type WalletAddress = string;

/**
 * The wallet the user connected, as an app keeps it in its state: which wallet, and which of its
 * accounts is in use. Both are `null` until the user connects.
 */
export type ConnectedWallet = {
  /** The account in use: the first `connect()` answered, or the first `accountsChanged` named. */
  address: WalletAddress | null;
  /** Which wallet it is: the key to get the wallet back from `WALLET_MAP`. */
  type: WALLET_TYPE | null;
};

/**
 * The provider events an app listens to, each with its listener (see `PROVIDER_EVENT`): one list
 * to subscribe in a loop, and to unsubscribe the same way when the page no longer needs them.
 *
 * @example
 * const listeners: Web3Listeners = [
 *   { title: PROVIDER_EVENT.ACCOUNTS_CHANGED, function: onAccountsChanged },
 *   { title: PROVIDER_EVENT.CHAIN_CHANGED, function: onChainChanged },
 *   { title: PROVIDER_EVENT.DISCONNECT, function: onDisconnect },
 * ];
 * const provider = wallet.getProvider();
 * listeners.forEach(({ title, function: listener }) => provider?.on(title, listener));
 * // When the page no longer needs them:
 * listeners.forEach(({ title, function: listener }) => provider?.removeListener(title, listener));
 */
export type Web3Listeners = [
  {
    /** The connected accounts changed. */
    title: typeof PROVIDER_EVENT.ACCOUNTS_CHANGED;
    /** Gets the accounts, the one in use first; an empty list when the user disconnected. */
    function: (accounts: WalletAddress[]) => void;
  },
  {
    /** The wallet moved to another chain. */
    title: typeof PROVIDER_EVENT.CHAIN_CHANGED;
    /** Gets the new chain's id as hex: `EthereumWallet.normalizeChainId` makes it a number. */
    function: (chainId: string) => void;
  },
  {
    /** The provider lost its connection to every chain. */
    title: typeof PROVIDER_EVENT.DISCONNECT;
    /** Gets the provider's error: why it disconnected. */
    function: (error: unknown) => void;
  },
];
