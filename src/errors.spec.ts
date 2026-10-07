import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WALLET_ERROR, WALLET_ERROR_MESSAGE, WalletError } from './errors.ts';

describe('WALLET_ERROR', () => {
  it('names each code by its own key, so a code reads the same in a log', () => {
    for (const [key, code] of Object.entries(WALLET_ERROR)) {
      assert.equal(code, key);
    }
  });
});

describe('WALLET_ERROR_MESSAGE', () => {
  it('says each error in English, ready to show', () => {
    assert.deepEqual(WALLET_ERROR_MESSAGE, {
      [WALLET_ERROR.NO_PROVIDER]: 'No provider found',
      [WALLET_ERROR.NETWORK_NOT_IN_WALLET]:
        'This network is not available in your wallet. Please add it manually.',
      [WALLET_ERROR.NETWORK_NOT_ADDED]:
        'Failed to add network to your wallet. Please add it manually.',
      [WALLET_ERROR.NETWORK_NOT_SUPPORTED]: 'Network configuration not found',
      [WALLET_ERROR.NETWORK_PARAMS_MISSING]: 'Network parameters not found',
      [WALLET_ERROR.INVALID_CHAIN_ID]: 'Invalid chain ID',
      [WALLET_ERROR.WRONG_NETWORK]:
        'Your wallet is on another network. Switch to the network of this transfer and try again.',
      [WALLET_ERROR.TRANSACTION_FAILED]: 'Failed to send transaction',
    });
  });
});

describe('WalletError', () => {
  for (const code of Object.values(WALLET_ERROR)) {
    it(`${code}: an Error with its code, its name and its message`, () => {
      const error = new WalletError(code);
      assert.ok(error instanceof Error);
      assert.ok(error instanceof WalletError);
      assert.equal(error.name, 'WalletError');
      assert.equal(error.code, code);
      assert.equal(error.message, WALLET_ERROR_MESSAGE[code]);
      assert.ok(error.stack);
    });
  }
});
