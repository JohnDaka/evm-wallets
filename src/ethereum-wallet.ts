import { AbstractWallet } from './abstract-wallet.ts';
import { CHAIN_ID, type ChainConfig, EXPLORER_PATH } from './blockchain-networks.ts';
import { WALLET_ERROR, WALLET_ERROR_MESSAGE, WalletError } from './errors.ts';
import {
  DECIMAL_BASE,
  type EthereumProvider,
  fromHex,
  NATIVE_DECIMALS,
  PROVIDER_ERROR_CODE,
  type ProviderRpcError,
  RPC_METHOD,
  textToHex,
  toHex,
  TRANSFER_GAS_LIMIT,
  WEI_FRACTION_DIGITS,
} from './ethereum.ts';
import { ExactDecimal } from './exact-decimal.ts';
import { isNumber, TYPE_OF } from './guards.ts';
import { type NetworkConfig, settings, WALLET_LOG } from './settings.ts';
import type { WalletAddress } from './types.ts';

/**
 * `window.ethereum`, the provider wallet extensions put on the page: read once, when the package
 * loads, so every wallet object agrees on it. Extensions inject it before the page's scripts run.
 * `undefined` outside a browser (server rendering, Node), and in a browser with no wallet.
 */
const { ethereum } = (typeof window === TYPE_OF.UNDEFINED ? {} : window) as {
  ethereum?: EthereumProvider;
};

/** What `sendTransaction` sends: an amount of the chain's native coin, and what it is for. */
export type SendTransactionParams = {
  /** The account the coins leave from: one the user connected. */
  fromAddress: string;
  /** The account the coins go to. A plain account: `data` sent to a contract would call it. */
  toAddress: string;
  /**
   * How many coins (ether, BNB, POL, AVAX), as a decimal string: a string, so no float rounding
   * gets in. Sent in wei, exactly, with `NATIVE_DECIMALS` assumed; digits past the 18th decimal
   * round half up to the nearest wei.
   */
  amount: string;
  /**
   * The coin's symbol, as the app names it, for the receiving side: written into `data` next to
   * `metadata`. It picks no token contract: only the native coin is sent.
   */
  token: string;
  /**
   * The chain the transfer is for. The wallet is asked its own first: on another chain nothing is
   * sent, and the answer's `code` is `WALLET_ERROR.WRONG_NETWORK`. It also goes into the
   * transaction as hex, so the wallet itself refuses it if the user switches networks in between.
   */
  chainId: number;
  /**
   * Written into the transaction's `data` as JSON (with `token` added), so the receiving side can
   * tell what the transfer is for. Keep it small: every byte costs gas. Anyone can read it on
   * chain, so never anything private.
   */
  metadata?: Record<string, unknown>;
};

/** What `sendTransaction` answers: it never throws, a failure comes back here too. */
export type TransactionResult = {
  /** The transaction's hash, to follow it on an explorer; empty when nothing was sent. */
  txHash: string;
  /** Whether the wallet sent it. Sent is not yet confirmed: the chain may still fail it. */
  success: boolean;
  /**
   * Why nothing was sent, ready to show: the wallet's own message (the user rejected it), or the
   * package's `WALLET_ERROR_MESSAGE`. Absent on success.
   */
  error?: string;
  /**
   * Which of the package's own refusals it was: `WALLET_ERROR.NO_PROVIDER` (no wallet to ask),
   * `WALLET_ERROR.WRONG_NETWORK` (the wallet is on another chain: switch it and send again), or
   * `WALLET_ERROR.INVALID_CHAIN_ID` (the wallet answered a chain id that is not one). Absent on
   * success, and when the wallet itself refused: then `error` is the wallet's own message.
   */
  code?: WALLET_ERROR;
};

/** A transfer that never reached the chain has no hash. */
const NO_TX_HASH = '';

/**
 * The provider to talk to, or the error a missing one is.
 *
 * @throws {WalletError} `WALLET_ERROR.NO_PROVIDER` when the wallet has no provider.
 */
const providerOf = (wallet: AbstractWallet): EthereumProvider => {
  const provider = wallet.getProvider();
  if (!provider) {
    throw new WalletError(WALLET_ERROR.NO_PROVIDER);
  }
  return provider;
};

/** A chain id the way wallets write it (EIP-695): `0x` and hex digits, `'0x89'` for Polygon. */
const HEX_CHAIN_ID = /^0x[0-9a-fA-F]+$/;

/** A chain id in decimal digits alone, the way people write it: `'137'` for Polygon. */
const DECIMAL_CHAIN_ID = /^[0-9]+$/;

