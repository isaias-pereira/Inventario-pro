import { describe, expect, it } from 'vitest';
import { labelToProductFields } from '@/lib/ai-label';

describe('Preenchimento do cadastro de produto pela leitura da etiqueta', () => {
  it('preenche os campos com o produto do catálogo', () => {
    const fields = labelToProductFields(
      { ean: '789', validade: '2027-03-12', quantidade: 6, tipo: 'UN' },
      { ean: '111', codigo: '631612', descricao: 'BANANA NANICA', tipo: 'KG' },
    );
    expect(fields).toEqual({
      ean: '111',
      codigo: '631612',
      descricao: 'BANANA NANICA',
      tipo: 'KG',
    });
  });

  it('usa a leitura da IA quando o catálogo não devolve nada', () => {
    const fields = labelToProductFields(
      { ean: '789', codigo: '999', descricao: 'banana nanica', tipo: 'KG' },
      null,
    );
    expect(fields.ean).toBe('789');
    expect(fields.codigo).toBe('999');
    expect(fields.descricao).toBe('BANANA NANICA');
    expect(fields.tipo).toBe('KG');
  });

  it('deixa vazio o que não foi lido', () => {
    const fields = labelToProductFields({ ean: '789' }, null);
    expect(fields.ean).toBe('789');
    expect(fields.codigo).toBe('');
    expect(fields.descricao).toBe('');
    expect(fields.tipo).toBeNull();
  });

  it('aceita apenas KG e UN como tipo (o formulário tem essas duas opções)', () => {
    expect(labelToProductFields({ tipo: 'kg' }, null).tipo).toBe('KG');
    expect(labelToProductFields({ tipo: 'UN' }, null).tipo).toBe('UN');
    expect(labelToProductFields({ tipo: 'balança' }, null).tipo).toBeNull();
    expect(labelToProductFields({}, null).tipo).toBeNull();
  });

  it('limita a descrição ao tamanho do campo', () => {
    const fields = labelToProductFields({ descricao: 'x'.repeat(200) }, null);
    expect(fields.descricao).toHaveLength(100);
  });
});
