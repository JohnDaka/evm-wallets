/**
 * The Ethereum JSON-RPC and EIP-1193 vocabulary the wallets speak: method names, events, error
 * codes and units. Named once here, so a call reads as what it asks and a value is changed in
 * one place.
 */

/**
 * JSON-RPC methods sent to a wallet's provider: the names EIP-1193 providers answer to.
 *
 * @example
 * const accounts = await provider.request<WalletAddress[]>(rpcRequest(RPC_METHOD.ACCOUNTS));
 */
export const RPC_METHOD = {
  /** The accounts already connected to the page, without asking the user: `eth_accounts`. */
  ACCOUNTS: 'eth_accounts',
  /** Asks the user to connect, the wallet showing its prompt: `eth_requestAccounts`. */
  REQUEST_ACCOUNTS: 'eth_requestAccounts',
  /** An account's native coin balance, in wei, as hex: `eth_getBalance`. */
  GET_BALANCE: 'eth_getBalance',
  /** The chain the wallet is on, its id as hex (EIP-695), asked without a prompt: `eth_chainId`. */
  CHAIN_ID: 'eth_chainId',
  /** Asks the user to sign and send a transaction; answers its hash: `eth_sendTransaction`. */
  SEND_TRANSACTION: 'eth_sendTransaction',
  /** EIP-3326, switch the wallet to another chain: `wallet_switchEthereumChain`. */
  SWITCH_CHAIN: 'wallet_switchEthereumChain',
  /** EIP-3085, add a chain the wallet does not know yet: `wallet_addEthereumChain`. */
  ADD_CHAIN: 'wallet_addEthereumChain',
} as const;
/** One of the {@link RPC_METHOD} values. */
export type RPC_METHOD = (typeof RPC_METHOD)[keyof typeof RPC_METHOD];

/** Which block a read is made against. */
export const BLOCK_TAG = {
  /** The newest block the node has: `latest`. */
  LATEST: 'latest',
} as const;
/** One of the {@link BLOCK_TAG} values. */
export type BLOCK_TAG = (typeof BLOCK_TAG)[keyof typeof BLOCK_TAG];

/**
 * Events an EIP-1193 provider emits. Subscribe on the wallet's own provider (`getProvider()`),
 * not on `window.ethereum`: with Coinbase Wallet on the page, `window.ethereum` is Coinbase's.
 *
 * @example
 * const provider = wallet.getProvider();
 * provider?.on(PROVIDER_EVENT.ACCOUNTS_CHANGED, onAccountsChanged);
 * // When the page no longer needs it:
 * provider?.removeListener(PROVIDER_EVENT.ACCOUNTS_CHANGED, onAccountsChanged);
 */
export const PROVIDER_EVENT = {
  /**
   * The connected accounts changed, `accountsChanged`: the user picked another account (the new
   * list comes with the one in use first) or disconnected the page (an empty list).
   */
  ACCOUNTS_CHANGED: 'accountsChanged',
  /** The wallet moved to another chain, `chainChanged`: the payload is the chain id as hex. */
  CHAIN_CHANGED: 'chainChanged',
  /** The provider lost its connection to every chain, `disconnect`: the payload is the error. */
  DISCONNECT: 'disconnect',
} as const;
/** One of the {@link PROVIDER_EVENT} values. */
export type PROVIDER_EVENT = (typeof PROVIDER_EVENT)[keyof typeof PROVIDER_EVENT];

/** Error codes a provider rejects a request with, the ones the wallets act on. */
export const PROVIDER_ERROR_CODE = {
  /** EIP-3326, 4902: the wallet does not know the chain asked for; it has to be added first. */
  UNRECOGNIZED_CHAIN: 4902,
} as const;
/** One of the {@link PROVIDER_ERROR_CODE} values. */
export type PROVIDER_ERROR_CODE = (typeof PROVIDER_ERROR_CODE)[keyof typeof PROVIDER_ERROR_CODE];