/**
 * A chain id read from a number or a text: a number as it is, `0x` text as hex, text of decimal
 * digits as decimal; `undefined` for any other text.
 */
const parseChainId = (chainId: string | number): number | undefined => {
  if (isNumber(chainId)) return chainId;
  if (HEX_CHAIN_ID.test(chainId)) return fromHex(chainId);
  if (DECIMAL_CHAIN_ID.test(chainId)) return Number(chainId);
  return undefined;
};

/**
 * A wallet behind any EIP-1193 provider on `window.ethereum`: connecting, switching networks,
 * balances and transfers, the JSON-RPC way. `MetaMaskWallet` and `CoinbaseWallet` extend it to
 * find their own provider when both are installed; an app's own wallet extends it the same way.
 * Its static helpers work without a wallet: chain ids, explorer links and the app's networks.
 *
 * @example
 * const wallet = new EthereumWallet(); // whichever wallet took window.ethereum
 * if (wallet.isAvailable()) {
 *   const [address] = await wallet.connect();
 *   const link = EthereumWallet.getExplorerUrl(address, CHAIN_ID.ETHEREUM);
 *   // 'https://etherscan.io/address/0x…'
 * }
 */
export class EthereumWallet extends AbstractWallet {
  /**
   * A chain id as a number, however it came. A number stays as it is. Text with `0x` is hex, the
   * way wallets report chain ids (`chainChanged`, `eth_chainId`, EIP-695); text of decimal digits
   * alone is decimal.
   *
   * @param chainId - A number; `0x` and hex digits; or decimal digits.
   * @returns The chain id.
   * @throws {WalletError} `WALLET_ERROR.INVALID_CHAIN_ID` for any other text.
   * @example
   * provider.on(PROVIDER_EVENT.CHAIN_CHANGED, (chainIdHex: string) => {
   *   const chainId = EthereumWallet.normalizeChainId(chainIdHex); // 137 on Polygon
   *   const offered = chainId in EthereumWallet.getSupportedNetworks();
   * });
   */
  static normalizeChainId(chainId: string | number): number {
    const normalizedChainId = parseChainId(chainId);
    if (!isNumber(normalizedChainId)) {
      throw new WalletError(WALLET_ERROR.INVALID_CHAIN_ID);
    }
    return normalizedChainId;
  }

  /**
   * A link to the address's page on the chain's block explorer: its balance and transactions.
   * Explorers come from the `chains` setting (`CHAIN_MAP` unless the app set its own). Never
   * throws: a chain without an explorer there, or a chain id that is not one, gets Ethereum's.
   *
   * @param address - An account or contract address.
   * @param chainId - The chain, read the way {@link EthereumWallet.normalizeChainId} reads it.
   * @returns The explorer page's address.
   * @example
   * EthereumWallet.getExplorerUrl(depositAddress, CHAIN_ID.POLYGON);
   * // 'https://polygonscan.com/address/0x…'
   */
  static getExplorerUrl(address: string, chainId: number | string): string {
    const chainConfig = EthereumWallet.chainOf(chainId);
    return `${chainConfig.explorerUrl}/${EXPLORER_PATH.ADDRESS}/${address}`;
  }

  /**
   * The name of the chain's block explorer, for a link's text. Never throws: a chain without an
   * explorer, or a chain id that is not one, gets Ethereum's.
   *
   * @param chainId - The chain, read the way {@link EthereumWallet.normalizeChainId} reads it.
   * @returns The explorer's name.
   * @example
   * EthereumWallet.getExplorerName(CHAIN_ID.BSC); // 'BSCScan'
   */
  static getExplorerName(chainId: number | string): string {
    return EthereumWallet.chainOf(chainId).explorerName;
  }

  /**
   * The networks the app offers, by chain id: names and icons from `configureWallets`, every chain
   * in `CHAIN_MAP` without icons until the app sets its own. The same as each wallet's own
   * `getSupportedNetworks()`, without a wallet.
   *
   * @example
   * Object.keys(EthereumWallet.getSupportedNetworks()).map(Number); // [1, 56, 137, 43114]
   */
  static getSupportedNetworks(): Record<number, NetworkConfig> {
    return settings.networks;
  }

  /**
   * The chain's explorer and names; Ethereum's for a chain the app does not know, or a chain id
   * that is not one, so a link is always there to show.
   */
  private static chainOf(chainId: number | string): ChainConfig {
    const normalizedChainId = parseChainId(chainId);
    const chain = isNumber(normalizedChainId) ? settings.chains.get(normalizedChainId) : undefined;
    return chain || settings.chains.get(CHAIN_ID.ETHEREUM)!;
  }

