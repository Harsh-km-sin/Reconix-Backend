/**
 * Utility functions for financial calculations to avoid floating point precision issues.
 * Rule: Never use === for currency. Use amountsMatch with tolerance.
 */

/**
 * Checks if two amounts match within a 1-cent tolerance.
 */
export const amountsMatch = (a: number, b: number, tolerance = 0.01): boolean => {
  return Math.abs(a - b) < tolerance;
};

/**
 * Rounds a number to exactly 2 decimal places.
 */
export const roundCurrency = (n: number): number => {
  return Math.round(n * 100) / 100;
};

/**
 * Formats a number to a standard currency string (2.dp).
 */
export const formatAmount = (n: number): string => {
  return roundCurrency(n).toFixed(2);
};

/**
 * Sums an array of amounts safely by converting to cents (integers) first.
 */
export const sumAmounts = (amounts: number[]): number => {
  const cents = amounts.reduce((sum, a) => sum + Math.round(a * 100), 0);
  return cents / 100;
};
