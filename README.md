# @dakaio/evm-wallets

Tells which browser wallet is **really** installed (MetaMask, Coinbase Wallet, or both), then connects, switches networks, reads balances and sends transfers through it.

- **Exact detection**, even when Coinbase Wallet hides MetaMask inside its own provider.
- **Each wallet talks to its own provider**, so a MetaMask user's request never lands in Coinbase Wallet.
- **Amounts exact to the wei**, balances in coins, the app's metadata in the transaction's data.
- **Typed**, no framework, one dependency (`decimal.js`), safe to import during server rendering.

## The problem: `window.ethereum` lies

Every wallet extension puts its provider on the same `window.ethereum`, and with more than one installed it stops being what it says:

- **Coinbase Wallet** takes `window.ethereum` for itself, sets `isMetaMask: true` on it to pass for MetaMask, and keeps MetaMask's real provider inside `window.ethereum.providerMap`.
- **MetaMask** sets `isMetaMask`, and so do most other wallets.

Checking `window.ethereum.isMetaMask` therefore says "MetaMask" when only Coinbase Wallet is there, and calling `window.ethereum` sends a MetaMask user's request to Coinbase Wallet. This package looks in `providerMap` first and at `isCoinbaseWallet` second, so the "installed" answer is exact and each wallet talks to its own provider:

| Installed | `window.ethereum` is | `MetaMaskWallet` | `CoinbaseWallet` |
|---|---|---|---|
| nothing, or no browser | missing | not installed | not installed |
| MetaMask | MetaMask's provider | installed, talks to it | not installed, no provider |
| Coinbase Wallet | Coinbase's, `isMetaMask` too | not installed, no provider | installed, talks to it |
| both | Coinbase's, with `providerMap` | installed, `providerMap` → MetaMask | installed, `providerMap` → Coinbase |
| another wallet alone | that wallet's | installed, talks to it (see [Other wallets](#other-wallets)) | not installed, no provider |

A wallet talks only to its own provider: one that is not installed has none, so whatever it is asked fails with `NO_PROVIDER` and never reaches the wallet that took `window.ethereum`. Each row is a spec: `src/wallets.spec.ts` loads the package on every one of these pages.

## Install

```sh
pnpm add @dakaio/evm-wallets
```

Or `npm install @dakaio/evm-wallets`, or `yarn add @dakaio/evm-wallets`. The package ships CommonJS with type declarations, for any bundler, and runs in any ES2020 browser.

## Quick start

Find MetaMask, connect, follow account changes, switch to Ethereum, read the balance and pay a deposit:

```ts
import {
  CHAIN_ID,
  INSTALLED_WALLETS,
  PROVIDER_EVENT,
  WALLET_MAP,
  WALLET_TYPE,
  type WalletAddress,
} from '@dakaio/evm-wallets';

import { offerInstall, showAccount, showBalance, showError } from './wallet-ui'; // the app's own UI

/** The coins the app takes, named the way its back end names them. */
const CRYPTO_TOKEN = { ETH: 'ETH' } as const;

/** A deposit the app's back end opened: where the coins go, how many ether, and its id. */
type Deposit = { address: WalletAddress; amount: string; id: string };

/** Pays a deposit with MetaMask, on Ethereum. */
export async function payWithMetaMask(deposit: Deposit): Promise<void> {
  // Detect: worked out once, when the package loaded. MetaMask itself, even behind Coinbase.
  const wallet = WALLET_MAP.get(WALLET_TYPE.METAMASK);
  if (!wallet || !INSTALLED_WALLETS[WALLET_TYPE.METAMASK]) {
    offerInstall(WALLET_TYPE.METAMASK);
    return;
  }

  // Connect: MetaMask asks the user and answers the accounts allowed, the one in use first.
  const [address] = await wallet.connect();

  // Follow the user to another account, on MetaMask's own provider (not window.ethereum).
  wallet.getProvider()?.on(PROVIDER_EVENT.ACCOUNTS_CHANGED, ([account]: WalletAddress[]) => {
    showAccount(account);
  });

  // Switch to the deposit's chain: MetaMask is asked to add a chain it does not know yet.
  await wallet.switchNetwork(CHAIN_ID.ETHEREUM);

  // Read the balance, in ether.
  showBalance(await wallet.getBalance(address)); // '0.4210'

  // Pay: the amount goes in wei, exactly; the metadata travels in the transaction's data.
  const result = await wallet.sendTransaction({
    fromAddress: address,
    toAddress: deposit.address,
    amount: deposit.amount,
    token: CRYPTO_TOKEN.ETH,
    chainId: CHAIN_ID.ETHEREUM,
    metadata: { depositId: deposit.id },
  });
  if (!result.success) {
    showError(result.error);
  }
}
```