  /** The networks the app offers: {@link EthereumWallet.getSupportedNetworks}. */
  public getSupportedNetworks(): Record<number, NetworkConfig> {
    return EthereumWallet.getSupportedNetworks();
  }

  /** Whether any wallet put a provider on `window.ethereum`. */
  public isAvailable(): boolean {
    return !!ethereum;
  }

  /** `window.ethereum`, whichever wallet it is. */
  public getProvider(): EthereumProvider | undefined {
    return ethereum;
  }

  /** `window.ethereum`, whichever wallet it is: the page's provider the subclasses look into. */
  public getLibrary(): EthereumProvider | undefined {
    return ethereum;
  }

  /**
   * Whether the page is already connected to one of the wallet's accounts, asked without a prompt
   * (`eth_accounts`): to bring back a connection after a reload. Never throws: a failure is logged
   * (`WALLET_LOG.CONNECTION_CHECK_FAILED`) and answers `false`.
   *
   * @example
   * if (await wallet.isConnected()) {
   *   const [address] = await wallet.connect(); // no prompt: the page is connected already
   * }
   */
  public async isConnected(): Promise<boolean> {
    try {
      const accounts = await providerOf(this).request<WalletAddress[]>({
        method: RPC_METHOD.ACCOUNTS,
      });
      return accounts && accounts.length > 0;
    } catch (error) {
      settings.logger.error(WALLET_LOG.CONNECTION_CHECK_FAILED, error);
      return false;
    }
  }

  /**
   * Asks the user to connect (`eth_requestAccounts`: the wallet shows its prompt) and answers the
   * accounts they allowed, the one in use first. A page the user connected before gets them
   * without a prompt. A failure is logged (`WALLET_LOG.CONNECT_FAILED`) and thrown on.
   *
   * @returns The accounts, the one in use first.
   * @throws {WalletError} `WALLET_ERROR.NO_PROVIDER` when there is no provider to ask.
   * @throws The wallet's own error when the user refuses (EIP-1193 code 4001).
   * @example
   * const [address] = await wallet.connect();
   */
  public async connect(): Promise<WalletAddress[]> {
    try {
      const accounts = await providerOf(this).request<WalletAddress[]>({
        method: RPC_METHOD.REQUEST_ACCOUNTS,
      });
      return accounts;
    } catch (error) {
      settings.logger.error(WALLET_LOG.CONNECT_FAILED, error);
      throw error;
    }
  }

  /**
   * Resolves at once and asks the wallet nothing: wallets have no call to disconnect a page. The
   * user disconnects in the wallet itself, and the app hears it as `accountsChanged` with no
   * accounts; the app forgets its own record of the connection.
   */
  public async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Asks the wallet to move to the chain (`wallet_switchEthereumChain`, EIP-3326). When the wallet
   * does not know the chain (4902), {@link EthereumWallet.handleNetworkNotFound} decides: here it
   * throws, MetaMask asks to add the chain.
   *
   * @param chainId - The chain to move to: one of `CHAIN_ID`, or any other the app offers.
   * @throws {WalletError} `WALLET_ERROR.NO_PROVIDER` when there is no provider to ask.
   * @throws {WalletError} `WALLET_ERROR.NETWORK_NOT_IN_WALLET` when the wallet does not know the
   * chain (`WALLET_ERROR.NETWORK_NOT_ADDED` from MetaMask, see `MetaMaskWallet`).
   * @throws The wallet's own error otherwise, such as the user refusing to switch.
   * @example
   * await wallet.switchNetwork(CHAIN_ID.POLYGON);
   */
  public async switchNetwork(chainId: number): Promise<void> {
    try {
      await providerOf(this).request({
        method: RPC_METHOD.SWITCH_CHAIN,
        params: [{ chainId: toHex(chainId) }],
      });
    } catch (error) {
      // 4902: the wallet does not know the chain; whether it can be added depends on the wallet.
      if ((error as ProviderRpcError).code === PROVIDER_ERROR_CODE.UNRECOGNIZED_CHAIN) {
        await this.handleNetworkNotFound(chainId);
      } else {
        throw error;
      }
    }
  }

