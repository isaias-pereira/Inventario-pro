import { describe, expect, it } from 'vitest';
import { identifier, productInput, canManageProducts, categoriaInput } from '../../api/_lib/product-validation';

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
    expect(edited).toEqual({
      codigo: '631613',
      ean: '123123123',
      eans: ['210', '123123123'],
      descricao: 'BANANA PRATA',
      tipo: 'un',
      categoriaCodigo: null,
      categoriaInformada: false,
    });
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

  describe('seção (categoria)', () => {
    it('treats an absent section as "not informed"', () => {
      expect(categoriaInput(undefined)).toEqual({ codigo: null, informada: false });
      expect(categoriaInput(null)).toEqual({ codigo: null, informada: false });
    });

    it('treats an empty section as an explicit "sem seção"', () => {
      expect(categoriaInput('')).toEqual({ codigo: null, informada: true });
      expect(categoriaInput('   ')).toEqual({ codigo: null, informada: true });
    });

    it('accepts the category code and rejects junk', () => {
      expect(categoriaInput('4')).toEqual({ codigo: '4', informada: true });
      expect(categoriaInput(19)).toEqual({ codigo: '19', informada: true });
      expect(categoriaInput('hortifruti')).toBeNull();
      expect(categoriaInput({})).toBeNull();
    });

    it('carries the section into the product payload', () => {
      const edited = productInput({ ...input, categoriaCodigo: '8' }, true);
      expect(edited?.categoriaCodigo).toBe('8');
      expect(edited?.categoriaInformada).toBe(true);
    });

    it('rejects the payload when the section is invalid', () => {
      expect(productInput({ ...input, categoriaCodigo: 'x' }, true)).toBeNull();
    });
  });
});