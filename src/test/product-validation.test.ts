import { describe, expect, it } from 'vitest';
import { identifier, productInput, canManageProducts } from '../../supabase/functions/query-product/validation';

const input = { codigo: '631612', ean: '210', eans: ['210', '123123123'], descricao: 'banana nanica kg 300044334', tipo: 'kg' };

describe('Product rules', () => {
  it('accepts numeric EAN and code but rejects letters and punctuation', () => {
    expect(identifier('123123123')).toBe('123123123');
    expect(identifier('631612')).toBe('631612');
    expect(identifier('EAN123')).toBeNull();
    expect(identifier('631-612')).toBeNull();
  });
  it('normalizes description to uppercase', () => {
    expect(productInput(input, true)?.descricao).toBe('BANANA NANICA KG 300044334');
  });
  it('allows free-text type', () => {
    expect(productInput({ ...input, tipo: 'a granel' }, true)?.tipo).toBe('a granel');
  });
  it('accepts changing all product fields and multiple EANs', () => {
    const edited = productInput({ ...input, codigo: '631613', ean: '123123123', descricao: 'banana prata', tipo: 'un' }, true);
    expect(edited).toEqual({ codigo: '631613', ean: '123123123', eans: ['210', '123123123'], descricao: 'BANANA PRATA', tipo: 'un' });
  });
  it('rejects duplicate EANs including numerically identical zero prefixes', () => {
    expect(productInput({ ...input, eans: ['210', '0210'] }, true)).toBeNull();
  });
  it('requires primary EAN in linked EAN list', () => {
    expect(productInput({ ...input, eans: ['123123123'] }, true)).toBeNull();
  });
  it('limits fields to actual Neon column lengths', () => {
    expect(productInput({ ...input, tipo: 'x'.repeat(11) })).toBeNull();
    expect(productInput({ ...input, descricao: 'x'.repeat(101) })).toBeNull();
  });
  it('only admins can create or edit products', () => {
    expect(canManageProducts('admin')).toBe(true);
    expect(canManageProducts('user')).toBe(false);
    expect(canManageProducts(undefined)).toBe(false);
  });
});