  /**
   * What happens when the wallet does not know the chain: a wallet that cannot be asked to add it
   * leaves it to the user. MetaMask overrides this to add the chain.
   *
   * @throws {WalletError} `WALLET_ERROR.NETWORK_NOT_IN_WALLET`, always.
   */
  protected async handleNetworkNotFound(_chainId: number): Promise<void> {
    return Promise.reject(new WalletError(WALLET_ERROR.NETWORK_NOT_IN_WALLET));
  }

  /**
   * Sends `amount` of the chain's native coin from `fromAddress` to `toAddress`, with
   * `{ ...metadata, token }` as JSON in the transaction's `data` and `TRANSFER_GAS_LIMIT` gas. The
   * wallet asks the user to confirm it.
   *
   * The wallet is asked its chain first (`eth_chainId`). On any other chain than `chainId` nothing
   * is sent, and the answer's `code` is `WALLET_ERROR.WRONG_NETWORK`: the app switches the wallet
   * (`switchNetwork`) and sends again. `chainId` also goes into the transaction, as hex, so the
   * wallet itself refuses it if the user switches networks between the check and the send.
   *
   * Never throws: a failure is logged (`WALLET_LOG.TRANSACTION_FAILED`) and answered as
   * `{ txHash: '', success: false, error }`, with a `code` when the package refused it itself. A
   * sent transfer is logged (`WALLET_LOG.TRANSACTION_SENT`) with its hash and metadata.
   *
   * @param params - What to send, where, on which chain, and what it is for.
   * @returns The hash on success; why it failed otherwise.
   * @example
   * // deposit is the app's own: the address, amount and id its back end gave the payment.
   * const transfer: SendTransactionParams = {
   *   fromAddress: address,
   *   toAddress: deposit.address,
   *   amount: deposit.amount,
   *   token: CRYPTO_TOKEN.ETH, // the app's own names for the coins it takes
   *   chainId: CHAIN_ID.ETHEREUM,
   *   metadata: { depositId: deposit.id },
   * };
   * let result = await wallet.sendTransaction(transfer);
   * if (result.code === WALLET_ERROR.WRONG_NETWORK) {
   *   await wallet.switchNetwork(transfer.chainId); // the wallet asks the user to switch
   *   result = await wallet.sendTransaction(transfer);
   * }
   * if (!result.success) showError(result.error);
   */
  public async sendTransaction(params: SendTransactionParams): Promise<TransactionResult> {
    try {
      const { fromAddress, toAddress, amount, token, chainId, metadata } = params;
      const provider = providerOf(this);

      // Coins to wei in decimal arithmetic, then a bigint: a JS number would round an amount past
      // 2^53 wei (about 0.009 ether). Every native coin here has NATIVE_DECIMALS decimals.
      const amountInWei = new ExactDecimal(amount)
        .mul(new ExactDecimal(DECIMAL_BASE).pow(NATIVE_DECIMALS))
        .toFixed(WEI_FRACTION_DIGITS);
      const amountHex = toHex(BigInt(amountInWei));

      // What the transfer is for, readable by the receiving side: JSON, as UTF-8 bytes in hex.
      const metadataJson = JSON.stringify({ ...metadata, token });
      const metadataHex = textToHex(metadataJson);

      // A transfer goes out on the chain the wallet is on: on any other than its own, none is sent.
      const walletChainId = EthereumWallet.normalizeChainId(
        await provider.request<string>({ method: RPC_METHOD.CHAIN_ID }),
      );
      const onTransferChain = walletChainId === chainId;
      if (!onTransferChain) {
        throw new WalletError(WALLET_ERROR.WRONG_NETWORK);
      }

      const txHash = await provider.request<string>({
        method: RPC_METHOD.SEND_TRANSACTION,
        params: [
          {
            from: fromAddress,
            to: toAddress,
            value: amountHex,
            data: metadataHex,
            gas: toHex(TRANSFER_GAS_LIMIT),
            // Checked again by the wallet as it signs, in case the user switched in between.
            chainId: toHex(chainId),
          },
        ],
      });

      settings.logger.log(WALLET_LOG.TRANSACTION_SENT, {
        txHash,
        metadata: params.metadata,
        metadataHex,
      });

      return {
        txHash,
        success: true,
      };
    } catch (error) {
      settings.logger.error(WALLET_LOG.TRANSACTION_FAILED, error);
      return {
        txHash: NO_TX_HASH,
        success: false,
        error:
          (error as ProviderRpcError).message ||
          WALLET_ERROR_MESSAGE[WALLET_ERROR.TRANSACTION_FAILED],
        // The package's own refusals say which they are; the wallet's keep their message alone.
        ...(error instanceof WalletError ? { code: error.code } : {}),
      };
    }
  }
}