`connect()` and `switchNetwork()` throw when the user refuses (see [Errors](#errors)); `getBalance()` and `sendTransaction()` never throw. `sendTransaction()` checks the wallet's chain itself too: see [Sending a transfer](#sending-a-transfer).

The examples below go on from here: `wallet` is a wallet out of `WALLET_MAP`, `address` the account `connect()` answered, and names such as `showNetwork` or `toast` are the app's own.

## Detecting wallets

`INSTALLED_WALLETS` is worked out once, when the package loads, from `window.ethereum` as the extensions left it. `WALLET_MAP` holds one wallet object per `WALLET_TYPE`, the same objects as `WALLET_SET`:

```ts
import {
  INSTALLED_WALLETS,
  type MetaMaskWallet,
  WALLET_MAP,
  WALLET_SET,
  WALLET_TYPE,
} from '@dakaio/evm-wallets';

INSTALLED_WALLETS; // { MetaMask: true, CoinbaseWallet: true }

// The installed wallets, for a "Connect a wallet" list.
const offered = [...WALLET_MAP].filter(([, wallet]) => wallet.isAvailable()).map(([type]) => type);
// ['MetaMask', 'CoinbaseWallet']

// Whether any wallet is there at all.
const anyWallet = [...WALLET_SET].some((wallet) => wallet.isAvailable()); // true

// Where a wallet was found. With Coinbase Wallet on the page, MetaMask sits in its providerMap.
const metaMask = WALLET_MAP.get(WALLET_TYPE.METAMASK) as MetaMaskWallet;
metaMask.isWalletInProvider(); // true
metaMask.getProvider(); // MetaMask's own provider: every call and event goes there
metaMask.getLibrary(); // window.ethereum: Coinbase Wallet's, on this page
```

`isAvailable()` answers the same as `INSTALLED_WALLETS`. A wallet that is not installed has no provider (`getProvider()` answers `undefined`): `connect()`, `switchNetwork()` and `sendTransaction()` fail with `NO_PROVIDER`, `isConnected()` answers `false` and `getBalance()` `NO_BALANCE`, and nothing reaches another wallet.

## Connecting

`connect()` asks the user (`eth_requestAccounts`: the wallet shows its prompt); `isConnected()` asks without a prompt (`eth_accounts`), to bring a connection back after a reload:

```ts
import { WALLET_MAP, type WALLET_TYPE, type WalletAddress } from '@dakaio/evm-wallets';

/** Where the app remembers the wallet the user picked, across reloads. */
const STORAGE_KEY = { WALLET: 'wallet' } as const;

/** Connects the wallet the user picked: it shows its prompt. Throws when the user refuses. */
export async function connectWallet(type: WALLET_TYPE): Promise<WalletAddress> {
  const [address] = await WALLET_MAP.get(type)!.connect();
  localStorage.setItem(STORAGE_KEY.WALLET, type);
  return address;
}

/** After a reload: the account the page is still connected to, asked without a prompt. */
export async function restoreWallet(): Promise<WalletAddress | undefined> {
  const type = localStorage.getItem(STORAGE_KEY.WALLET) as WALLET_TYPE | null;
  const wallet = type ? WALLET_MAP.get(type) : undefined;
  if (!wallet?.isAvailable()) {
    return undefined;
  }
  const connected = await wallet.isConnected(); // eth_accounts: never prompts, never throws
  if (!connected) {
    return undefined;
  }
  const [address] = await wallet.connect(); // no prompt: the page is connected already
  return address;
}

/** Forgets the wallet. Wallets have no call to disconnect a page: the user does it in the wallet. */
export async function forgetWallet(type: WALLET_TYPE): Promise<void> {
  await WALLET_MAP.get(type)?.disconnect(); // resolves, and asks the wallet nothing
  localStorage.removeItem(STORAGE_KEY.WALLET);
}
```

## Networks

`switchNetwork(chainId)` asks the wallet to move to a chain (EIP-3326). A wallet that does not know the chain answers with `PROVIDER_ERROR_CODE.UNRECOGNIZED_CHAIN`, and then:

- **MetaMask** is asked to add it (EIP-3085) from `ADD_NETWORK_PARAMS`, if the app offers the chain (`configureWallets({ networks })`); MetaMask then offers to switch to it. Refused or impossible: `WALLET_ERROR.NETWORK_NOT_ADDED`.
- **Coinbase Wallet**, and a plain `EthereumWallet`, throw `WALLET_ERROR.NETWORK_NOT_IN_WALLET`: the user adds the chain by hand.

```ts
import { CHAIN_ID, EthereumWallet, PROVIDER_EVENT } from '@dakaio/evm-wallets';

// MetaMask is asked to add Polygon if it does not know it; Coinbase Wallet throws instead.
await wallet.switchNetwork(CHAIN_ID.POLYGON);

// Follow the chain the wallet is on: wallets report its id as hex.
wallet.getProvider()?.on(PROVIDER_EVENT.CHAIN_CHANGED, (chainIdHex: string) => {
  const chainId = EthereumWallet.normalizeChainId(chainIdHex); // 137
  showNetwork(EthereumWallet.getSupportedNetworks()[chainId]); // undefined on a chain not offered
});

// Links to an address on the chain's block explorer.
EthereumWallet.getExplorerUrl(address, CHAIN_ID.POLYGON); // 'https://polygonscan.com/address/0x…'
EthereumWallet.getExplorerName(CHAIN_ID.POLYGON); // 'PolygonScan'
```

The built-in chains:

| `CHAIN_ID` | Chain id | Name | Explorer | Exchange label (`protocol`) | MetaMask is asked to add it |
|---|---|---|---|---|---|
| `ETHEREUM` | 1 | Ethereum Mainnet | Etherscan | ERC20 | no: every wallet has it |
| `BSC` | 56 | BSC Mainnet | BSCScan | BEP20 | yes, as BNB Smart Chain |
| `POLYGON` | 137 | Polygon Mainnet | PolygonScan | MATIC | yes |
| `AVALANCHE` | 43114 | Avalanche C-Chain | Snowtrace | C-Chain | yes |

**Behaviour.** `normalizeChainId` keeps a number as it is, reads text with `0x` as hex (the way wallets report chain ids, EIP-695) and text of decimal digits alone as decimal, so Polygon's id reads as 137 either way; any other text throws a `WalletError` with `INVALID_CHAIN_ID`. `getExplorerUrl` and `getExplorerName` read a chain id the same way but never throw: a chain id that is not one, or a chain without an explorer, gets Ethereum's.

## Balances

`getBalance(address)` reads the account's balance in the native coin of the chain the wallet is on (ether, BNB, POL or AVAX), exactly, and answers it in coins to four places:

```ts
import { NO_BALANCE } from '@dakaio/evm-wallets';

const balance = await wallet.getBalance(address); // '1.2346': ether, four places, rounded half up
if (balance === NO_BALANCE) {
  showBalanceUnavailable(); // not read: no provider, or the wallet failed (a real zero is '0.0000')
}
```

## Sending a transfer

`sendTransaction` sends the chain's native coin from a connected account; the wallet asks the user to confirm it. It asks the wallet its chain first (`eth_chainId`): on any other chain than the transfer's, nothing is sent and the answer's `code` is `WALLET_ERROR.WRONG_NETWORK`, and the app switches the wallet and sends again:

```ts
import {
  CHAIN_ID,
  type SendTransactionParams,
  WALLET_ERROR,
  type WalletAddress,
} from '@dakaio/evm-wallets';

/** The coins the app takes, named the way its back end names them. */
const CRYPTO_TOKEN = { ETH: 'ETH', BNB: 'BNB' } as const;

/** A deposit the app's back end opened: where the coins go, how many, and its id. */
type Deposit = { address: WalletAddress; amount: string; id: string };

/** Pays a deposit in BNB, on BNB Smart Chain; answers the transaction's hash. */
export async function payInBnb(deposit: Deposit): Promise<string> {
  const transfer: SendTransactionParams = {
    fromAddress: address,
    toAddress: deposit.address,
    amount: deposit.amount, // BNB, as a decimal string
    token: CRYPTO_TOKEN.BNB,
    chainId: CHAIN_ID.BSC,
    metadata: { depositId: deposit.id },
  };
  let result = await wallet.sendTransaction(transfer);
  // The wallet is on another chain, so nothing was sent: switch it, and send again.
  if (result.code === WALLET_ERROR.WRONG_NETWORK) {
    await wallet.switchNetwork(transfer.chainId);
    result = await wallet.sendTransaction(transfer);
  }
  // { txHash: '0x…', success: true }
  // { txHash: '', success: false, error: 'User denied transaction signature.' }
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.txHash;
}
```

| Field | What it is |
|---|---|
| `fromAddress` | The account the coins leave from: one the user connected. |
| `toAddress` | The account they go to. A plain account: data sent to a contract would call it. |
| `amount` | How many coins, as a decimal string. Sent in wei, exactly: 18 decimals assumed, digits past the 18th rounded half up to the nearest wei. |
| `token` | The coin's symbol, as the app names it. Written into the data for the receiving side; it picks no token contract. |
| `chainId` | The chain the transfer is for. **Checked first**: on another chain the wallet is not asked to send, and the answer's `code` is `WRONG_NETWORK`. Also sent in the transaction as hex, so the wallet itself refuses it if the user switches networks between the check and the send. |
| `metadata` | Optional. Written into the transaction's `data` as JSON, with `token` added. Public on chain, and every byte costs gas. |

The answer is `{ txHash, success: true }`, or `{ txHash: '', success: false, error, code? }`. `error` is the wallet's own message (the user rejected it) or the package's; `code` is there only when the package refused the transfer itself: `NO_PROVIDER`, `WRONG_NETWORK`, or `INVALID_CHAIN_ID` when the wallet answers a chain id that is not one. It never throws: a failure is logged and answered.

The receiving side reads the metadata back from the transaction's input data:

```ts
import { HEX_PREFIX } from '@dakaio/evm-wallets';

/** How a transfer's input data is written: its bytes in hex, the bytes UTF-8 text. */
const ENCODING = { DATA: 'hex', TEXT: 'utf8' } as const;

/** What a transfer is for: the JSON in its input data. */
const readMetadata = (input: string): unknown =>
  JSON.parse(Buffer.from(input.slice(HEX_PREFIX.length), ENCODING.DATA).toString(ENCODING.TEXT));

readMetadata(transaction.input); // { depositId: 'A-12', token: 'BNB' }
```

## Events

The wallet's provider emits EIP-1193 events. Listen on `getProvider()`, the wallet's own provider: with Coinbase Wallet on the page, `window.ethereum` is Coinbase's.

| `PROVIDER_EVENT` | Event | The listener gets |
|---|---|---|
| `ACCOUNTS_CHANGED` | `accountsChanged` | The accounts, the one in use first; an empty list when the user disconnected the page. |
| `CHAIN_CHANGED` | `chainChanged` | The new chain's id, as hex. |
| `DISCONNECT` | `disconnect` | The provider's error: it lost its connection to every chain. |

`Web3Listeners` types the three together, to subscribe and unsubscribe in one loop:

```ts
import { PROVIDER_EVENT, type Web3Listeners } from '@dakaio/evm-wallets';

const provider = wallet.getProvider(); // the wallet's own provider, not window.ethereum
const listeners: Web3Listeners = [
  { title: PROVIDER_EVENT.ACCOUNTS_CHANGED, function: onAccountsChanged },
  { title: PROVIDER_EVENT.CHAIN_CHANGED, function: onChainChanged },
  { title: PROVIDER_EVENT.DISCONNECT, function: onDisconnect },
];
listeners.forEach(({ title, function: listener }) => provider?.on(title, listener));

// When the page no longer needs them:
listeners.forEach(({ title, function: listener }) => provider?.removeListener(title, listener));
```

## Settings

`configureWallets` sets the app's own networks, explorers and logger, once at start-up. Each setting given replaces that setting as a whole; the others keep theirs.

```ts
import { CHAIN_ID, configureWallets } from '@dakaio/evm-wallets';

import { trackError } from './error-tracker'; // the app's own

/** How the app names its networks. */
const NETWORK_NAME = { ETHEREUM: 'Ethereum', POLYGON: 'Polygon' } as const;

/** The app's own network icons. */
const NETWORK_ICON = {
  ETHEREUM: '/images/networks/eth.svg',
  POLYGON: '/images/networks/pol.svg',
} as const;

configureWallets({
  // Only these two: getSupportedNetworks() answers them, and MetaMask is asked to add no other.
  networks: {
    [CHAIN_ID.ETHEREUM]: { name: NETWORK_NAME.ETHEREUM, icon: NETWORK_ICON.ETHEREUM },
    [CHAIN_ID.POLYGON]: { name: NETWORK_NAME.POLYGON, icon: NETWORK_ICON.POLYGON },
  },
  // Failures to the app's tracker; sent transfers not logged.
  logger: { log() {}, error: trackError },
});
```

| Setting | Type | Default | What it does |
|---|---|---|---|
| `networks` | `Record<number, NetworkConfig>` | Every chain in `CHAIN_MAP`, named as there, with an empty `icon` | The networks the app offers, by chain id: what `getSupportedNetworks()` answers, and the only ones MetaMask is asked to add. |
| `chains` | `Map<number, ChainConfig>` | `CHAIN_MAP` | Names and explorers by chain id, for `getExplorerUrl` and `getExplorerName`. Keep `CHAIN_ID.ETHEREUM` in it: a chain the map lacks gets Ethereum's explorer. |
| `logger` | `WalletLogger` | `console` | Where the wallets log: failures through `error`, sent transfers through `log`, each line starting with a `WALLET_LOG` text. |

A chain of the app's own, such as a test network, goes into `chains` next to the built-in ones:

```ts
import { CHAIN_MAP, type ChainConfig, configureWallets } from '@dakaio/evm-wallets';

/** Sepolia, the Ethereum test network the app's staging build runs on. */
const SEPOLIA = {
  CHAIN_ID: 11155111,
  CHAIN: {
    name: 'Sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
    explorerName: 'Sepolia Etherscan',
    protocol: 'ERC20',
  },
} as const;

// CHAIN_MAP's chains kept, Ethereum among them: the explorer for a chain the map lacks.
configureWallets({
  chains: new Map<number, ChainConfig>([...CHAIN_MAP, [SEPOLIA.CHAIN_ID, SEPOLIA.CHAIN]]),
});
```

## Constants

Every protocol value and unit is exported under a name, so an app never writes one by hand either.

| Constant | Value | Unit, meaning |
|---|---|---|
| `NATIVE_DECIMALS` | `18` | Decimals of a native coin: 1 ether is 10^18 wei, and BNB, POL and AVAX count the same way. |
| `DECIMAL_BASE` | `10` | Amounts count in powers of ten: 10^decimals smallest units make one coin. |
| `TRANSFER_GAS_LIMIT` | `500000` | Gas units a transfer may use: 21 000 for the transfer, the rest for the bytes of its data. |
| `BALANCE_FRACTION_DIGITS` | `4` | Digits after the point in a balance `getBalance` answers. |
| `WEI_FRACTION_DIGITS` | `0` | Digits after the point in an amount in wei: none. |
| `NO_BALANCE` | `'0'` | What `getBalance` answers when it could not read the balance; a real zero is `'0.0000'`. |
| `HEX_PREFIX` | `'0x'` | The prefix of JSON-RPC hex. |
| `PROVIDER_ERROR_CODE.UNRECOGNIZED_CHAIN` | `4902` | EIP-3326: the wallet does not know the chain. |
| `CHAIN_ID` | `1`, `56`, `137`, `43114` | EIP-155 chain ids: `ETHEREUM`, `BSC`, `POLYGON`, `AVALANCHE`. |

| Names | Values |
|---|---|
| `RPC_METHOD` | `ACCOUNTS`: `eth_accounts`, `REQUEST_ACCOUNTS`: `eth_requestAccounts`, `GET_BALANCE`: `eth_getBalance`, `CHAIN_ID`: `eth_chainId`, `SEND_TRANSACTION`: `eth_sendTransaction`, `SWITCH_CHAIN`: `wallet_switchEthereumChain`, `ADD_CHAIN`: `wallet_addEthereumChain` |
| `BLOCK_TAG` | `LATEST`: `latest` |
| `PROVIDER_EVENT` | `ACCOUNTS_CHANGED`: `accountsChanged`, `CHAIN_CHANGED`: `chainChanged`, `DISCONNECT`: `disconnect` |
| `EXPLORER_PATH` | `ADDRESS`: `address` |
| `WALLET_TYPE` | `METAMASK`: `MetaMask`, `COINBASE`: `CoinbaseWallet`, the wallets' keys in `providerMap` |
| `WALLET_LOG` | `BALANCE_FAILED`, `CONNECTION_CHECK_FAILED`, `CONNECT_FAILED`, `TRANSACTION_SENT`, `TRANSACTION_FAILED`: the first text of each log line |

Each `as const` object is also the type of its values: `WALLET_TYPE` is `'MetaMask' | 'CoinbaseWallet'`.

The hex helpers speak JSON-RPC's encoding:

```ts
import {
  BLOCK_TAG,
  CHAIN_ID,
  fromHex,
  RPC_METHOD,
  rpcRequest,
  textToHex,
  toHex,
  weiFromHex,
} from '@dakaio/evm-wallets';

toHex(CHAIN_ID.POLYGON); // '0x89'
fromHex(chainIdHex); // 137, from a chainChanged payload
textToHex(JSON.stringify(metadata)); // '0x7b22…': UTF-8 bytes, as a transaction's data

const balanceHex = await provider.request<string>(
  rpcRequest(RPC_METHOD.GET_BALANCE, [address, BLOCK_TAG.LATEST]),
);
weiFromHex(balanceHex); // 1234567000000000000n: exact, past 2^53
```

## Errors

A call that fails for a reason the package knows throws a `WalletError`: its `code` says which, and its message, from `WALLET_ERROR_MESSAGE`, is ready to show. An error of the wallet's own (the user refused the prompt, EIP-1193 code 4001) is logged and thrown on as the wallet threw it.

| `WALLET_ERROR` | Thrown by | When |
|---|---|---|
| `NO_PROVIDER` | `connect`, `switchNetwork`; the `code` of a failed `sendTransaction` | There is no provider for the wallet: it is not installed, or there is no browser. |
| `NETWORK_NOT_IN_WALLET` | `switchNetwork` (Coinbase Wallet, `EthereumWallet`) | The wallet does not know the chain; the user adds it by hand. |
| `NETWORK_NOT_ADDED` | `switchNetwork` (MetaMask) | MetaMask did not know the chain and did not add it: the user refused, the request failed, or the app does not offer the chain or has no `ADD_NETWORK_PARAMS` for it. |
| `NETWORK_NOT_SUPPORTED` | nothing the app calls | Inside MetaMask's add step: the app does not offer the chain. Reaches the app as `NETWORK_NOT_ADDED`. |
| `NETWORK_PARAMS_MISSING` | nothing the app calls | Inside MetaMask's add step: no `ADD_NETWORK_PARAMS` for the chain. Reaches the app as `NETWORK_NOT_ADDED`. |
| `INVALID_CHAIN_ID` | `normalizeChainId`; the `code` of a failed `sendTransaction` | A chain id given as text that is neither `0x` hex nor decimal digits, from the app or from the wallet. The explorer helpers never throw it: they fall back to Ethereum's explorer. |
| `WRONG_NETWORK` | never thrown: the `code` of a failed `sendTransaction` | The wallet is on another chain than the transfer's, so nothing was sent. Switch the wallet (`switchNetwork`) and send again. |
| `TRANSACTION_FAILED` | never thrown | Its message is the `error` of a failed transfer that had no message of its own. |

The other calls never throw: `isConnected()` answers `false`, `getBalance()` answers `NO_BALANCE`, and `sendTransaction()` answers `{ success: false, error, code? }`, each after logging the failure.

```ts
import { CHAIN_ID, WALLET_ERROR, WalletError } from '@dakaio/evm-wallets';

try {
  await wallet.switchNetwork(CHAIN_ID.BSC);
} catch (error) {
  if (!(error instanceof WalletError)) {
    throw error; // the wallet's own: the user refused to switch
  }
  if (error.code === WALLET_ERROR.NETWORK_NOT_IN_WALLET) {
    showAddNetworkHelp(CHAIN_ID.BSC); // Coinbase Wallet: the user adds the network by hand
  } else {
    toast(error.message); // 'Failed to add network to your wallet. Please add it manually.'
  }
}
```

`WALLET_ERROR_MESSAGE` is in English; an app in another language picks its own text by `error.code`.

## How it works, and caveats

- **`window.ethereum` is read once**, when the package is first imported, and `INSTALLED_WALLETS` is worked out then. Extensions put their providers on the page before its scripts run, so a bundle sees them; a wallet installed later shows up after a reload.
- **Outside a browser** (server rendering, Node, tests) importing is safe: there is no `window`, so every wallet is "not installed", `connect()` and `switchNetwork()` throw `NO_PROVIDER`, `isConnected()` answers `false`, `getBalance()` `NO_BALANCE` and `sendTransaction()` a failure.
- **"MetaMask" means "not Coinbase Wallet".** Without `providerMap`, any provider on `window.ethereum` that does not say `isCoinbaseWallet` counts as MetaMask: Brave Wallet, Rabby and others pass for it. An app tells them apart with a class of its own: see [Other wallets](#other-wallets).
- **A wallet talks only to its own provider.** One that is not installed has none: its calls fail with `NO_PROVIDER` instead of reaching the wallet that took `window.ethereum`.
- **Native coins only, 18 decimals.** `sendTransaction` sends the chain's own coin (ether, BNB, POL, AVAX), never a token contract's; `token` is a label in the data. Amounts and balances are converted in decimal arithmetic that keeps every digit (78, a uint256's worth), and an app's own `Decimal.set(...)` changes nothing in it.
- **A transfer goes out on its own chain, or not at all.** `sendTransaction` asks the wallet its chain first and sends nothing on another one (`WRONG_NETWORK`); `chainId` also goes into the transaction as hex, so the wallet refuses it if the user switches in between.
- **Gas.** Every transfer asks for `TRANSFER_GAS_LIMIT` (500 000) gas: 21 000 for the transfer, the rest for its data. Only the gas used is paid, but the account needs enough to cover the whole limit at the current gas price before the wallet sends.
- **Metadata is public.** It is written into the transaction's `data` as UTF-8 JSON in hex: anyone can read it on chain, so nothing private goes there. Send to a plain account: data sent to a contract is a call to it.
- **Logging.** The wallets log failures (`error`) and every sent transfer with its hash and metadata (`log`) to the console, each line starting with a `WALLET_LOG` text. Pass the app's own logger, or a quiet one, to `configureWallets`.
- **Explorers fall back to Ethereum's.** Keep `CHAIN_ID.ETHEREUM` in a `chains` map of the app's own: without it, a link for a chain the map lacks has no explorer to fall back to, and throws.
- **A chain id as text is `0x` hex or decimal digits.** `normalizeChainId` reads both and throws `INVALID_CHAIN_ID` for anything else; the explorer helpers fall back to Ethereum's explorer instead of throwing.

## Using it in React

A hook that keeps the account in use: it subscribes to `PROVIDER_EVENT.ACCOUNTS_CHANGED` on the wallet's own provider, and unsubscribes when the component goes away or the wallet changes.

```ts
import { useEffect, useState } from 'react';

import {
  PROVIDER_EVENT,
  RPC_METHOD,
  rpcRequest,
  WALLET_MAP,
  type WALLET_TYPE,
  type WalletAddress,
} from '@dakaio/evm-wallets';

/** The account the user has picked in the wallet, kept current as they switch; null for none. */
export const useWalletAccount = (type: WALLET_TYPE): WalletAddress | null => {
  const [account, setAccount] = useState<WalletAddress | null>(null);

  useEffect(() => {
    const provider = WALLET_MAP.get(type)?.getProvider(); // none when the wallet is not installed
    if (!provider) {
      return;
    }

    // The account in use comes first; an empty list means the user disconnected the page.
    let subscribed = true;
    const onAccountsChanged = ([first]: WalletAddress[]) => {
      if (subscribed) {
        setAccount(first ?? null);
      }
    };

    // The account the page is connected to now, asked without a prompt; then every change.
    provider
      .request<WalletAddress[]>(rpcRequest(RPC_METHOD.ACCOUNTS))
      .then(onAccountsChanged, () => onAccountsChanged([]));
    provider.on(PROVIDER_EVENT.ACCOUNTS_CHANGED, onAccountsChanged);

    return () => {
      subscribed = false;
      provider.removeListener(PROVIDER_EVENT.ACCOUNTS_CHANGED, onAccountsChanged);
    };
  }, [type]);

  return account;
};
```

In a component: `const account = useWalletAccount(WALLET_TYPE.METAMASK);`.

## Other wallets

By design the package tells two wallets apart, MetaMask and Coinbase Wallet, and any other wallet on `window.ethereum` (Brave Wallet, Rabby and the like, most of which say `isMetaMask` too) counts as MetaMask: `MetaMaskWallet` is installed, and talks to it.

To tell another wallet apart, the app adds a class of its own and overrides what differs: the new wallet answers `isAvailable()` and `getProvider()` from the flag it sets on its provider, and a `MetaMaskWallet` of the app's own answers `isAvailable()` so that the new wallet no longer counts as MetaMask (its `getProvider()` follows, as it answers only when the wallet is installed). Both go into the app's own map, under the app's own names, next to `WALLET_MAP`'s:

```ts
import {
  type AbstractWallet,
  type EthereumProvider,
  EthereumWallet,
  MetaMaskWallet,
  WALLET_MAP,
  WALLET_TYPE,
} from '@dakaio/evm-wallets';

/** The provider Brave's built-in wallet injects: it says `isMetaMask` too, and `isBraveWallet`. */
type BraveProvider = EthereumProvider & { isBraveWallet?: boolean };

/** Whether the provider on the page is Brave Wallet's. */
const isBrave = (provider: BraveProvider | undefined): boolean => !!provider?.isBraveWallet;

/** Brave Wallet: installed when window.ethereum is Brave's, and only then with a provider. */
export class BraveWallet extends EthereumWallet {
  public isAvailable(): boolean {
    return super.isAvailable() && isBrave(this.getLibrary());
  }

  public getProvider(): EthereumProvider | undefined {
    return this.isAvailable() ? this.getLibrary() : undefined;
  }
}

/** MetaMask, and no longer Brave Wallet passing for it: no provider on Brave's page either. */
export class MetaMaskOnlyWallet extends MetaMaskWallet {
  public isAvailable(): boolean {
    return super.isAvailable() && !isBrave(this.getLibrary());
  }
}

/** The wallets the app offers: the package's two, and Brave. */
export const APP_WALLET = { ...WALLET_TYPE, BRAVE: 'BraveWallet' } as const;
export type APP_WALLET = (typeof APP_WALLET)[keyof typeof APP_WALLET];

/** Every wallet the app offers, by its type: WALLET_MAP's, with MetaMask told apart from Brave. */
export const APP_WALLETS = new Map<APP_WALLET, AbstractWallet>([
  ...WALLET_MAP,
  [APP_WALLET.METAMASK, new MetaMaskOnlyWallet()],
  [APP_WALLET.BRAVE, new BraveWallet()],
]);
```

The app then uses `APP_WALLETS` where it would use `WALLET_MAP`. A wallet that can add a chain the EIP-3085 way also overrides the protected `handleNetworkNotFound(chainId)`, the way `MetaMaskWallet` does; one that can sit in Coinbase Wallet's `providerMap` looks for itself there, the way `MetaMaskWallet` and `CoinbaseWallet` do.

## API reference

Everything below is exported from `@dakaio/evm-wallets`; the doc comments in its type declarations say the rest.

### Wallets

| Export | Kind | What it is |
|---|---|---|
| `WALLET_MAP` | `Map<WALLET_TYPE, AbstractWallet>` | Every wallet the package knows, by type: the way to the one a user picked. |
| `WALLET_SET` | `Set<AbstractWallet>` | The same wallet objects, as a set. |
| `INSTALLED_WALLETS` | `InstalledWalletList` | Which wallets are installed, by type, worked out when the package loaded. |
| `WALLET_TYPE` | `as const` object and type | `METAMASK`, `COINBASE`: the wallets' names, their keys in `providerMap`. |
| `AbstractWallet` | abstract class | What every wallet answers: `isAvailable()`, `getProvider()`, `getLibrary()`, `isConnected()`, `connect()`, `disconnect()`, `switchNetwork(chainId)`, `getBalance(address)`, `sendTransaction(params)`, `getSupportedNetworks()`. |
| `EthereumWallet` | class | A wallet behind any EIP-1193 `window.ethereum`. Static: `normalizeChainId(chainId)`, `getExplorerUrl(address, chainId)`, `getExplorerName(chainId)`, `getSupportedNetworks()`. Protected: `handleNetworkNotFound(chainId)`. |
| `MetaMaskWallet` | class | MetaMask, out of `providerMap` or on its own, and no provider when it is not installed; adds a chain it does not know. Also `isWalletInProvider()`. |
| `CoinbaseWallet` | class | Coinbase Wallet, out of `providerMap` or on its own, and no provider when it is not installed. Also `isWalletInProvider()`. |

### Networks and settings

| Export | Kind | What it is |
|---|---|---|
| `CHAIN_ID` | `as const` object and type | The built-in chains' EIP-155 ids. |
| `CHAIN_MAP` | `Map<number, ChainConfig>` | Their names, explorers and exchange labels. |
| `ADD_NETWORK_PARAMS` | `Record<number, AddNetworkParams>` | What MetaMask is asked to add each chain with: all but Ethereum. |
| `EXPLORER_PATH` | `as const` object and type | Explorer pages: `ADDRESS`. |
| `configureWallets(changes)` | function | Sets the app's `networks`, `chains` and `logger`. |
| `WALLET_LOG` | `as const` object and type | The first text of each log line. |

### Errors

| Export | Kind | What it is |
|---|---|---|
| `WalletError` | class | A failed call: its `code`, and a message ready to show. |
| `WALLET_ERROR` | `as const` object and type | The codes. |
| `WALLET_ERROR_MESSAGE` | `Record<WALLET_ERROR, string>` | Each code's message, in English. |

### Protocol, units and helpers

| Export | Kind | What it is |
|---|---|---|
| `RPC_METHOD` | `as const` object and type | JSON-RPC method names. |
| `BLOCK_TAG` | `as const` object and type | Block tags: `LATEST`. |
| `PROVIDER_EVENT` | `as const` object and type | EIP-1193 event names. |
| `PROVIDER_ERROR_CODE` | `as const` object and type | The provider error codes the wallets act on: `UNRECOGNIZED_CHAIN`. |
| `NATIVE_DECIMALS`, `DECIMAL_BASE`, `TRANSFER_GAS_LIMIT`, `BALANCE_FRACTION_DIGITS`, `WEI_FRACTION_DIGITS` | number | The units: see [Constants](#constants). |
| `NO_BALANCE`, `HEX_PREFIX` | string | `getBalance`'s answer for a balance not read; JSON-RPC's hex prefix. |
| `toHex(value)` | function | A number or a `bigint` as a JSON-RPC quantity. |
| `fromHex(hex)` | function | A hex quantity as a number: a chain id. |
| `weiFromHex(hex)` | function | A hex quantity of wei as an exact `bigint`. |
| `textToHex(text)` | function | A text as its UTF-8 bytes in hex. |

### Types

| Export | What it is |
|---|---|
| `WalletAddress` | An account's address, as the wallet reports it. |
| `ConnectedWallet` | `{ address, type }`: the wallet the user connected, as an app keeps it. |
| `InstalledWalletList` | The shape of `INSTALLED_WALLETS`: a boolean per `WALLET_TYPE`. |
| `Web3Listeners` | The three provider events, each with its listener. |
| `SendTransactionParams` | What `sendTransaction` takes. |
| `TransactionResult` | `{ txHash, success, error?, code? }`: what it answers. |
| `NetworkConfig` | `{ name, icon }`: a network as the app shows it. |
| `ChainConfig` | `{ name, explorerUrl, explorerName, protocol }`: a `CHAIN_MAP` entry. |
| `AddNetworkParams` | EIP-3085's `wallet_addEthereumChain` parameters, without the chain id. |
| `WalletSettings` | `{ networks, chains, logger }`: what `configureWallets` sets. |
| `WalletLogger` | `{ log, error }`: the console's own signature. |
| `EthereumProvider` | An EIP-1193 provider, with `isMetaMask`, `isCoinbaseWallet` and `providerMap`. |
| `RequestArguments` | `{ method, params? }`: a request to it. |
| `ProviderListener` | A listener for its events. |
| `ProviderRpcError` | `{ code?, message? }`: what it rejects a request with. |

## License

MIT
