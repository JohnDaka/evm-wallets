import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import Decimal from 'decimal.js';

import { DECIMAL_BASE, NATIVE_DECIMALS } from './ethereum.ts';
import { ExactDecimal } from './exact-decimal.ts';

/** 1234.567891234567891234 ether: 22 digits in wei, past the 20 Decimal.js keeps by default. */
const LONG_AMOUNT = '1234.567891234567891234';
const LONG_AMOUNT_WEI = '1234567891234567891234';

/** Coins to wei, the way `sendTransaction` converts them, with the given Decimal. */
const toWei = (D: Decimal.Constructor, amount: string): string =>
  new D(amount).mul(new D(DECIMAL_BASE).pow(NATIVE_DECIMALS)).toFixed(0);

describe('ExactDecimal', () => {
  it('keeps every digit of an amount in wei, where the default Decimal rounds', () => {
    assert.equal(toWei(ExactDecimal, LONG_AMOUNT), LONG_AMOUNT_WEI);
    assert.equal(toWei(Decimal, LONG_AMOUNT), '1234567891234567891200');
  });

  it("is not changed by the app's own Decimal settings", () => {
    Decimal.set({ precision: 5, rounding: Decimal.ROUND_DOWN });
    try {
      assert.equal(toWei(ExactDecimal, LONG_AMOUNT), LONG_AMOUNT_WEI);
      assert.equal(new ExactDecimal('1.23455').toFixed(4), '1.2346');
    } finally {
      Decimal.set({ defaults: true });
    }
  });
});
