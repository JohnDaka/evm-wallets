import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CoinbaseWallet } from './coinbase-wallet.ts';
import { WALLET_ERROR } from './errors.ts';
import { MetaMaskWallet } from './metamask-wallet.ts';
import { PROVIDER } from './testing/fakes.ts';
import { openPage, PAGE, type PageReport, type WalletReport } from './testing/pages.ts';
import { WALLET_TYPE } from './types.ts';
import { INSTALLED_WALLETS, WALLET_MAP, WALLET_SET } from './wallets.ts';

/** A wallet with nothing to talk to: there is no `window.ethereum`. */
const NOTHING: WalletReport = {
  available: false,
  inProviderMap: false,
  provider: null,
  library: null,
  connectedThrough: WALLET_ERROR.NO_PROVIDER,
};

/** Installed, and talking to `window.ethereum`, which is `provider`. */
const installedOnWindow = (provider: string): WalletReport => ({
  available: true,
  inProviderMap: false,
  provider,
  library: provider,
  connectedThrough: provider,
});

/**
 * Not installed while another wallet, `onWindow`, is on `window.ethereum`: no provider of its own,
 * so `connect()` fails with `NO_PROVIDER` and never reaches the other wallet.
 */
const absentBeside = (onWindow: string): WalletReport => ({
  available: false,
  inProviderMap: false,
  provider: null,
  library: onWindow,
  connectedThrough: WALLET_ERROR.NO_PROVIDER,
});

/** Installed: its own `provider` found in the `providerMap` of Coinbase's `window.ethereum`. */
const inProviderMap = (provider: string): WalletReport => ({
  available: true,
  inProviderMap: true,
  provider,
  library: PROVIDER.COINBASE_ON_WINDOW,
  connectedThrough: provider,
});

/**
 * The report a page should give, from what MetaMask, Coinbase Wallet and a plain `EthereumWallet`
 * should each see on it. `INSTALLED_WALLETS` is every wallet's `isAvailable()`, asked on load.
 */
const expected = (
  metaMask: WalletReport,
  coinbase: WalletReport,
  ethereum: WalletReport,
): PageReport => ({
  installed: {
    [WALLET_TYPE.METAMASK]: metaMask.available,
    [WALLET_TYPE.COINBASE]: coinbase.available,
  },
  wallets: { [WALLET_TYPE.METAMASK]: metaMask, [WALLET_TYPE.COINBASE]: coinbase },
  ethereum: {
    available: ethereum.available,
    provider: ethereum.provider,
    library: ethereum.library,
    connectedThrough: ethereum.connectedThrough,
  },
  setMatchesMap: true,
});

describe('WALLET_MAP and WALLET_SET', () => {
  it('hold one MetaMaskWallet and one CoinbaseWallet, the same objects in both', () => {
    assert.deepEqual([...WALLET_MAP.keys()], [WALLET_TYPE.METAMASK, WALLET_TYPE.COINBASE]);
    assert.ok(WALLET_MAP.get(WALLET_TYPE.METAMASK) instanceof MetaMaskWallet);
    assert.ok(WALLET_MAP.get(WALLET_TYPE.COINBASE) instanceof CoinbaseWallet);
    assert.deepEqual([...WALLET_SET], [...WALLET_MAP.values()]);
  });
});

describe('INSTALLED_WALLETS', () => {
  it('lists every wallet, none installed outside a browser', () => {
    assert.deepEqual(INSTALLED_WALLETS, {
      [WALLET_TYPE.METAMASK]: false,
      [WALLET_TYPE.COINBASE]: false,
    });
  });
});

describe('which wallet is really installed', () => {
  it('none on a server: there is no window at all', () => {
    assert.deepEqual(openPage(PAGE.SERVER), expected(NOTHING, NOTHING, NOTHING));
  });

  it('none in a browser without a wallet: window.ethereum is not there', () => {
    assert.deepEqual(openPage(PAGE.NO_WALLET), expected(NOTHING, NOTHING, NOTHING));
  });

  it('MetaMask alone: window.ethereum is MetaMask', () => {
    assert.deepEqual(
      openPage(PAGE.METAMASK),
      expected(
        installedOnWindow(PROVIDER.METAMASK),
        absentBeside(PROVIDER.METAMASK),
        installedOnWindow(PROVIDER.METAMASK),
      ),
    );
  });

  it('Coinbase Wallet alone: it says isMetaMask too, and is still not taken for MetaMask', () => {
    assert.deepEqual(
      openPage(PAGE.COINBASE),
      expected(
        absentBeside(PROVIDER.COINBASE),
        installedOnWindow(PROVIDER.COINBASE),
        installedOnWindow(PROVIDER.COINBASE),
      ),
    );
  });

  it('both: Coinbase Wallet takes window.ethereum and hides MetaMask in providerMap, yet each wallet talks to its own', () => {
    assert.deepEqual(
      openPage(PAGE.BOTH),
      expected(
        inProviderMap(PROVIDER.METAMASK),
        inProviderMap(PROVIDER.COINBASE),
        // Without the package, an app would talk to Coinbase Wallet's window.ethereum.
        installedOnWindow(PROVIDER.COINBASE_ON_WINDOW),
      ),
    );
  });

  it('another wallet alone counts as MetaMask: whatever is not Coinbase Wallet does', () => {
    assert.deepEqual(
      openPage(PAGE.OTHER),
      expected(
        installedOnWindow(PROVIDER.OTHER),
        absentBeside(PROVIDER.OTHER),
        installedOnWindow(PROVIDER.OTHER),
      ),
    );
  });

  it('on every page, a wallet that is not installed has no provider: connect() gives NO_PROVIDER', () => {
    for (const page of Object.values(PAGE)) {
      for (const [type, wallet] of Object.entries(openPage(page).wallets)) {
        const where = `${type} on ${page}`;
        if (wallet.available) {
          assert.notEqual(wallet.provider, null, where);
          assert.equal(wallet.connectedThrough, wallet.provider, where);
        } else {
          assert.equal(wallet.provider, null, where);
          assert.equal(wallet.connectedThrough, WALLET_ERROR.NO_PROVIDER, where);
        }
      }
    }
  });
});
