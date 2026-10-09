import { ADD_NETWORK_PARAMS } from './blockchain-networks.ts';
import { WALLET_ERROR, WalletError } from './errors.ts';
import { type EthereumProvider, RPC_METHOD, rpcRequest, toHex } from './ethereum.ts';
import { EthereumWallet } from './ethereum-wallet.ts';
import { WALLET_TYPE } from './types.ts';

/**
 * MetaMask, told apart from Coinbase Wallet. When Coinbase Wallet shares the page it takes
 * `window.ethereum` and files MetaMask's own provider in `providerMap`, so that is where MetaMask
 * is looked for first. Otherwise `window.ethereum` counts as MetaMask unless it is Coinbase
 * Wallet's, which says `isMetaMask` too. When MetaMask is not installed it has no provider at all,
 * so nothing it is asked reaches another wallet. A chain MetaMask does not know is added from
 * `ADD_NETWORK_PARAMS` when the user agrees.
 *
 * @example
 * const metaMask = WALLET_MAP.get(WALLET_TYPE.METAMASK); // the shared MetaMaskWallet
 * if (metaMask?.isAvailable()) {
 *   await metaMask.switchNetwork(CHAIN_ID.POLYGON); // MetaMask adds Polygon if it lacks it
 * }
 */
export class MetaMaskWallet extends EthereumWallet {
  /**
   * Whether MetaMask is installed: listed in `providerMap`, or on `window.ethereum` and not
   * Coinbase Wallet. `isMetaMask` proves nothing, as Coinbase Wallet sets it too; any other wallet
   * on `window.ethereum` counts as MetaMask.
   */
  public isAvailable(): boolean {
    // Nothing on window.ethereum: no wallet at all.
    if (!super.isAvailable()) {
      return false;
    }
    // Coinbase Wallet shares the page and lists MetaMask among the wallets it found.
    if (this.isWalletInProvider()) {
      return true;
    }
    // On its own, MetaMask is window.ethereum: there, and not Coinbase Wallet passing for it.
    return (
      !this.isWalletInProvider() && super.isAvailable() && !this.getLibrary()?.isCoinbaseWallet
    );
  }

  /** Whether Coinbase Wallet shares the page and keeps MetaMask's provider in its `providerMap`. */
  public isWalletInProvider(): boolean {
    return !!this.getLibrary()?.providerMap?.has(WALLET_TYPE.METAMASK);
  }

  /**
   * MetaMask's own provider, and only MetaMask's: out of `providerMap` when Coinbase Wallet shares
   * the page, so a call reaches MetaMask and not Coinbase; `window.ethereum` when MetaMask is
   * alone. `undefined` when MetaMask is not installed: its calls then fail with
   * `WALLET_ERROR.NO_PROVIDER` instead of reaching whichever wallet took `window.ethereum`.
   */
  public getProvider(): EthereumProvider | undefined {
    if (!this.isAvailable()) {
      return undefined;
    }
    return this.isWalletInProvider()
      ? this.getLibrary()?.providerMap?.get(WALLET_TYPE.METAMASK)
      : this.getLibrary();
  }

  /**
   * MetaMask can be asked to add a chain it does not know: the user sees the network's details
   * and agrees (MetaMask then offers to switch to it) or refuses.
   *
   * @throws {WalletError} `WALLET_ERROR.NETWORK_NOT_ADDED` when it was not added, whatever the
   * reason: the user refused, the request failed, or the chain cannot be offered (`addNetwork`).
   */
  protected async handleNetworkNotFound(chainId: number): Promise<void> {
    try {
      await this.addNetwork(chainId);
    } catch {
      throw new WalletError(WALLET_ERROR.NETWORK_NOT_ADDED);
    }
  }

  /**
   * Asks MetaMask to add the chain (`wallet_addEthereumChain`, EIP-3085) with its
   * `ADD_NETWORK_PARAMS`, through MetaMask's own provider.
   *
   * @throws {WalletError} `WALLET_ERROR.NETWORK_NOT_SUPPORTED` when the app does not offer the
   * chain, and `WALLET_ERROR.NETWORK_PARAMS_MISSING` when there is nothing to add it with: in both
   * cases MetaMask is not asked.
   * @throws The wallet's own error when the user refuses.
   */
  private async addNetwork(chainId: number): Promise<void> {
    const networks = this.getSupportedNetworks();
    const networkConfig = networks[chainId];

    if (!networkConfig) {
      throw new WalletError(WALLET_ERROR.NETWORK_NOT_SUPPORTED);
    }

    // What wallet_addEthereumChain needs besides the chain id: name, coin, RPC and explorer.
    const networkParams = ADD_NETWORK_PARAMS[chainId];
    if (!networkParams) {
      throw new WalletError(WALLET_ERROR.NETWORK_PARAMS_MISSING);
    }

    await this.getProvider()?.request(
      rpcRequest(RPC_METHOD.ADD_CHAIN, [{ chainId: toHex(chainId), ...networkParams }]),
    );
  }
}
