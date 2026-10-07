import { CHAIN_MAP, type ChainConfig } from './blockchain-networks.ts';

/** How the app shows one of its networks: what `getSupportedNetworks()` answers per chain id. */
export type NetworkConfig = {
  /** The network's name, as the app shows it. */
  name: string;
  /** The address of its icon image; empty until the app gives one through `configureWallets`. */
  icon: string;
};

/**
 * Where the wallets report what they did and what failed. `log` gets every sent transfer and
 * `error` every failure, each with its {@link WALLET_LOG} text first and the details or the error
 * after it. The console's own signature, so `console` fits, and so does a quiet one.
 */
export type WalletLogger = Pick<Console, 'log' | 'error'>;

/** What the app sets through {@link configureWallets}, and what the wallets read on each call. */
export type WalletSettings = {
  /**
   * The networks the app offers, by chain id: what `getSupportedNetworks()` answers, and the only
   * networks MetaMask is asked to add. Default: every chain in `CHAIN_MAP`, named as there, with
   * no icon.
   */
  networks: Record<number, NetworkConfig>;
  /**
   * Names and explorers by chain id, for `getExplorerUrl` and `getExplorerName`. Default:
   * `CHAIN_MAP`. Keep `CHAIN_ID.ETHEREUM` in it: a chain the map lacks gets Ethereum's explorer.
   */
  chains: Map<number, ChainConfig>;
  /** Where the wallets log. Default: `console`. */
  logger: WalletLogger;
};

/** A network has no icon until the app gives it one. */
const NO_ICON = '';

/**
 * What the wallets write first in a log line, before the error or the details: one text per
 * event, so a log search or an error tracker can group them.
 *
 * @example
 * configureWallets({
 *   logger: {
 *     log() {}, // quiet about sent transfers
 *     error: (text: WALLET_LOG, error: unknown) => reportError(text, error), // the app's tracker
 *   },
 * });
 */
export const WALLET_LOG = {
  /** `getBalance` could not read the balance; the error follows. */
  BALANCE_FAILED: 'Error fetching balance:',
  /** `isConnected` could not ask the wallet; the error follows. */
  CONNECTION_CHECK_FAILED: 'Error checking wallet connection:',
  /** `connect` failed, or the user refused; the error follows, and is thrown on to the app. */
  CONNECT_FAILED: 'Error connecting wallet:',
  /** A transfer was sent, through `log`; `{ txHash, metadata, metadataHex }` follows. */
  TRANSACTION_SENT: 'Transaction sent:',
  /** `sendTransaction` failed; the error follows. */
  TRANSACTION_FAILED: 'Error sending transaction:',
} as const;
/** One of the {@link WALLET_LOG} texts. */
export type WALLET_LOG = (typeof WALLET_LOG)[keyof typeof WALLET_LOG];

/** Every chain the package knows, named as it is, until the app sets its own list. */
const DEFAULT_NETWORKS: Record<number, NetworkConfig> = Object.fromEntries(
  [...CHAIN_MAP].map(([chainId, chain]) => [chainId, { name: chain.name, icon: NO_ICON }]),
);

/**
 * The settings in effect. The wallets read them on every call, so a change takes effect at once.
 * Internal: not exported from the package, an app changes them through {@link configureWallets}.
 */
export const settings: WalletSettings = {
  networks: DEFAULT_NETWORKS,
  chains: CHAIN_MAP,
  logger: console,
};

/**
 * Sets the app's own networks (its icons, or a shorter list), chain explorers or logger. Each
 * setting given replaces that setting as a whole (networks are not merged one by one); the ones
 * left out keep theirs. Call it once at start-up, before the wallets are used.
 *
 * @param changes - The settings to replace: any of `networks`, `chains` and `logger`.
 * @example
 * // NETWORK_NAME and NETWORK_ICON are the app's: its names and its image addresses per network.
 * configureWallets({
 *   networks: {
 *     [CHAIN_ID.ETHEREUM]: { name: NETWORK_NAME.ETHEREUM, icon: NETWORK_ICON.ETHEREUM },
 *     [CHAIN_ID.POLYGON]: { name: NETWORK_NAME.POLYGON, icon: NETWORK_ICON.POLYGON },
 *   },
 * });
 */
export const configureWallets = (changes: Partial<WalletSettings>): void => {
  Object.assign(settings, changes);
};
