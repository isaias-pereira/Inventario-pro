import { describe, expect, it } from 'vitest';
import { buildProductUpdateQueries, type ProductUpdateInput } from '../../api/_lib/product-update';

const input: ProductUpdateInput = {
  original: '631612',
  codigo: '631613',
  ean: '210',
  descricao: 'BANANA NANICA KG 300044334',
  tipo: 'KG',
  eans: ['210', '123456789'],
  categoriaCodigo: '8',
  categoriaInformada: true,
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
    expect(master?.params).toEqual([
      '631613',
      '210',
      'BANANA NANICA KG 300044334',
      'KG',
      true,
      '8',
    ]);
  });

  it('copies the category when the master code changes', () => {
    const copy = buildProductUpdateQueries(input).find((statement) =>
      statement.query.startsWith('INSERT INTO public.produto (codigo'),
    );

    // A categoria (categoria_codigo) precisa viajar com o novo mestre:
    // sem isso a troca de código apagava a classificação do produto.
    expect(copy?.query).toContain('categoria_codigo');
    expect(copy?.query).toContain('SELECT $2::bigint,$3::bigint,$4,$5,categoria_codigo FROM public.produto');
  });

  it('keeps the current category when the form did not inform one', () => {
    const master = buildProductUpdateQueries({ ...input, categoriaInformada: false }).find((statement) =>
      statement.query.startsWith('UPDATE public.produto SET'),
    );

    expect(master?.query).toContain('CASE WHEN $5::boolean THEN $6::bigint ELSE categoria_codigo END');
    expect(master?.params?.slice(4)).toEqual([false, '8']);
  });

  it('clears the category when the form informs "sem seção"', () => {
    const master = buildProductUpdateQueries({ ...input, categoriaCodigo: null }).find((statement) =>
      statement.query.startsWith('UPDATE public.produto SET'),
    );

    expect(master?.params?.slice(4)).toEqual([true, null]);
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

  it('locks and moves closed packages when the master code changes', () => {
    const queries = buildProductUpdateQueries(input);
    const lock = queries.find((statement) => statement.query.startsWith('LOCK TABLE'));
    const move = queries.find((statement) => statement.query.startsWith('UPDATE public.produto_embalagens'));

    expect(lock?.query).toContain('public.produto_embalagens');
    expect(move?.params).toEqual(['631612', '631613']);
  });

  it('blocks a new code or EAN that is already a closed package barcode', () => {
    const guard = buildProductUpdateQueries(input).find((statement) =>
      statement.query.includes('public.produto_embalagens WHERE ean_fechado'),
    );

    expect(guard?.query).toContain('ean_fechado=$2::bigint OR ean_fechado=ANY($3::bigint[])');
  });
});
