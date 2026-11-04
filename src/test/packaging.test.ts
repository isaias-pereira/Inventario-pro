import { describe, expect, it } from 'vitest';
import { formatQuantity, packagingBadge, packagingLabel, productUnit } from '../lib/packaging';

describe('packaging helpers', () => {
  it('formats quantities without trailing zeros and with a comma', () => {
    expect(formatQuantity(10)).toBe('10');
    expect(formatQuantity(10.5)).toBe('10,5');
    expect(formatQuantity(0.125)).toBe('0,125');
    expect(formatQuantity(30.0004)).toBe('30');
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
});
