/**
 * What went wrong in a wallet call, by kind: the `code` of a {@link WalletError}. Each value is its
 * own key, so a code reads the same in a log as in the code.
 *
 * @example
 * try {
 *   await wallet.switchNetwork(CHAIN_ID.BSC);
 * } catch (error) {
 *   if (error instanceof WalletError && error.code === WALLET_ERROR.NETWORK_NOT_ADDED) {
 *     showAddNetworkHelp(CHAIN_ID.BSC); // the app's own help on adding a network by hand
 *   }
 * }
 */
export const WALLET_ERROR = {
  /** No wallet provider on the page, or not the one asked for: there is nothing to talk to. */
  NO_PROVIDER: 'NO_PROVIDER',
  /**
   * The wallet does not know the network and the package does not add it from here: what
   * `switchNetwork` throws for Coinbase Wallet, and for a plain `EthereumWallet`.
   */
  NETWORK_NOT_IN_WALLET: 'NETWORK_NOT_IN_WALLET',
  /**
   * MetaMask did not know the network and did not add it: the user refused, the request failed,
   * or the app does not offer the network or has no parameters to add it with.
   */
  NETWORK_NOT_ADDED: 'NETWORK_NOT_ADDED',
  /**
   * The network is not among the app's networks (`configureWallets({ networks })`). Raised inside
   * MetaMask's add-network step, it reaches the app as `NETWORK_NOT_ADDED`.
   */
  NETWORK_NOT_SUPPORTED: 'NETWORK_NOT_SUPPORTED',
  /**
   * `ADD_NETWORK_PARAMS` has nothing to add the network with. Raised inside MetaMask's add-network
   * step, it reaches the app as `NETWORK_NOT_ADDED`.
   */
  NETWORK_PARAMS_MISSING: 'NETWORK_PARAMS_MISSING',
  /**
   * A chain id given as text that is neither `0x` and hex digits (the way wallets write it) nor
   * decimal digits alone: what `EthereumWallet.normalizeChainId` throws.
   */
  INVALID_CHAIN_ID: 'INVALID_CHAIN_ID',
  /**
   * The wallet is on another chain than the transfer's, so `sendTransaction` sent nothing. Never
   * thrown: it is the `code` of the failed transfer's answer, and the app switches the wallet
   * (`switchNetwork`) and sends again.
   */
  WRONG_NETWORK: 'WRONG_NETWORK',
  /**
   * A transfer failed with no message of its own. Never thrown: its message is the `error` a
   * failed `sendTransaction` answers.
   */
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
} as const;
/** One of the {@link WALLET_ERROR} codes. */
export type WALLET_ERROR = (typeof WALLET_ERROR)[keyof typeof WALLET_ERROR];

/**
 * What each error says to the user, in English: the message of a {@link WalletError} with that
 * code. An app in another language shows its own text, chosen by the error's `code`.
 */
export const WALLET_ERROR_MESSAGE: Record<WALLET_ERROR, string> = {
  [WALLET_ERROR.NO_PROVIDER]: 'No provider found',
  [WALLET_ERROR.NETWORK_NOT_IN_WALLET]:
    'This network is not available in your wallet. Please add it manually.',
  [WALLET_ERROR.NETWORK_NOT_ADDED]: 'Failed to add network to your wallet. Please add it manually.',
  [WALLET_ERROR.NETWORK_NOT_SUPPORTED]: 'Network configuration not found',
  [WALLET_ERROR.NETWORK_PARAMS_MISSING]: 'Network parameters not found',
  [WALLET_ERROR.INVALID_CHAIN_ID]: 'Invalid chain ID',
  [WALLET_ERROR.WRONG_NETWORK]:
    'Your wallet is on another network. Switch to the network of this transfer and try again.',
  [WALLET_ERROR.TRANSACTION_FAILED]: 'Failed to send transaction',
};

/**
 * A wallet call that failed for a reason the package knows: `code` says which, and the message
 * (`WALLET_ERROR_MESSAGE`) is ready to show. An error of the wallet's own, such as the user
 * refusing a prompt, is thrown on as the wallet threw it, not wrapped in one of these.
 *
 * @example
 * try {
 *   await wallet.connect();
 * } catch (error) {
 *   if (error instanceof WalletError && error.code === WALLET_ERROR.NO_PROVIDER) {
 *     showInstallLink(WALLET_TYPE.METAMASK); // the app's own "install MetaMask" prompt
 *   }
 * }
 */
export class WalletError extends Error {
  /** Why the call failed: one of {@link WALLET_ERROR}. */
  public readonly code: WALLET_ERROR;

  /** @param code - Why the call failed; the message is this code's `WALLET_ERROR_MESSAGE`. */
  public constructor(code: WALLET_ERROR) {
    super(WALLET_ERROR_MESSAGE[code]);
    this.name = WalletError.name;
    this.code = code;
  }
}
