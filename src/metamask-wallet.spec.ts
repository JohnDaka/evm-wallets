import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ADD_NETWORK_PARAMS, CHAIN_ID, CHAIN_MAP } from './blockchain-networks.ts';
import { WALLET_ERROR, WALLET_ERROR_MESSAGE } from './errors.ts';
import { NO_BALANCE, PROVIDER_ERROR_CODE, PROVIDER_EVENT, RPC_METHOD, toHex } from './ethereum.ts';
import { MetaMaskWallet } from './metamask-wallet.ts';
import { configureWallets } from './settings.ts';
import {
  ADDRESS,
  coinbaseProvider,
  coinbaseTakesWindow,
  DEPOSIT,
  metaMaskProvider,
  resetSettings,
  rpcError,
  USER_REJECTED,
  walletErrorWith,
} from './testing/fakes.ts';
import { leavePage, putOnPage } from './testing/on-page.ts';
import type { WalletAddress } from './types.ts';

/** What a wallet rejects a switch to a chain it does not know with. */
const UNKNOWN_CHAIN = rpcError(PROVIDER_ERROR_CODE.UNRECOGNIZED_CHAIN, 'Unrecognized chain ID.');

/** The chains MetaMask can be asked to add: every one but Ethereum. */
const ADDABLE_CHAINS = [CHAIN_ID.BSC, CHAIN_ID.POLYGON, CHAIN_ID.AVALANCHE];

/** The requests MetaMask gets when asked to switch to a chain it then has to add. */
const switchThenAdd = (chainId: number) => [
  { method: RPC_METHOD.SWITCH_CHAIN, params: [{ chainId: toHex(chainId) }] },
  {
    method: RPC_METHOD.ADD_CHAIN,
    params: [{ chainId: toHex(chainId), ...ADD_NETWORK_PARAMS[chainId] }],
  },
];

