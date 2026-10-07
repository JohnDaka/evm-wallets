/**
 * Fakes for the specs: the providers wallet extensions inject, a logger that keeps what the
 * wallets log, and the accounts and the transfer the specs use. Not part of the package: the build
 * leaves `src/testing` out.
 *
 * Only type imports from the wallet classes: `pages.script.ts` loads this module before it sets
 * `window` up, and a wallet module loaded that early would read `window.ethereum` too soon.
 */
import assert from 'node:assert/strict';

import { CHAIN_ID } from '../blockchain-networks.ts';
import { WALLET_ERROR_MESSAGE, WalletError } from '../errors.ts';
import type {
  EthereumProvider,
  PROVIDER_EVENT,
  ProviderListener,
  ProviderRpcError,
  RequestArguments,
  RPC_METHOD,
} from '../ethereum.ts';
import type { SendTransactionParams } from '../ethereum-wallet.ts';
import { configureWallets, settings, type WalletLogger, type WalletSettings } from '../settings.ts';
import { WALLET_TYPE } from '../types.ts';

/** EIP-1193 4001: the user rejected the request, what a refused prompt rejects with. */
export const USER_REJECTED = 4001;

/** JSON-RPC -32603: the wallet failed inside, with or without a message. */
export const INTERNAL_ERROR = -32603;

/** Accounts the specs send from and to. */
export const ADDRESS = {
  /** The user's account in the wallet. */
  USER: '0x1111111111111111111111111111111111111111',
  /** Another account of the user's. */
  OTHER: '0x2222222222222222222222222222222222222222',
  /** Where the app's deposits go. */
  DEPOSIT: '0x3333333333333333333333333333333333333333',
} as const;

/** The hash a wallet answers a sent transaction with. */
export const TX_HASH = `0x${'ab'.repeat(32)}`;

/** A deposit of half an ether on Ethereum, the way an app sends one. */
export const DEPOSIT: SendTransactionParams = {
  fromAddress: ADDRESS.USER,
  toAddress: ADDRESS.DEPOSIT,
  amount: '0.5',
  token: 'ETH',
  chainId: CHAIN_ID.ETHEREUM,
  metadata: { depositId: 'A-12' },
};

/** The fake providers' labels: whose provider an assertion or a page's report names. */
export const PROVIDER = {
  METAMASK: 'MetaMask',
  COINBASE: 'Coinbase Wallet',
  /** What Coinbase Wallet puts on `window.ethereum` when it shares the page: no wallet's own. */
  COINBASE_ON_WINDOW: 'Coinbase Wallet on window.ethereum',
  OTHER: 'another wallet',
} as const;

/**
 * What a fake provider answers, by method: a value; an `Error` it rejects with; or a function of
 * the request's parameters, for a wallet whose answers change (its chain, once it switched).
 */
export type Answers = Partial<Record<RPC_METHOD, unknown>>;

/** An answer worked out from the request's parameters. */
type AnswerOf = (params: unknown[] | undefined) => unknown;

/** The flags a wallet sets on the provider it injects. */
export type ProviderFlags = Pick<EthereumProvider, 'isMetaMask' | 'isCoinbaseWallet'>;

/**
 * An EIP-1193 provider as a wallet extension injects it. It answers each method with what the spec
 * gave it, rejecting when that is an `Error`, records every request, and keeps the listeners
 * subscribed to it so a spec can fire an event.
 */
export class FakeProvider implements EthereumProvider {
  /** Which wallet it plays: tells fakes apart in assertions and in a page's report. */
  public readonly label: string;
  /** Every request received, in order. */
  public readonly requests: RequestArguments[] = [];
  /** Set the way MetaMask, and most wallets after it, set it. */
  public isMetaMask?: boolean;
  /** Set the way Coinbase Wallet sets it. */
  public isCoinbaseWallet?: boolean;
  /** Set the way Coinbase Wallet sets it when it shares the page with other wallets. */
  public providerMap?: Map<string, EthereumProvider>;
  /** What each method answers. */
  private readonly answers: Answers;
  /** The listeners subscribed to each event. */
  private readonly listeners = new Map<PROVIDER_EVENT, Set<ProviderListener>>();

