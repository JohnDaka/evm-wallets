import type { AbstractWallet } from './abstract-wallet.ts';
import { CoinbaseWallet } from './coinbase-wallet.ts';
import { MetaMaskWallet } from './metamask-wallet.ts';
import { type InstalledWalletList, WALLET_TYPE } from './types.ts';

const metaMask: AbstractWallet = new MetaMaskWallet();
const coinBase: AbstractWallet = new CoinbaseWallet();

export const WALLET_MAP: Map<WALLET_TYPE, AbstractWallet> = new Map<WALLET_TYPE, AbstractWallet>()
  .set(WALLET_TYPE.METAMASK, metaMask)
  .set(WALLET_TYPE.COINBASE, coinBase);

export const WALLET_SET: Set<AbstractWallet> = new Set<AbstractWallet>()
  .add(metaMask)
  .add(coinBase);

// Check which wallets are installed
const installedWallets: InstalledWalletList = {
  [WALLET_TYPE.METAMASK]: false,
  [WALLET_TYPE.COINBASE]: false,
};

WALLET_MAP.forEach((value: AbstractWallet, key: WALLET_TYPE) => {
  installedWallets[key] = value.isAvailable();
});

export const INSTALLED_WALLETS = installedWallets;
