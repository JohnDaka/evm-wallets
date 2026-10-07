import { EthereumWallet } from './ethereum-wallet.ts';
import { WALLET_TYPE } from './types.ts';
import { ADD_NETWORK_PARAMS } from './blockchain-networks.ts';

export class MetaMaskWallet extends EthereumWallet {
  public isAvailable(): boolean {
    if (!super.isAvailable()) {
      return false;
    }
    if (this.isWalletInProvider()) {
      return true;
    }
    return !this.isWalletInProvider() && super.isAvailable() && !this.getLibrary().isCoinbaseWallet;
  }

  public isWalletInProvider(): boolean {
    return this.getLibrary().providerMap && this.getLibrary().providerMap.has(WALLET_TYPE.METAMASK);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getProvider(): any {
    return this.isWalletInProvider()
      ? this.getLibrary().providerMap.get(WALLET_TYPE.METAMASK)
      : this.getLibrary();
  }

  protected async handleNetworkNotFound(chainId: number): Promise<void> {
    try {
      await this.addNetwork(chainId);
    } catch (addError) {
      throw new Error('Failed to add network to your wallet. Please add it manually.');
    }
  }

  private async addNetwork(chainId: number): Promise<void> {
    const chainIdHex = `0x${chainId.toString(16)}`;
    const networks = this.getSupportedNetworks();
    const networkConfig = networks[chainId];

    if (!networkConfig) {
      throw new Error('Network configuration not found');
    }

    // Network parameters for wallet_addEthereumChain
    const networkParams = ADD_NETWORK_PARAMS[chainId];
    if (!networkParams) {
      throw new Error('Network parameters not found');
    }
    const params = { chainId: chainIdHex, ...networkParams };

    await this.getProvider().request({
      method: 'wallet_addEthereumChain',
      params: [params],
    });
  }
}
