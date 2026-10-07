/** What `typeof` answers, named for the checks below and for the package's read of `window`. */
export const TYPE_OF = {
  /** `'number'`: any number, `NaN` included. */
  NUMBER: 'number',
  /** `'undefined'`: a name that holds nothing or is not declared, as `window` outside a browser. */
  UNDEFINED: 'undefined',
} as const;

/**
 * Whether the value is a number. A type guard rather than an inline `typeof`: TypeScript
 * narrows on a guard, not on a comparison with a named constant.
 *
 * @param value - Anything.
 * @returns `true` for a number, `NaN` included; `false` for a numeric string or a `bigint`.
 */
export const isNumber = (value: unknown): value is number => typeof value === TYPE_OF.NUMBER;
