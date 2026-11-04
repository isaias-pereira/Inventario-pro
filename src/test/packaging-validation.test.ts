import { describe, expect, it } from 'vitest';
import { packagingInput, packagingType } from '../../api/_lib/packaging-validation';

const base = { eanFechado: '7891234567890', tipo: 'CX', quantidadeFechada: '10' };

describe('Packaging rules', () => {
  it('accepts CX, FD and SC in any case', () => {
    expect(packagingType('cx')).toBe('CX');
    expect(packagingType('Fd')).toBe('FD');
    expect(packagingType(' sc ')).toBe('SC');
  });

  it('rejects product types and unknown packaging types', () => {
    expect(packagingType('KG')).toBeNull();
    expect(packagingType('UN')).toBeNull();
    expect(packagingType('CX1')).toBeNull();
  });

  it('accepts integer and decimal quantities, including comma', () => {
    expect(packagingInput(base)?.quantidadeFechada).toBe(10);
    expect(packagingInput({ ...base, quantidadeFechada: '10,5' })?.quantidadeFechada).toBe(10.5);
    expect(packagingInput({ ...base, quantidadeFechada: 0.125 })?.quantidadeFechada).toBe(0.125);
  });

  it('rounds the quantity to three decimals', () => {
    expect(packagingInput({ ...base, quantidadeFechada: '2,3456' })?.quantidadeFechada).toBe(2.346);
  });

  it('rejects zero, negative, non-numeric and out-of-range quantities', () => {
    expect(packagingInput({ ...base, quantidadeFechada: '0' })).toBeNull();
    expect(packagingInput({ ...base, quantidadeFechada: '-1' })).toBeNull();
    expect(packagingInput({ ...base, quantidadeFechada: 'abc' })).toBeNull();
    expect(packagingInput({ ...base, quantidadeFechada: '1000000000' })).toBeNull();
  });

  it('normalizes leading zeros in the closed EAN and rejects invalid EANs', () => {
    expect(packagingInput({ ...base, eanFechado: '000123' })?.eanFechado).toBe('123');
    expect(packagingInput({ ...base, eanFechado: 'CX123' })).toBeNull();
    expect(packagingInput({ ...base, eanFechado: '123-456' })).toBeNull();
  });

  it('normalizes the optional description and rejects more than 60 characters', () => {
    expect(packagingInput({ ...base, descricao: ' caixa 12un ' })?.descricao).toBe('CAIXA 12UN');
    expect(packagingInput({ ...base, descricao: 'x'.repeat(61) })).toBeNull();
  });
});
