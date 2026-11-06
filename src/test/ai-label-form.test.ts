import { describe, expect, it } from 'vitest';
import { labelToForm } from '@/lib/ai-label';

describe('Preenchimento do formulário pela leitura da etiqueta', () => {
  it('preenche os campos com o produto do catálogo', () => {
    const fill = labelToForm(
      { ean: '789', validade: '2027-03-12', quantidade: 6, tipo: 'UN' },
      { ean: '111', codigo: '631612', descricao: 'BANANA NANICA', tipo: 'KG' },
    );
    expect(fill).toEqual({
      ean: '111',
      codigo: '631612',
      descricao: 'BANANA NANICA',
      tipo: 'KG',
      validade: '2027-03-12',
      quantidade: '6',
    });
  });

  it('usa a leitura da IA quando o catálogo não devolve nada', () => {
    const fill = labelToForm(
      { ean: '789', codigo: '999', descricao: 'BANANA', validade: '2027-03-12', quantidade: 2, tipo: 'KG' },
      null,
    );
    expect(fill?.codigo).toBe('999');
    expect(fill?.descricao).toBe('BANANA');
  });

  it('devolve null quando não há código para consultar', () => {
    expect(labelToForm({ ean: '789' }, null)).toBeNull();
    expect(labelToForm(null, null)).toBeNull();
  });

  it('deixa vazio o que não foi lido com segurança', () => {
    const fill = labelToForm({ codigo: '1', validade: null, quantidade: null }, null);
    expect(fill?.validade).toBe('');
    expect(fill?.quantidade).toBe('');
  });
});
