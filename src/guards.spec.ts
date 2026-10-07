import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CHAIN_ID } from './blockchain-networks.ts';
import { isNumber, TYPE_OF } from './guards.ts';

describe('TYPE_OF', () => {
  it('names what typeof answers', () => {
    assert.equal(typeof CHAIN_ID.POLYGON, TYPE_OF.NUMBER);
    assert.equal(typeof undefined, TYPE_OF.UNDEFINED);
  });
});

describe('isNumber', () => {
  it('is true for any number, NaN included', () => {
    for (const value of [0, CHAIN_ID.POLYGON, -1.5, Number.NaN]) {
      assert.equal(isNumber(value), true, String(value));
    }
  });

  it('is false for a chain id as text, a bigint, and nothing', () => {
    for (const value of ['137', '0x89', 137n, undefined, null]) {
      assert.equal(isNumber(value), false, String(value));
    }
  });
});
