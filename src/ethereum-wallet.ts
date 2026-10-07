import Decimal from 'decimal.js';
import { AbstractWallet } from './abstract-wallet.ts';
import type { WalletAddress } from './types.ts';
import { CHAIN_ID, CHAIN_MAP, type ChainConfig } from './blockchain-networks.ts';

// The page's injected provider, read once when the package loads. None outside a browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { ethereum } = (typeof window === 'undefined' ? {} : window) as { ethereum?: any };

export type NetworkConfig = {
  name: string;
  icon: string;
};

export type SendTransactionParams = {
  fromAddress: string;
  toAddress: string;
  amount: string;
  token: string;
  chainId: number;
  /**
   * Written into the transaction's `data` as JSON (with `token` added), so the receiving side can
   * tell what the transfer is for. Keep it small: every byte costs gas.
   */
  metadata?: Record<string, unknown>;
};

export type TransactionResult = {
  txHash: string;
  success: boolean;
  error?: string;
};

export type WalletSettings = {
  /** The networks the app offers, by chain id: what `getSupportedNetworks()` answers. */
  networks: Record<number, NetworkConfig>;
  /** Explorer and naming per chain id, for `getExplorerUrl` and `getExplorerName`. */
  chains: Map<number, ChainConfig>;
};

const settings: WalletSettings = {
  networks: {
    [CHAIN_ID.ETHEREUM]: { name: 'Ethereum Mainnet', icon: '' },
    [CHAIN_ID.BSC]: { name: 'BSC Mainnet', icon: '' },
    [CHAIN_ID.POLYGON]: { name: 'Polygon Mainnet', icon: '' },
    [CHAIN_ID.AVALANCHE]: { name: 'Avalanche C-Chain', icon: '' },
  },
  chains: CHAIN_MAP,
};

/**
 * Sets the app's own networks (their icons, a different list) and chain explorers. Call it once,
 * before the wallets are used:
 *
 *   configureWallets({
 *     networks: {
 *       [CHAIN_ID.ETHEREUM]: { name: 'Ethereum Mainnet', icon: cdn('/networks/eth.png') },
 *       ...
 *     },
 *   });
 */
export const configureWallets = (changes: Partial<WalletSettings>): void => {
  Object.assign(settings, changes);
};

/** The text `data` field of a transaction: UTF-8 bytes as `0x`-prefixed hex. */
const hexOf = (text: string): string =>
  `0x${Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;

export class EthereumWallet extends AbstractWallet {
  static normalizeChainId(chainId: string | number): number {
    if (typeof chainId === 'number') return chainId;
    return parseInt(chainId, 16);
  }

  static getExplorerUrl(address: string, chainId: number | string): string {
    const normalizedChainId = typeof chainId === 'string' ? parseInt(chainId, 16) : chainId;
    const chainConfig =
      settings.chains.get(normalizedChainId) || settings.chains.get(CHAIN_ID.ETHEREUM)!;
    return `${chainConfig.explorerUrl}/address/${address}`;
  }

  static getExplorerName(chainId: number | string): string {
    const normalizedChainId = typeof chainId === 'string' ? parseInt(chainId, 16) : chainId;
    const chainConfig =
      settings.chains.get(normalizedChainId) || settings.chains.get(CHAIN_ID.ETHEREUM)!;
    return chainConfig.explorerName;
  }

  static getSupportedNetworks(): Record<number, NetworkConfig> {
    return settings.networks;
  }

  public getSupportedNetworks(): Record<number, NetworkConfig> {
    return EthereumWallet.getSupportedNetworks();
  }

  public isAvailable(): boolean {
    return !!ethereum;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getProvider(): any {
    return ethereum;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getLibrary(): any {
    return ethereum;
  }

  public async isConnected(): Promise<boolean> {
    try {
      const accounts = await this.getProvider().request({ method: 'eth_accounts' });
      return accounts && accounts.length > 0;
    } catch (error) {
      console.error('Error checking wallet connection:', error);
      return false;
    }
  }

  public async connect(): Promise<WalletAddress[]> {
    try {
      const accounts = await this.getProvider().request({
        method: 'eth_requestAccounts',
      });
      return accounts;
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    // Ethereum wallets don't have a programmatic disconnect
    // User must disconnect from the wallet extension itself
    return Promise.resolve();
  }

  public async switchNetwork(chainId: number): Promise<void> {
    const chainIdHex = `0x${chainId.toString(16)}`;

    try {
      await this.getProvider().request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // This error code indicates that the chain has not been added to the wallet
      if (error.code === 4902) {
        await this.handleNetworkNotFound(chainId);
      } else {
        throw error;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async handleNetworkNotFound(chainId: number): Promise<void> {
    throw new Error('This network is not available in your wallet. Please add it manually.');
  }

  public async sendTransaction(params: SendTransactionParams): Promise<TransactionResult> {
    try {
      const { fromAddress, toAddress, amount, token, metadata } = params;
      const provider = this.getProvider();

      if (!provider) {
        throw new Error('No provider found');
      }

      // Convert amount to Wei (assuming 18 decimals for native tokens like ETH/BNB/AVAX)
      // For tokens with different decimals, this would need to be adjusted
      const decimals = 18; // This should come from token info
      const amountInWei = new Decimal(amount).mul(new Decimal(10).pow(decimals)).toFixed(0);
      const amountHex = `0x${parseInt(amountInWei).toString(16)}`;

      // Encode metadata as hex data (minimal info for blockchain)
      const metadataJson = JSON.stringify({ ...metadata, token });
      const metadataHex = hexOf(metadataJson);

      // Send transaction
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: fromAddress,
            to: toAddress,
            value: amountHex,
            data: metadataHex, // Include metadata in transaction data
            gas: '0x7A120', // 500000 gas (increased for data)
          },
        ],
      });

      console.log('Transaction sent:', {
        txHash,
        metadata: params.metadata,
        metadataHex,
      });

      return {
        txHash,
        success: true,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return {
        txHash: '',
        success: false,
        error: error.message || 'Failed to send transaction',
      };
    }
  }
}