describe('MetaMaskWallet', () => {
  beforeEach(() => {
    resetSettings();
  });
  afterEach(leavePage);

  describe('outside a browser', () => {
    it('is not installed, and has no provider', () => {
      const wallet = new MetaMaskWallet();
      assert.equal(wallet.isAvailable(), false);
      assert.equal(wallet.isWalletInProvider(), false);
      assert.equal(wallet.getProvider(), undefined);
      assert.equal(wallet.getLibrary(), undefined);
    });
  });

  describe('its provider', () => {
    it('is window.ethereum when MetaMask is alone', () => {
      const metaMask = putOnPage(metaMaskProvider());
      const wallet = new MetaMaskWallet();
      assert.equal(wallet.isWalletInProvider(), false);
      assert.equal(wallet.getProvider(), metaMask);
    });

    it('is its own one out of providerMap when Coinbase Wallet takes window.ethereum', () => {
      const metaMask = metaMaskProvider();
      const onWindow = putOnPage(coinbaseTakesWindow(metaMask, coinbaseProvider()));
      const wallet = new MetaMaskWallet();
      assert.equal(wallet.isWalletInProvider(), true);
      assert.equal(wallet.getProvider(), metaMask);
      assert.equal(wallet.getLibrary(), onWindow);
    });

    it("carries MetaMask's own events: a listener there hears MetaMask, not Coinbase Wallet", () => {
      const metaMask = metaMaskProvider();
      const onWindow = putOnPage(coinbaseTakesWindow(metaMask, coinbaseProvider()));
      const provider = new MetaMaskWallet().getProvider()!;
      const heard: WalletAddress[][] = [];
      const onAccountsChanged = (accounts: WalletAddress[]) => heard.push(accounts);

      provider.on(PROVIDER_EVENT.ACCOUNTS_CHANGED, onAccountsChanged);
      onWindow.emit(PROVIDER_EVENT.ACCOUNTS_CHANGED, [ADDRESS.OTHER]);
      metaMask.emit(PROVIDER_EVENT.ACCOUNTS_CHANGED, [ADDRESS.USER]);
      provider.removeListener(PROVIDER_EVENT.ACCOUNTS_CHANGED, onAccountsChanged);
      metaMask.emit(PROVIDER_EVENT.ACCOUNTS_CHANGED, []);

      assert.deepEqual(heard, [[ADDRESS.USER]]);
    });

    it('is none when MetaMask is not installed: nothing reaches Coinbase Wallet on window.ethereum', async () => {
      const coinbase = putOnPage(
        coinbaseProvider({
          [RPC_METHOD.REQUEST_ACCOUNTS]: [ADDRESS.USER],
          [RPC_METHOD.ACCOUNTS]: [ADDRESS.USER],
        }),
      );
      const wallet = new MetaMaskWallet();
      assert.equal(wallet.isAvailable(), false);
      assert.equal(wallet.getProvider(), undefined);
      assert.equal(wallet.getLibrary(), coinbase);

      await assert.rejects(wallet.connect(), walletErrorWith(WALLET_ERROR.NO_PROVIDER));
      await assert.rejects(
        wallet.switchNetwork(CHAIN_ID.POLYGON),
        walletErrorWith(WALLET_ERROR.NO_PROVIDER),
      );
      assert.equal(await wallet.isConnected(), false);
      assert.equal(await wallet.getBalance(ADDRESS.USER), NO_BALANCE);
      assert.deepEqual(await wallet.sendTransaction(DEPOSIT), {
        txHash: '',
        success: false,
        error: WALLET_ERROR_MESSAGE[WALLET_ERROR.NO_PROVIDER],
        code: WALLET_ERROR.NO_PROVIDER,
      });
      assert.deepEqual(coinbase.requests, []);
    });
  });

  describe('switchNetwork to a chain MetaMask does not know', () => {
    for (const chainId of ADDABLE_CHAINS) {
      it(`asks MetaMask to add ${CHAIN_MAP.get(chainId)!.name}, from ADD_NETWORK_PARAMS`, async () => {
        const metaMask = putOnPage(
          metaMaskProvider({
            [RPC_METHOD.SWITCH_CHAIN]: UNKNOWN_CHAIN,
            [RPC_METHOD.ADD_CHAIN]: null,
          }),
        );
        await new MetaMaskWallet().switchNetwork(chainId);
        assert.deepEqual(metaMask.requests, switchThenAdd(chainId));
      });
    }

    it("asks through MetaMask's own provider when Coinbase Wallet shares the page", async () => {
      const metaMask = metaMaskProvider({
        [RPC_METHOD.SWITCH_CHAIN]: UNKNOWN_CHAIN,
        [RPC_METHOD.ADD_CHAIN]: null,
      });
      const coinbase = coinbaseProvider();
      const onWindow = putOnPage(coinbaseTakesWindow(metaMask, coinbase));
      await new MetaMaskWallet().switchNetwork(CHAIN_ID.POLYGON);
      assert.deepEqual(metaMask.requests, switchThenAdd(CHAIN_ID.POLYGON));
      assert.deepEqual([...onWindow.requests, ...coinbase.requests], []);
    });

    it('throws NETWORK_NOT_ADDED when the user refuses to add it', async () => {
      const metaMask = putOnPage(
        metaMaskProvider({
          [RPC_METHOD.SWITCH_CHAIN]: UNKNOWN_CHAIN,
          [RPC_METHOD.ADD_CHAIN]: rpcError(USER_REJECTED, 'User rejected the request.'),
        }),
      );
      await assert.rejects(
        new MetaMaskWallet().switchNetwork(CHAIN_ID.BSC),
        walletErrorWith(WALLET_ERROR.NETWORK_NOT_ADDED),
      );
      assert.deepEqual(metaMask.methods, [RPC_METHOD.SWITCH_CHAIN, RPC_METHOD.ADD_CHAIN]);
    });

    it('throws NETWORK_NOT_ADDED, without asking, for a network the app does not offer', async () => {
      configureWallets({ networks: { [CHAIN_ID.POLYGON]: { name: 'Polygon', icon: '' } } });
      const metaMask = putOnPage(metaMaskProvider({ [RPC_METHOD.SWITCH_CHAIN]: UNKNOWN_CHAIN }));
      await assert.rejects(
        new MetaMaskWallet().switchNetwork(CHAIN_ID.BSC),
        walletErrorWith(WALLET_ERROR.NETWORK_NOT_ADDED),
      );
      assert.deepEqual(metaMask.methods, [RPC_METHOD.SWITCH_CHAIN]);
    });

    it('throws NETWORK_NOT_ADDED, without asking, for a network with nothing to add it with', async () => {
      const metaMask = putOnPage(metaMaskProvider({ [RPC_METHOD.SWITCH_CHAIN]: UNKNOWN_CHAIN }));
      await assert.rejects(
        new MetaMaskWallet().switchNetwork(CHAIN_ID.ETHEREUM),
        walletErrorWith(WALLET_ERROR.NETWORK_NOT_ADDED),
      );
      assert.deepEqual(metaMask.methods, [RPC_METHOD.SWITCH_CHAIN]);
    });
  });

  it("throws the wallet's own error when the user refuses to switch, and adds nothing", async () => {
    const refusal = rpcError(USER_REJECTED, 'User rejected the request.');
    const metaMask = putOnPage(metaMaskProvider({ [RPC_METHOD.SWITCH_CHAIN]: refusal }));
    await assert.rejects(
      new MetaMaskWallet().switchNetwork(CHAIN_ID.POLYGON),
      (error) => error === refusal,
    );
    assert.deepEqual(metaMask.methods, [RPC_METHOD.SWITCH_CHAIN]);
  });
});