  /**
   * @param label - Which wallet it plays.
   * @param flags - The flags its wallet sets on it.
   * @param answers - What each method answers; a method not given answers `undefined`.
   */
  public constructor(label: string, flags: ProviderFlags = {}, answers: Answers = {}) {
    this.label = label;
    this.isMetaMask = flags.isMetaMask;
    this.isCoinbaseWallet = flags.isCoinbaseWallet;
    this.answers = answers;
  }

  /** The methods requested, in order: what most specs check. */
  public get methods(): string[] {
    return this.requests.map(({ method }) => method);
  }

  public async request<T>(args: RequestArguments): Promise<T> {
    this.requests.push(args);
    const given = this.answers[args.method as RPC_METHOD];
    const answer = typeof given === 'function' ? (given as AnswerOf)(args.params) : given;
    if (answer instanceof Error) {
      throw answer;
    }
    return answer as T;
  }

  public on(event: PROVIDER_EVENT, listener: ProviderListener): void {
    const listeners = this.listeners.get(event) ?? new Set<ProviderListener>();
    this.listeners.set(event, listeners.add(listener));
  }

  public removeListener(event: PROVIDER_EVENT, listener: ProviderListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  /** Calls every listener subscribed to `event` with the payload, as the extension does. */
  public emit(event: PROVIDER_EVENT, ...payload: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => {
      (listener as (...payload: unknown[]) => void)(...payload);
    });
  }
}

/** MetaMask's provider: `isMetaMask`, nothing else. */
export const metaMaskProvider = (answers: Answers = {}): FakeProvider =>
  new FakeProvider(PROVIDER.METAMASK, { isMetaMask: true }, answers);

/** Coinbase Wallet's provider: `isCoinbaseWallet`, and `isMetaMask` too, to pass for MetaMask. */
export const coinbaseProvider = (answers: Answers = {}): FakeProvider =>
  new FakeProvider(PROVIDER.COINBASE, { isMetaMask: true, isCoinbaseWallet: true }, answers);

/**
 * What Coinbase Wallet puts on `window.ethereum` when MetaMask is installed too: a provider of its
 * own, passing for MetaMask like Coinbase's, with each wallet's provider in `providerMap`.
 */
export const coinbaseTakesWindow = (
  metaMask: FakeProvider,
  coinbase: FakeProvider,
): FakeProvider => {
  const onWindow = new FakeProvider(PROVIDER.COINBASE_ON_WINDOW, {
    isMetaMask: true,
    isCoinbaseWallet: true,
  });
  onWindow.providerMap = new Map<string, EthereumProvider>([
    [WALLET_TYPE.METAMASK, metaMask],
    [WALLET_TYPE.COINBASE, coinbase],
  ]);
  return onWindow;
};

/** An error the way a provider rejects with it: a message and EIP-1193's numeric `code`. */
export const rpcError = (code: number, message: string): Error & ProviderRpcError =>
  Object.assign(new Error(message), { code });

/**
 * For `assert.rejects`: checks the error is a `WalletError` with `code`, saying that code's
 * message.
 */
export const walletErrorWith =
  (code: WalletError['code']) =>
  (error: unknown): true => {
    assert.ok(error instanceof WalletError, `Not a WalletError: ${String(error)}`);
    assert.equal(error.code, code);
    assert.equal(error.message, WALLET_ERROR_MESSAGE[code]);
    return true;
  };

/** A logger that keeps what the wallets log: a spec checks it, and the output stays clean. */
export class RecordingLogger implements WalletLogger {
  /** What `log` got: one argument list per call. */
  public readonly logs: unknown[][] = [];
  /** What `error` got: one argument list per call. */
  public readonly errors: unknown[][] = [];

  public log = (...args: unknown[]): void => {
    this.logs.push(args);
  };

  public error = (...args: unknown[]): void => {
    this.errors.push(args);
  };
}

/** The settings the package starts with, to put back after a spec changed them. */
const DEFAULT_SETTINGS: WalletSettings = { ...settings };

/**
 * Puts the package's own settings back, with a recording logger in place of the console, so what
 * one spec configured or logged never reaches the next.
 *
 * @returns The logger the wallets now write to.
 */
export const resetSettings = (): RecordingLogger => {
  const logger = new RecordingLogger();
  configureWallets({ ...DEFAULT_SETTINGS, logger });
  return logger;
};
