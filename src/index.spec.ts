import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as wallets from './index.ts';

describe('the package', () => {
  it('exports exactly its public API: every value the README lists, nothing internal', () => {
    assert.deepEqual(Object.keys(wallets).sort(), [
      'ADD_NETWORK_PARAMS',
      'AbstractWallet',
      'BALANCE_FRACTION_DIGITS',
      'BLOCK_TAG',
      'CHAIN_ID',
      'CHAIN_MAP',
      'CoinbaseWallet',
      'DECIMAL_BASE',
      'EXPLORER_PATH',
      'EthereumWallet',
      'HEX_PREFIX',
      'INSTALLED_WALLETS',
      'MetaMaskWallet',
      'NATIVE_DECIMALS',
      'NO_BALANCE',
      'PROVIDER_ERROR_CODE',
      'PROVIDER_EVENT',
      'RPC_METHOD',
      'TRANSFER_GAS_LIMIT',
      'WALLET_ERROR',
      'WALLET_ERROR_MESSAGE',
      'WALLET_LOG',
      'WALLET_MAP',
      'WALLET_SET',
      'WALLET_TYPE',
      'WEI_FRACTION_DIGITS',
      'WalletError',
      'configureWallets',
      'fromHex',
      'textToHex',
      'toHex',
      'weiFromHex',
    ]);
  });

  it('loads outside a browser, every wallet not installed', () => {
    assert.ok(Object.values(wallets.INSTALLED_WALLETS).every((installed) => !installed));
  });
});
