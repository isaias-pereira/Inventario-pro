import { describe, expect, it } from 'vitest';
import {
  applyMapping,
  findHeaderRow,
  guessMapping,
  IMPORT_FIELDS,
  normalizeHeader,
  parseDay,
  parseNumber,
  type ImportTarget,
} from '@/lib/ai-import';
import { IMPORT_FIELDS as SERVER_FIELDS, buildImportPrompt, parseImportReview, sanitizeMapping } from '../../api/_lib/ai-import';

describe('Importação assistida', () => {
  it('normaliza cabeçalhos (sem acento, sem caixa)', () => {
    expect(normalizeHeader('Código do Produto')).toBe('codigo_do_produto');
    expect(normalizeHeader('  PREÇO  ')).toBe('preco');
    expect(normalizeHeader('Estoque Atual')).toBe('estoque_atual');
  });

  it('a lista de campos do cliente é a mesma do servidor', () => {
    (Object.keys(IMPORT_FIELDS) as ImportTarget[]).forEach((target) => {
      expect(IMPORT_FIELDS[target].map((field) => field.key)).toEqual(SERVER_FIELDS[target]);
    });
  });

  it('mapeia as colunas pelo nome, sem depender da IA', () => {
    const mapping = guessMapping('consulta', ['Código', 'Descrição', 'Estoque', 'Preço']);
    expect(mapping).toEqual({ codigo: 0, descricao: 1, estoque: 2, preco: 3 });
  });

  it('aceita apelidos e não usa a mesma coluna duas vezes', () => {
    const mapping = guessMapping('consulta', ['COD', 'PRODUTO', 'QTD', 'VLR']);
    expect(mapping.codigo).toBe(0);
    expect(mapping.descricao).toBe(1);
    expect(mapping.estoque).toBe(2);
    expect(mapping.preco).toBe(3);
  });

  it('encontra a linha de cabeçalho (e assume dados quando não há)', () => {
    expect(findHeaderRow([['Código', 'Descrição', 'Estoque', 'Preço'], ['1', 'X', '2', '3']], 'consulta')).toBe(0);
    expect(findHeaderRow([['1', 'BANANA', '2', '3.5']], 'consulta')).toBe(-1);
  });

  it('lê números no formato brasileiro e americano', () => {
    expect(parseNumber('1.234,56')).toBeCloseTo(1234.56);
    expect(parseNumber('12,50')).toBeCloseTo(12.5);
    expect(parseNumber('1,234.56')).toBeCloseTo(1234.56);
    expect(parseNumber('R$ 3,00')).toBeCloseTo(3);
    expect(parseNumber('1.234')).toBe(1234);
    expect(parseNumber('12.50')).toBeCloseTo(12.5);
    expect(parseNumber('')).toBeNull();
  });

  it('lê o dia do mês em vários formatos', () => {
    expect(parseDay(5)).toBe(5);
    expect(parseDay('12/05/2027')).toBe(12);
    expect(parseDay(new Date(2027, 4, 12))).toBe(12);
    expect(parseDay('45000')).toBeGreaterThan(1);
  });

  it('aplica o mapeamento e aponta as linhas suspeitas', () => {
    const rows = [
      ['631612', 'BANANA NANICA', '12', '5,50'],
      ['', 'PRODUTO SEM CODIGO', '1', '2,00'],
      ['631613', 'OUTRO', 'abc', '3,00'],
      ['631612', 'DUPLICADO', '1', '2,00'],
    ];
    const result = applyMapping<{ codigo: string; descricao: string; estoque: number; preco: number }>(
      'consulta',
      rows,
      { codigo: 0, descricao: 1, estoque: 2, preco: 3 },
    );

    expect(result.itens).toHaveLength(3);
    expect(result.itens[0]).toEqual({ codigo: '631612', descricao: 'BANANA NANICA', estoque: 12, preco: 5.5 });
    expect(result.itens[1].estoque).toBe(0);
    expect(result.avisos.some((aviso) => aviso.nivel === 'erro' && aviso.mensagem.includes('sem código'))).toBe(true);
    expect(result.avisos.some((aviso) => aviso.mensagem.includes('repetido'))).toBe(true);
    expect(result.avisos.some((aviso) => aviso.mensagem.includes('Estoque inválido'))).toBe(true);
  });

  it('avisa quando uma coluna obrigatória não foi identificada', () => {
    const result = applyMapping('venda', [['1', '100']], { dia: 0 });
    expect(result.avisos.some((aviso) => aviso.nivel === 'erro' && aviso.mensagem.includes('Venda'))).toBe(true);
    expect(result.itens).toHaveLength(0);
  });

  it('converte dia e valor das planilhas de meta e realizado', () => {
    const meta = applyMapping<{ dia: number; meta: number }>('meta', [['1', '1.000,50'], ['2', '900']], { dia: 0, meta: 1 });
    expect(meta.itens[0]).toEqual({ dia: 1, meta: 1000.5 });

    const venda = applyMapping<{ dia: number; venda: number }>('venda', [['32', '10']], { dia: 0, venda: 1 });
    expect(venda.itens).toHaveLength(0);
    expect(venda.avisos.some((aviso) => aviso.mensagem.includes('Dia inválido'))).toBe(true);
  });

  it('ignora linhas vazias', () => {
    const result = applyMapping('meta', [['', ''], ['1', '10']], { dia: 0, meta: 1 });
    expect(result.itens).toHaveLength(1);
  });
});

describe('Revisão da importação (servidor)', () => {
  it('mantém só campos esperados e índices válidos', () => {
    const mapping = sanitizeMapping(
      'consulta',
      { codigo: 0, descricao: 2, estoque: 99, preco: -1, campo_inventado: 1 },
      4,
    );
    expect(mapping).toEqual({ codigo: 0, descricao: 2 });
  });

  it('lê a revisão do modelo', () => {
    const review = parseImportReview(
      '{"mapa": {"codigo": 1, "descricao": 0}, "avisos": ["coluna de total no fim"], "confianca": 0.8}',
      'consulta',
      4,
    );
    expect(review?.mapping).toEqual({ codigo: 1, descricao: 0 });
    expect(review?.avisos).toEqual(['coluna de total no fim']);
    expect(review?.confianca).toBe(0.8);
  });

  it('devolve null quando a resposta não é JSON', () => {
    expect(parseImportReview('não sei', 'consulta', 4)).toBeNull();
  });

  it('o prompt leva os cabeçalhos e os campos esperados', () => {
    const { prompt } = buildImportPrompt('consulta', ['Código', 'Descrição'], [['1', 'X']]);
    expect(prompt).toContain('Código');
    expect(prompt).toContain('codigo');
    expect(prompt).toContain('descricao');
  });
});
