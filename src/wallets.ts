import type { AbstractWallet } from './abstract-wallet.ts';
import { CoinbaseWallet } from './coinbase-wallet.ts';
import { MetaMaskWallet } from './metamask-wallet.ts';
import { type InstalledWalletList, WALLET_TYPE } from './types.ts';

/** The one MetaMask wallet the app shares, through `WALLET_MAP` and `WALLET_SET`. */
const metaMask: AbstractWallet = new MetaMaskWallet();
/** The one Coinbase Wallet the app shares, through `WALLET_MAP` and `WALLET_SET`. */
const coinBase: AbstractWallet = new CoinbaseWallet();

/**
 * Every wallet the package knows, by {@link WALLET_TYPE}: the way to the wallet a user picked, or
 * the one the app remembered. The same objects as in {@link WALLET_SET}.
 *
 * @example
 * const wallet = WALLET_MAP.get(WALLET_TYPE.COINBASE);
 * if (wallet?.isAvailable()) {
 *   const [address] = await wallet.connect();
 * }
 */
export const WALLET_MAP: Map<WALLET_TYPE, AbstractWallet> = new Map<WALLET_TYPE, AbstractWallet>()
  .set(WALLET_TYPE.METAMASK, metaMask)
  .set(WALLET_TYPE.COINBASE, coinBase);

/**
 * The same wallets as {@link WALLET_MAP}, as a set: to go through every one.
 *
 * @example
 * const installed = [...WALLET_SET].filter((wallet) => wallet.isAvailable());
 */
export const WALLET_SET: Set<AbstractWallet> = new Set<AbstractWallet>()
  .add(metaMask)
  .add(coinBase);

/** Every wallet starts as not installed, until its own `isAvailable()` says otherwise below. */
const installedWallets: InstalledWalletList = {
  [WALLET_TYPE.METAMASK]: false,
  [WALLET_TYPE.COINBASE]: false,
};

// Asked once, when the package loads: from window.ethereum as it was then.
WALLET_MAP.forEach((value: AbstractWallet, key: WALLET_TYPE) => {
  installedWallets[key] = value.isAvailable();
});

/**
 * Which wallets are installed, by {@link WALLET_TYPE}: worked out once, when the package loads,
 * from `window.ethereum` as it was then. All `false` outside a browser.
 *
 * @example
 * INSTALLED_WALLETS; // { MetaMask: true, CoinbaseWallet: false }
 * if (!INSTALLED_WALLETS[WALLET_TYPE.METAMASK]) showInstallLink(WALLET_TYPE.METAMASK);
 */
export const INSTALLED_WALLETS = installedWallets;
