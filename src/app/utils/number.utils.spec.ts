import { formatNumberWithTruncation, toFiniteNumber } from './number.utils';

describe('number utils', () => {
  it('converts only finite numbers and numeric strings', () => {
    expect(toFiniteNumber(12.5)).toBe(12.5);
    expect(toFiniteNumber(' 7 ')).toBe(7);
    expect(toFiniteNumber('')).toBeNull();
    expect(toFiniteNumber('abc')).toBeNull();
    expect(toFiniteNumber(NaN)).toBeNull();
    expect(toFiniteNumber(Infinity)).toBeNull();
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber({})).toBeNull();
  });

  it('reads MongoDB extended JSON numbers', () => {
    expect(toFiniteNumber({ $numberInt: '12' })).toBe(12);
    expect(toFiniteNumber({ $numberDouble: '10.5' })).toBe(10.5);
    expect(toFiniteNumber({ $numberLong: '700' })).toBe(700);
    expect(toFiniteNumber({ $numberDouble: 'NaN' })).toBeNull();
    expect(toFiniteNumber({ $oid: '12' })).toBeNull();
  });

  it('truncates instead of rounding', () => {
    expect(formatNumberWithTruncation(1.999, 2)).toBe('1.99');
    expect(formatNumberWithTruncation(1250.5, 2)).toBe('1250.50');
    expect(formatNumberWithTruncation(3.7, 0)).toBe('3');
  });
});
