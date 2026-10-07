import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { WALLET_ERROR, WalletError } from './errors.ts';
import { BLOCK_TAG, NO_BALANCE, RPC_METHOD, toHex } from './ethereum.ts';
import { EthereumWallet } from './ethereum-wallet.ts';
import { MetaMaskWallet } from './metamask-wallet.ts';
import { WALLET_LOG } from './settings.ts';
import {
  ADDRESS,
  INTERNAL_ERROR,
  metaMaskProvider,
  type RecordingLogger,
  resetSettings,
  rpcError,
} from './testing/fakes.ts';
import { leavePage, putOnPage } from './testing/on-page.ts';

/** One ether in wei. */
const ETHER = 10n ** 18n;

/** MetaMask alone on the page, answering `eth_getBalance` with `balance`. */
const metaMaskWithBalance = (balance: unknown) => {
  const provider = putOnPage(metaMaskProvider({ [RPC_METHOD.GET_BALANCE]: balance }));
  return { provider, wallet: new MetaMaskWallet() };
};

/** The balance a wallet answers when its provider answers `balance`. */
const balanceOf = (balance: unknown): Promise<string> =>
  metaMaskWithBalance(balance).wallet.getBalance(ADDRESS.USER);

describe('AbstractWallet.getBalance', () => {
  let logger: RecordingLogger;
  beforeEach(() => {
    logger = resetSettings();
  });
  afterEach(leavePage);

  it('asks for the latest balance and answers it in coins, to four places', async () => {
    const { provider, wallet } = metaMaskWithBalance(toHex(1_234_567n * 10n ** 12n));
    assert.equal(await wallet.getBalance(ADDRESS.USER), '1.2346');
    assert.deepEqual(provider.requests, [
      { method: RPC_METHOD.GET_BALANCE, params: [ADDRESS.USER, BLOCK_TAG.LATEST] },
    ]);
    assert.deepEqual(logger.errors, []);
  });

  it('rounds half up at the fourth place', async () => {
    assert.equal(await balanceOf(toHex(123_455n * 10n ** 13n)), '1.2346');
    assert.equal(await balanceOf(toHex(123_454n * 10n ** 13n)), '1.2345');
  });

  it('reads a zero balance as 0.0000, never as NO_BALANCE', async () => {
    assert.equal(await balanceOf(toHex(0)), '0.0000');
    assert.notEqual(await balanceOf(toHex(0)), NO_BALANCE);
  });

  it('reads a long balance to the wei before rounding it', async () => {
    // 21 digits in wei: first rounded to the 20 Decimal.js keeps by default, it would be 123.4565.
    assert.equal(await balanceOf(toHex(123_456_449_999_999_999_999n)), '123.4564');
    assert.equal(await balanceOf(toHex(10n ** 12n * ETHER)), '1000000000000.0000');
  });

  it('answers NO_BALANCE and logs the error when the wallet fails', async () => {
    const failure = rpcError(INTERNAL_ERROR, 'Internal JSON-RPC error.');
    assert.equal(await balanceOf(failure), NO_BALANCE);
    assert.deepEqual(logger.errors, [[WALLET_LOG.BALANCE_FAILED, failure]]);
  });

  it('answers NO_BALANCE when the wallet answers no number', async () => {
    assert.equal(await balanceOf(undefined), NO_BALANCE);
    assert.equal(await balanceOf('a lot'), NO_BALANCE);
  });

  it('answers NO_BALANCE without a provider, and logs NO_PROVIDER', async () => {
    assert.equal(await new EthereumWallet().getBalance(ADDRESS.USER), NO_BALANCE);
    const [[text, error]] = logger.errors;
    assert.equal(text, WALLET_LOG.BALANCE_FAILED);
    assert.ok(error instanceof WalletError);
    assert.equal(error.code, WALLET_ERROR.NO_PROVIDER);
  });
});
