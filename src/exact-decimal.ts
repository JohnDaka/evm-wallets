import Decimal from 'decimal.js';

/**
 * Decimal digits of the largest uint256, 2^256 - 1 (about 1.16 * 10^77). Balances and transfer
 * values are uint256 on chain, so no amount in wei is longer than this.
 */
const UINT256_DIGITS = 78;

/**
 * Decimal.js that keeps every digit an amount in wei can have, for converting between coins and
 * wei. Out of the box Decimal.js rounds every result to 20 significant digits:
 * 1234.567891234567891234 ether is 22 digits in wei, and would be sent 34 wei short. A clone with
 * the default settings and this precision, so an app's own `Decimal.set(...)` never changes the
 * package's amounts, and the package never changes the app's.
 */
export const ExactDecimal = Decimal.clone({ defaults: true, precision: UINT256_DIGITS });
