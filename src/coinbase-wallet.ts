import { EthereumWallet } from './ethereum-wallet.ts';
import { WALLET_TYPE } from './types.ts';

export class CoinbaseWallet extends EthereumWallet {
  public isAvailable(): boolean {
    if (!super.isAvailable()) {
      return false;
    }
    if (this.isWalletInProvider()) {
      return true;
    }
    return !this.isWalletInProvider() && super.isAvailable() && this.getLibrary().isCoinbaseWallet;
  }

  public isWalletInProvider(): boolean {
    return this.getLibrary().providerMap && this.getLibrary().providerMap.has(WALLET_TYPE.COINBASE);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getProvider(): any {
    return this.isWalletInProvider()
      ? this.getLibrary().providerMap.get(WALLET_TYPE.COINBASE)
      : this.getLibrary();
  }
}
