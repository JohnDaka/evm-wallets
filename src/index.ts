/**
 * @dakaio/evm-wallets: tells which browser wallet is really installed (MetaMask, Coinbase Wallet,
 * or both, even when Coinbase Wallet hides MetaMask inside its own provider), then connects,
 * switches networks, reads balances and sends transfers through it.
 *
 * Importing the package reads `window.ethereum` once and works out `INSTALLED_WALLETS`; outside a
 * browser every wallet is "not installed". Everything the package offers is exported from here.
 *
 * @packageDocumentation
 */
export * from './types.ts';
export * from './ethereum.ts';
export * from './blockchain-networks.ts';
export * from './errors.ts';
export {
  configureWallets,
  WALLET_LOG,
  type NetworkConfig,
  type WalletLogger,
  type WalletSettings,
} from './settings.ts';
export * from './abstract-wallet.ts';
export * from './ethereum-wallet.ts';
export * from './metamask-wallet.ts';
export * from './coinbase-wallet.ts';
export * from './wallets.ts';
