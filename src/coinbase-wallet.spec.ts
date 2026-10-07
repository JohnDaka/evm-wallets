import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { CHAIN_ID } from './blockchain-networks.ts';
import { CoinbaseWallet } from './coinbase-wallet.ts';
import { WALLET_ERROR, WALLET_ERROR_MESSAGE } from './errors.ts';
import { NO_BALANCE, PROVIDER_ERROR_CODE, RPC_METHOD } from './ethereum.ts';
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

/** What a wallet rejects a switch to a chain it does not know with. */
const UNKNOWN_CHAIN = rpcError(PROVIDER_ERROR_CODE.UNRECOGNIZED_CHAIN, 'Unrecognized chain ID.');

describe('CoinbaseWallet', () => {
  beforeEach(() => {
    resetSettings();
  });
  afterEach(leavePage);

  describe('outside a browser', () => {
    it('is not installed, and has no provider', () => {
      const wallet = new CoinbaseWallet();
      assert.equal(wallet.isAvailable(), false);
      assert.equal(wallet.isWalletInProvider(), false);
      assert.equal(wallet.getProvider(), undefined);
      assert.equal(wallet.getLibrary(), undefined);
    });
  });

  describe('its provider', () => {
    it('is window.ethereum when Coinbase Wallet is alone', () => {
      const coinbase = putOnPage(coinbaseProvider());
      const wallet = new CoinbaseWallet();
      assert.equal(wallet.isWalletInProvider(), false);
      assert.equal(wallet.getProvider(), coinbase);
    });

    it('is its own one out of providerMap when it shares the page', () => {
      const coinbase = coinbaseProvider();
      const onWindow = putOnPage(coinbaseTakesWindow(metaMaskProvider(), coinbase));
      const wallet = new CoinbaseWallet();
      assert.equal(wallet.isWalletInProvider(), true);
      assert.equal(wallet.getProvider(), coinbase);
      assert.equal(wallet.getLibrary(), onWindow);
    });

    it('is none when Coinbase Wallet is not installed: nothing reaches MetaMask on window.ethereum', async () => {
      const metaMask = putOnPage(
        metaMaskProvider({
          [RPC_METHOD.REQUEST_ACCOUNTS]: [ADDRESS.USER],
          [RPC_METHOD.ACCOUNTS]: [ADDRESS.USER],
        }),
      );
      const wallet = new CoinbaseWallet();
      assert.equal(wallet.isAvailable(), false);
      assert.equal(wallet.getProvider(), undefined);
      assert.equal(wallet.getLibrary(), metaMask);

      await assert.rejects(wallet.connect(), walletErrorWith(WALLET_ERROR.NO_PROVIDER));
      await assert.rejects(
        wallet.switchNetwork(CHAIN_ID.BSC),
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
      assert.deepEqual(metaMask.requests, []);
    });
  });

  describe('switchNetwork', () => {
    it('asks Coinbase Wallet to switch, through its own provider', async () => {
      const coinbase = coinbaseProvider();
      const onWindow = putOnPage(coinbaseTakesWindow(metaMaskProvider(), coinbase));
      await new CoinbaseWallet().switchNetwork(CHAIN_ID.BSC);
      assert.deepEqual(coinbase.requests, [
        { method: RPC_METHOD.SWITCH_CHAIN, params: [{ chainId: '0x38' }] },
      ]);
      assert.deepEqual(onWindow.requests, []);
    });

    it('throws NETWORK_NOT_IN_WALLET for a chain it does not know, leaving the user to add it', async () => {
      const coinbase = putOnPage(coinbaseProvider({ [RPC_METHOD.SWITCH_CHAIN]: UNKNOWN_CHAIN }));
      await assert.rejects(
        new CoinbaseWallet().switchNetwork(CHAIN_ID.BSC),
        walletErrorWith(WALLET_ERROR.NETWORK_NOT_IN_WALLET),
      );
      assert.deepEqual(coinbase.methods, [RPC_METHOD.SWITCH_CHAIN]);
    });

    it("throws the wallet's own error when the user refuses to switch", async () => {
      const refusal = rpcError(USER_REJECTED, 'User rejected the request.');
      putOnPage(coinbaseProvider({ [RPC_METHOD.SWITCH_CHAIN]: refusal }));
      await assert.rejects(
        new CoinbaseWallet().switchNetwork(CHAIN_ID.BSC),
        (error) => error === refusal,
      );
    });
  });
});
