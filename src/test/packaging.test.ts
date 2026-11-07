import { describe, expect, it } from 'vitest';
import { convertPackagingQuantity, formatQuantity, packagingBadge, packagingLabel, productUnit, toQuantity } from '../lib/packaging';

describe('packaging helpers', () => {
  it('converts numeric strings returned by the database', () => {
    expect(toQuantity('100')).toBe(100);
    expect(toQuantity('100.000')).toBe(100);
    expect(toQuantity('10.500')).toBe(10.5);
    expect(toQuantity('10,5')).toBe(10.5);
    expect(toQuantity(0.125)).toBe(0.125);
    expect(toQuantity('')).toBe(0);
    expect(toQuantity('abc')).toBe(0);
    expect(toQuantity(null)).toBe(0);
    expect(toQuantity(undefined)).toBe(0);
  });

  it('formats quantities without trailing zeros and with a comma', () => {
    expect(formatQuantity(10)).toBe('10');
    expect(formatQuantity(10.5)).toBe('10,5');
    expect(formatQuantity(0.125)).toBe('0,125');
    expect(formatQuantity(30.0004)).toBe('30');
  });

  it('formats quantities that arrive as text from the database', () => {
    expect(formatQuantity('100')).toBe('100');
    expect(formatQuantity('100.000')).toBe('100');
    expect(formatQuantity('10.500')).toBe('10,5');
    expect(formatQuantity('abc')).toBe('0');
  });

  it('uses the package type to label the count field', () => {
    expect(packagingLabel('CX')).toEqual({ singular: 'caixa', plural: 'caixas' });
    expect(packagingLabel('FD')).toEqual({ singular: 'fardo', plural: 'fardos' });
    expect(packagingLabel('SC')).toEqual({ singular: 'saco', plural: 'sacos' });
    expect(packagingLabel('KG')).toEqual({ singular: 'embalagem', plural: 'embalagens' });
  });

  it('keeps the inventory unit based on the product type', () => {
    expect(productUnit('KG')).toBe('kg');
    expect(productUnit('kg')).toBe('kg');
    expect(productUnit('UN')).toBe('un');
    expect(productUnit(null)).toBe('un');
  });

  it('builds the short package badge', () => {
    expect(packagingBadge('CX', 10)).toBe('CX ×10');
    expect(packagingBadge('FD', 10.5)).toBe('FD ×10,5');
  });

  it('converts the counted packages into units of the base product', () => {
    expect(convertPackagingQuantity(2, 15)).toBe(30);
    expect(convertPackagingQuantity(1, 15)).toBe(15);
    expect(convertPackagingQuantity(3, 6)).toBe(18);
  });

  it('keeps the quantity as is when there is no package', () => {
    expect(convertPackagingQuantity(4, null)).toBe(4);
    expect(convertPackagingQuantity(4, undefined)).toBe(4);
    expect(convertPackagingQuantity(4, 0)).toBe(4);
  });

  it('rounds the total because the validade stores whole units', () => {
    expect(convertPackagingQuantity(1, 12.5)).toBe(13);
    expect(convertPackagingQuantity(3, 2.4)).toBe(7);
  });

  it('never returns a negative or broken total', () => {
    expect(convertPackagingQuantity(0, 15)).toBe(0);
    expect(convertPackagingQuantity(-2, 15)).toBe(-30);
    expect(convertPackagingQuantity(2, Number.NaN)).toBe(2);
  });
});
