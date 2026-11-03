import { describe, expect, it } from 'vitest';
import { buildProductUpdateQueries, type ProductUpdateInput } from '../../api/_lib/product-update';

const input: ProductUpdateInput = {
  original: '631612',
  codigo: '631613',
  ean: '210',
  descricao: 'BANANA NANICA KG 300044334',
  tipo: 'KG',
  eans: ['210', '123456789'],
};

/** Maior placeholder posicional usado pela query ($1, $2...). */
function maxPlaceholder(query: string): number {
  const matches = [...query.matchAll(/\$(\d+)/g)];
  return matches.reduce((max, match) => Math.max(max, Number(match[1])), 0);
}

describe('buildProductUpdateQueries', () => {
  it('does not send unused or missing positional parameters', () => {
    for (const statement of buildProductUpdateQueries(input)) {
      expect(statement.params?.length ?? 0, statement.query).toBe(maxPlaceholder(statement.query));
    }
  });

  it('updates the master row with the new code, primary EAN, description and type', () => {
    const master = buildProductUpdateQueries(input).find((statement) =>
      statement.query.startsWith('UPDATE public.produto SET'),
    );

    expect(master?.query).toContain('ean=$2::bigint,descricao=$3,tipo=$4');
    expect(master?.params).toEqual(['631613', '210', 'BANANA NANICA KG 300044334', 'KG']);
  });

  it('deletes the old master only when the code actually changes', () => {
    const removeOld = buildProductUpdateQueries(input).find((statement) =>
      statement.query.startsWith('DELETE FROM public.produto WHERE'),
    );

    expect(removeOld?.query).toContain('codigo=$1::bigint AND codigo<>$2::bigint');
    expect(removeOld?.params).toEqual(['631612', '631613']);
  });

  it('reinserts every EAN except the primary one for the new code', () => {
    const insertEans = buildProductUpdateQueries(input).find((statement) =>
      statement.query.startsWith('INSERT INTO public.produto_eans'),
    );

    expect(insertEans?.params).toEqual(['631613', ['210', '123456789'], '210']);
  });

  it('keeps the same parameter contract when the code does not change', () => {
    const sameCode = buildProductUpdateQueries({ ...input, codigo: '631612' });

    for (const statement of sameCode) {
      expect(statement.params?.length ?? 0, statement.query).toBe(maxPlaceholder(statement.query));
    }
  });
});