/**
 * Decimals of a native coin, the digits after its point: one ether is 10^18 wei, and BNB, POL and
 * AVAX count the same way. Every amount the wallets convert assumes it.
 */
export const NATIVE_DECIMALS = 18;

/** Amounts are counted in powers of ten: 10^decimals smallest units make one coin. */
export const DECIMAL_BASE = 10;

/**
 * Gas allowed for a transfer, in gas units. A plain transfer needs 21 000; the rest pays for the
 * metadata in its `data`, every byte of which costs gas. Only the gas used is paid for.
 */
export const TRANSFER_GAS_LIMIT = 500_000;

/** Digits after the point in a balance `getBalance` answers: four, a ten-thousandth of a coin. */
export const BALANCE_FRACTION_DIGITS = 4;

/** Wei is the smallest unit: an amount in wei has no digits after the point. */
export const WEI_FRACTION_DIGITS = 0;

/**
 * What `getBalance` answers when the balance cannot be read: `'0'`. A balance that was read and
 * is zero comes with its four places, `'0.0000'`, so the two never mix.
 */
export const NO_BALANCE = '0';

/** The prefix JSON-RPC writes numbers and bytes in hex with: `0x`. */
export const HEX_PREFIX = '0x';

/** The base of hex numbers. */
const HEX_RADIX = 16;

/** Hex digits per byte: two, a byte below 16 is padded. */
const BYTE_HEX_DIGITS = 2;

/** The digit a byte below 16 is padded with, so every byte takes two digits. */
const HEX_PAD = '0';

/**
 * A number as a JSON-RPC quantity: `0x`-prefixed hex, no leading zeros. Amounts in wei come as a
 * `bigint`: a JS number is exact only up to 2^53 (about 0.009 ether in wei), beyond that its last
 * digits round.
 *
 * @param value - A whole number, not negative: a chain id, a gas limit, an amount in wei.
 * @returns The value as hex.
 * @example
 * toHex(CHAIN_ID.POLYGON); // '0x89'
 * toHex(TRANSFER_GAS_LIMIT); // '0x7a120'
 */
export const toHex = (value: number | bigint): string =>
  `${HEX_PREFIX}${value.toString(HEX_RADIX)}`;

/**
 * A JSON-RPC hex quantity as a number: for small ones, such as a chain id. An amount in wei goes
 * through {@link weiFromHex} instead, exactly.
 *
 * @param hex - Hex digits, with or without `0x`.
 * @returns The number; `NaN` when `hex` has no hex digits.
 * @example
 * provider.on(PROVIDER_EVENT.CHAIN_CHANGED, (chainIdHex: string) => {
 *   const chainId = fromHex(chainIdHex); // 137 on Polygon
 * });
 */
export const fromHex = (hex: string): number => parseInt(hex, HEX_RADIX);

/**
 * A JSON-RPC hex quantity of wei, exactly, as a `bigint`: `BigInt` reads `0x`-prefixed hex as it
 * is, with no rounding past 2^53.
 *
 * @param hex - A `0x`-prefixed hex quantity, as `eth_getBalance` answers it.
 * @returns The amount in wei.
 * @throws SyntaxError when `hex` is not a number.
 * @example
 * const balanceHex = await provider.request<string>(
 *   rpcRequest(RPC_METHOD.GET_BALANCE, [address, BLOCK_TAG.LATEST]),
 * );
 * weiFromHex(balanceHex); // 1234567000000000000n
 */
export const weiFromHex = (hex: string): bigint => BigInt(hex);

/**
 * A text as JSON-RPC bytes: its UTF-8 encoding as `0x`-prefixed hex, two digits per byte. How
 * `sendTransaction` writes its metadata into a transaction's `data`.
 *
 * @param text - Any text; an empty one gives `0x`.
 * @returns The bytes as hex.
 * @example
 * textToHex(JSON.stringify(metadata)); // '0x7b22...'
 */
