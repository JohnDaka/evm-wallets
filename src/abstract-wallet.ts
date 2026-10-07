import Decimal from 'decimal.js';
import type { WalletAddress } from './types.ts';
import type {
  NetworkConfig,
  SendTransactionParams,
  TransactionResult,
} from './ethereum-wallet.ts';

export abstract class AbstractWallet {
  public abstract isAvailable(): boolean;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public abstract getProvider(): any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public abstract getLibrary(): any;

  public abstract isConnected(): Promise<boolean>;

  public abstract connect(): Promise<WalletAddress[]>;

  public abstract disconnect(): Promise<void>;

  public abstract sendTransaction(params: SendTransactionParams): Promise<TransactionResult>;

  public async getBalance(address: WalletAddress): Promise<string> {
    try {
      const provider = this.getProvider();

      if (!provider) {
        throw new Error('No provider found');
      }

      const balanceHex = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });

      // Convert from Wei to ETH using Decimal.js for precision
      const balanceInWei = parseInt(balanceHex, 16);
      return new Decimal(balanceInWei).div(new Decimal(10).pow(18)).toFixed(4);
    } catch (error) {
      console.error('Error fetching balance:', error);
      return '0';
    }
  }

  public abstract getSupportedNetworks(): Record<number, NetworkConfig>;

  public abstract switchNetwork(chainId: number): Promise<void>;
}
