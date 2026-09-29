import { calculateTotalPrice } from './domain';

describe('calculateTotalPrice', () => {
  it('calculates an integer price in satoshis', () => {
    expect(calculateTotalPrice(3, 2_500)).toBe(7_500);
  });

  it.each([
    [0, 10],
    [-1, 10],
    [1.5, 10],
    [1, 0],
    [1, 0.5],
  ])('rejects invalid quantity or price (%s, %s)', (quantity, price) => {
    expect(() => calculateTotalPrice(quantity, price)).toThrow();
  });

  it('rejects totals outside the safe integer range', () => {
    expect(() => calculateTotalPrice(Number.MAX_SAFE_INTEGER, 2)).toThrow();
  });
});