export const textToHex = (text: string): string =>
  `${HEX_PREFIX}${Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(HEX_RADIX).padStart(BYTE_HEX_DIGITS, HEX_PAD),
  ).join('')}`;

/**
 * Any listener a provider calls. Its payload depends on the event (see `PROVIDER_EVENT`), so any
 * function fits: a listener declares the payload it expects.
 */
export type ProviderListener = (...payload: never[]) => void;

/** The JSON-RPC version every request names. */
export const JSON_RPC_VERSION = '2.0';

/**
 * A JSON-RPC request as EIP-1193's `request` takes it. EIP-1193 needs only `method`; the wallets
 * here always send the whole call, built by `rpcRequest`.
 */
export interface RequestArguments {
  /** The call's own id. */
  id?: number;
  /** `JSON_RPC_VERSION`. */
  jsonrpc?: typeof JSON_RPC_VERSION;
  /** The method to call: one of `RPC_METHOD`, or any other the wallet supports. */
  method: string;
  /** The method's parameters, in order; empty for a method that takes none. */
  params?: unknown[];
}

/** The id of the last request built: each gets its own. */
let lastRequestId = 0;

/**
 * A request as a whole JSON-RPC 2.0 call: an id of its own, the version, and `params` even when
 * the method takes none. Coinbase Wallet's extension, asked `{ method }` alone, opens its "Your
 * wallet is ready" page instead of its connect prompt, so every request the wallets send is built
 * here.
 *
 * @param method - The method to call: one of `RPC_METHOD`, or any other the wallet supports.
 * @param params - The method's parameters, in order.
 * @returns What the provider's `request` takes.
 * @example
 * const accounts = await provider.request<WalletAddress[]>(rpcRequest(RPC_METHOD.REQUEST_ACCOUNTS));
 */
export const rpcRequest = (method: string, params: unknown[] = []): RequestArguments => {
  lastRequestId += 1;
  return { id: lastRequestId, jsonrpc: JSON_RPC_VERSION, method, params };
};

/**
 * The provider a wallet injects into the page (EIP-1193): `request` to call it, `on` and
 * `removeListener` for its events, the flags wallets set on it, and the `providerMap` Coinbase
 * Wallet adds when it shares the page with other wallets.
 */
export interface EthereumProvider {
  /**
   * Sends a JSON-RPC request; resolves with the result, typed `T` by the caller, or rejects with a
   * `ProviderRpcError` (the user refused, the chain is unknown, ...).
   */
  request<T = unknown>(args: RequestArguments): Promise<T>;
  /** Subscribes `listener` to `event`. */
  on(event: PROVIDER_EVENT, listener: ProviderListener): void;
  /** Unsubscribes a listener `on` subscribed. */
  removeListener(event: PROVIDER_EVENT, listener: ProviderListener): void;
  /**
   * Set by MetaMask, and by most other wallets to pass for it, Coinbase Wallet included: on its
   * own it does not prove MetaMask is there.
   */
  isMetaMask?: boolean;
  /** Set by Coinbase Wallet: the flag that tells it apart from MetaMask. */
  isCoinbaseWallet?: boolean;
  /**
   * Every installed wallet's own provider, by `WALLET_TYPE`: Coinbase Wallet adds it to the
   * `window.ethereum` it takes when other wallets are installed too.
   */
  providerMap?: Map<string, EthereumProvider>;
}

/** An error a provider rejects a request with: EIP-1193 gives it a numeric `code` and a message. */
export interface ProviderRpcError {
  /**
   * Why the request failed: 4001 the user rejected it (EIP-1193), 4902 the chain is unknown
   * (`PROVIDER_ERROR_CODE.UNRECOGNIZED_CHAIN`), and others.
   */
  code?: number;
  /** The wallet's own words for it: what `sendTransaction` answers as its `error`. */
  message?: string;
}
