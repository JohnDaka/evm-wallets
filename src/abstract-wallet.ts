import { WALLET_ERROR, WalletError } from './errors.ts';
import {
  BALANCE_FRACTION_DIGITS,
  BLOCK_TAG,
  DECIMAL_BASE,
  type EthereumProvider,
  NATIVE_DECIMALS,
  NO_BALANCE,
  RPC_METHOD,
  weiFromHex,
} from './ethereum.ts';
import type { SendTransactionParams, TransactionResult } from './ethereum-wallet.ts';
import { ExactDecimal } from './exact-decimal.ts';
import { type NetworkConfig, settings, WALLET_LOG } from './settings.ts';
import type { WalletAddress } from './types.ts';

/**
 * What every wallet answers, whichever it is. An app keeps its wallets as `AbstractWallet` (the
 * values of `WALLET_MAP`) and never needs to know which one it holds. `EthereumWallet` answers it
 * for any EIP-1193 provider; `MetaMaskWallet` and `CoinbaseWallet` pick their own provider out of
 * the page.
 *
 * @example
 * // The wallet the user connected before the page reloaded: storedWalletType is the app's.
 * const wallet: AbstractWallet | undefined = WALLET_MAP.get(storedWalletType);
 * if (wallet?.isAvailable() && (await wallet.isConnected())) {
 *   const [address] = await wallet.connect(); // no prompt: the page is connected already
 * }
 */
export abstract class AbstractWallet {
  /**
   * Whether this wallet is installed on the page. Worked out from `window.ethereum` as it was when
   * the package loaded; always `false` outside a browser. A wallet that is not installed has no
   * provider: its calls fail with `WALLET_ERROR.NO_PROVIDER` rather than reach another wallet.
   */
  public abstract isAvailable(): boolean;

  /**
   * The provider that talks to this wallet and to no other: its own one out of `providerMap` when
   * Coinbase Wallet shares the page, `window.ethereum` otherwise; `undefined` when the wallet is
   * not installed. Listen to the wallet's events here, not on `window.ethereum`.
   */
  public abstract getProvider(): EthereumProvider | undefined;

  /** `window.ethereum` as the package found it on load, whichever wallet took it. */
  public abstract getLibrary(): EthereumProvider | undefined;

  /**
   * Whether the page is already connected to one of the wallet's accounts, asked without a prompt
   * (`eth_accounts`): to bring back a connection after a reload. Never throws: a failure is logged
   * and answers `false`.
   */
  public abstract isConnected(): Promise<boolean>;

  /**
   * Asks the user to connect (`eth_requestAccounts`: the wallet shows its prompt) and answers the
   * accounts they allowed, the one in use first. A page the user connected before gets them
   * without a prompt.
   *
   * @throws {WalletError} `WALLET_ERROR.NO_PROVIDER` when there is no provider to ask.
   * @throws The wallet's own error when the user refuses (EIP-1193 code 4001).
   */
  public abstract connect(): Promise<WalletAddress[]>;

  /**
   * Resolves at once and asks the wallet nothing: wallets have no call to disconnect a page. The
   * user disconnects in the wallet itself, and the app hears it as `accountsChanged` with no
   * accounts; the app forgets its own record of the connection.
   */
  public abstract disconnect(): Promise<void>;

  /**
   * Sends the chain's native coin, with the app's metadata in the transaction's data, on the chain
   * the transfer names: the wallet is asked its chain first, and on another one nothing is sent
   * (`code: WALLET_ERROR.WRONG_NETWORK`). Never throws: a failure comes back as
   * `{ success: false, error, code? }`.
   */
  public abstract sendTransaction(params: SendTransactionParams): Promise<TransactionResult>;

  /**
   * The account's balance in the chain's native coin (ether on Ethereum, BNB, POL, AVAX), on the
   * chain the wallet is on: a decimal string to `BALANCE_FRACTION_DIGITS` places, rounded half up.
   *
   * Never throws: when the balance cannot be read (no provider, the wallet failed) the failure is
   * logged and the answer is `NO_BALANCE`, which a balance that was read never is.
   *
   * @param address - The account to read, usually one `connect()` answered.
   * @returns The balance in coins: `'1.2346'`.
   * @example
   * const [address] = await wallet.connect();
   * const balance = await wallet.getBalance(address); // '0.4210': ether, four places
   * if (balance === NO_BALANCE) showBalanceUnavailable(); // the app's own message
   */
  public async getBalance(address: WalletAddress): Promise<string> {
    try {
      const provider = this.getProvider();

      if (!provider) {
        throw new WalletError(WALLET_ERROR.NO_PROVIDER);
      }

      const balanceHex = await provider.request<string>({
        method: RPC_METHOD.GET_BALANCE,
        params: [address, BLOCK_TAG.LATEST],
      });

      // Wei to coins in decimal arithmetic: a JS number would round a balance past 2^53 wei.
      const balanceInWei = weiFromHex(balanceHex);
      return new ExactDecimal(balanceInWei.toString())
        .div(new ExactDecimal(DECIMAL_BASE).pow(NATIVE_DECIMALS))
        .toFixed(BALANCE_FRACTION_DIGITS);
    } catch (error) {
      settings.logger.error(WALLET_LOG.BALANCE_FAILED, error);
      return NO_BALANCE;
    }
  }

  /**
   * The networks the app offers, by chain id: its names and icons (`configureWallets`). Every
   * chain in `CHAIN_MAP`, without icons, until the app sets its own.
   */
  public abstract getSupportedNetworks(): Record<number, NetworkConfig>;

  /**
   * Asks the wallet to move to the chain (EIP-3326), and handles a chain the wallet does not
   * know: MetaMask is asked to add it, Coinbase Wallet throws.
   *
   * @param chainId - The chain to move to: one of `CHAIN_ID`, or any other the app offers.
   * @throws {WalletError} `WALLET_ERROR.NO_PROVIDER` when there is no provider to ask.
   * @throws {WalletError} `WALLET_ERROR.NETWORK_NOT_ADDED` (MetaMask) or
   * `WALLET_ERROR.NETWORK_NOT_IN_WALLET` (any other) when the wallet does not know the chain.
   * @throws The wallet's own error otherwise, such as the user refusing to switch.
   */
  public abstract switchNetwork(chainId: number): Promise<void>;
}
