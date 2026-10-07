/**
 * Browser pages for the detection specs: what each set of wallet extensions puts on
 * `window.ethereum`, and a way to load the package on such a page and see what it found.
 *
 * The package reads `window.ethereum` once, when it loads, so each page gets a Node process of its
 * own (`pages.script.ts`): it sets `window` up, imports the package, and prints a `PageReport`.
 * Coverage counts there too: `node --test` hands its coverage directory down to every process
 * started under it.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import type { EthereumProvider } from '../ethereum.ts';
import type { InstalledWalletList, WALLET_TYPE } from '../types.ts';
import {
  coinbaseProvider,
  coinbaseTakesWindow,
  FakeProvider,
  metaMaskProvider,
  PROVIDER,
} from './fakes.ts';

/** The pages the package is loaded on. */
export const PAGE = {
  /** No `window` at all: server rendering, or Node. */
  SERVER: 'server',
  /** A browser without a wallet: `window` is there, `window.ethereum` is not. */
  NO_WALLET: 'no-wallet',
  /** MetaMask alone: `window.ethereum` is MetaMask's provider. */
  METAMASK: 'metamask',
  /** Coinbase Wallet alone: its provider says `isCoinbaseWallet`, and `isMetaMask` too. */
  COINBASE: 'coinbase',
  /**
   * Both: Coinbase Wallet takes `window.ethereum` with a provider of its own, and files each
   * wallet's provider in `providerMap`.
   */
  BOTH: 'both',
  /** Another wallet alone, neither MetaMask nor Coinbase Wallet: no flags at all. */
  OTHER: 'other',
} as const;
export type PAGE = (typeof PAGE)[keyof typeof PAGE];

/** What a page's extensions put on `window`, and every provider among it. */
export type InjectedPage = {
  /** The page's `window`; none on a server. */
  window?: { ethereum?: EthereumProvider };
  /** Every provider on the page, those in `providerMap` included. */
  providers: FakeProvider[];
};

/** Builds what the extensions of `page` inject. */
export const injectWallets = (page: PAGE): InjectedPage => {
  const metaMask = metaMaskProvider();
  const coinbase = coinbaseProvider();
  switch (page) {
    case PAGE.SERVER:
      return { providers: [] };
    case PAGE.NO_WALLET:
      return { window: {}, providers: [] };
    case PAGE.METAMASK:
      return { window: { ethereum: metaMask }, providers: [metaMask] };
    case PAGE.COINBASE:
      return { window: { ethereum: coinbase }, providers: [coinbase] };
    case PAGE.BOTH: {
      const onWindow = coinbaseTakesWindow(metaMask, coinbase);
      return { window: { ethereum: onWindow }, providers: [onWindow, metaMask, coinbase] };
    }
    case PAGE.OTHER: {
      const other = new FakeProvider(PROVIDER.OTHER);
      return { window: { ethereum: other }, providers: [other] };
    }
  }
};

/** What one wallet object answered on the page. */
export type WalletReport = {
  /** `isAvailable()`. */
  available: boolean;
  /** `isWalletInProvider()`: found in `providerMap`. */
  inProviderMap: boolean;
  /** Whose provider `getProvider()` answered; `null` for none. */
  provider: string | null;
  /** Whose provider `getLibrary()` answered, `window.ethereum`'s; `null` for none. */
  library: string | null;
  /** Whose provider `connect()` asked; the `WalletError` code instead when it threw one. */
  connectedThrough: string | null;
};

/** What the package found on a page. */
export type PageReport = {
  /** `INSTALLED_WALLETS`. */
  installed: InstalledWalletList;
  /** Each wallet in `WALLET_MAP`, by type. */
  wallets: Record<WALLET_TYPE, WalletReport>;
  /** A plain `EthereumWallet`: whatever is on `window.ethereum`, as an app without the package. */
  ethereum: Omit<WalletReport, 'inProviderMap'>;
  /** Whether `WALLET_SET` holds exactly the objects in `WALLET_MAP`. */
  setMatchesMap: boolean;
};

/** The script that loads the package on a page. Specs run from the package root (`pnpm test`). */
const PAGE_SCRIPT = resolve('src', 'testing', 'pages.script.ts');

/**
 * Loads the package on `page`, in a Node process of its own, and answers what it found.
 *
 * @throws The process's error, with what it wrote to stderr, when the script fails.
 */
export const openPage = (page: PAGE): PageReport =>
  JSON.parse(
    execFileSync(process.execPath, [PAGE_SCRIPT, page], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  ) as PageReport;
