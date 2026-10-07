import type { EthereumProvider } from './ethereum.ts';
import { EthereumWallet } from './ethereum-wallet.ts';
import { WALLET_TYPE } from './types.ts';

/**
 * Coinbase Wallet, told apart from MetaMask. Coinbase Wallet takes `window.ethereum` and says
 * `isMetaMask` there too; `isCoinbaseWallet` is what gives it away. When other wallets share the
 * page it files its own provider in `providerMap`, and that is where it is looked for first. When
 * it is not installed it has no provider at all, so nothing it is asked reaches another wallet. A
 * chain it does not know is left to the user to add (`WALLET_ERROR.NETWORK_NOT_IN_WALLET`).
 *
 * @example
 * const coinbase = WALLET_MAP.get(WALLET_TYPE.COINBASE); // the shared CoinbaseWallet
 * if (coinbase?.isAvailable()) {
 *   const [address] = await coinbase.connect();
 * }
 */
export class CoinbaseWallet extends EthereumWallet {
  /**
   * Whether Coinbase Wallet is installed: listed in `providerMap`, or on `window.ethereum` with
   * `isCoinbaseWallet` set.
   */
  public isAvailable(): boolean {
    // Nothing on window.ethereum: no wallet at all.
    if (!super.isAvailable()) {
      return false;
    }
    // Coinbase Wallet shares the page with other wallets and lists itself among them.
    if (this.isWalletInProvider()) {
      return true;
    }
    // On its own, Coinbase Wallet is window.ethereum, and says so.
    return (
      !this.isWalletInProvider() && super.isAvailable() && !!this.getLibrary()?.isCoinbaseWallet
    );
  }

  /** Whether Coinbase Wallet shares the page and keeps its own provider in `providerMap`. */
  public isWalletInProvider(): boolean {
    return !!this.getLibrary()?.providerMap?.has(WALLET_TYPE.COINBASE);
  }

  /**
   * Coinbase Wallet's own provider, and only Coinbase Wallet's: out of `providerMap` when it shares
   * the page, `window.ethereum` when it is alone. `undefined` when Coinbase Wallet is not
   * installed: its calls then fail with `WALLET_ERROR.NO_PROVIDER` instead of reaching whichever
   * wallet took `window.ethereum`.
   */
  public getProvider(): EthereumProvider | undefined {
    if (!this.isAvailable()) {
      return undefined;
    }
    return this.isWalletInProvider()
      ? this.getLibrary()?.providerMap?.get(WALLET_TYPE.COINBASE)
      : this.getLibrary();
  }
}
