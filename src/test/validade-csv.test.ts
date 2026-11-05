import { describe, expect, it } from 'vitest';
import { createValidadeCsv, csvFileName } from '../lib/validade-csv';
import type { ValidadeSpreadsheetItem } from '../lib/validade-spreadsheet';

const localIso = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 23, 59, 59).toISOString();

const items: ValidadeSpreadsheetItem[] = [
  {
    ean: '7891000315507',
    codigo: '123',
    descricao: 'LEITE INTEGRAL 1L',
    quantidade: 4,
    validade: localIso(2026, 10, 30),
  },
  {
    ean: 2000000000012,
    codigo: '456',
    descricao: 'BANANA PRATA',
    quantidade: 2,
    validade: localIso(2026, 10, 29),
  },
];

const tipos = { '123': 'UN', '456': 'KG' };

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function linesOf(bytes: Uint8Array): string[] {
  return decode(bytes).replace(/^\uFEFF/, '').trimEnd().split('\r\n');
}

describe('planilha de rebaixa em CSV', () => {
  it('começa com BOM UTF-8 (o Excel precisa dos acentos)', () => {
    const csv = createValidadeCsv(items, tipos);
    expect(Array.from(csv.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('usa o cabeçalho das 13 colunas da planilha', () => {
    const [header] = linesOf(createValidadeCsv(items, tipos));
    expect(header.split(';')).toEqual([
      'LOJA',
      'EAN OU BALANÇA',
      'CÓDIGO C5',
      'DESCRIÇÃO',
      'PMZ',
      'PREÇO SUGERIDO',
      'MARGEM %',
      'VENCIMENTO DO PRODUTO',
      'QUANTIDADE EM VENC.',
      'DESCRIÇÃO DA OFERTA',
      'PREÇO FINAL REBAIXA',
      'INÍCIO',
      'FINAL',
    ]);
  });

  it('escreve os dados no padrão brasileiro (vírgula decimal e ;)', () => {
    const rows = linesOf(createValidadeCsv(items, tipos, { custos: { '123': 5, '456': 0.53 } }));
    const leite = rows[1].split(';');
    expect(leite[0]).toBe('103');
    expect(leite[1]).toBe('7891000315507');
    expect(leite[2]).toBe('123');
    expect(leite[3]).toBe('LEITE INTEGRAL 1L');
    expect(leite[4]).toBe('5,00');
    // Sugestão: metade do custo (5,00 → 2,50).
    expect(leite[5]).toBe('2,50');
    // Margem: (5,00 - 2,50) / 5,00 = 50%.
    expect(leite[6]).toBe('50,00');
    // Produto UN recebe o vencimento da lista.
    expect(leite[7]).toBe('30/10/2026');
    expect(leite[8]).toBe('4');
  });

  it('aplica o piso de R$ 0,99 e a margem resultante', () => {
    const rows = linesOf(createValidadeCsv(items, tipos, { custos: { '456': 0.53 } }));
    const banana = rows[2].split(';');
    expect(banana[4]).toBe('0,53');
    expect(banana[5]).toBe('0,99');
    expect(banana[6]).toBe('-86,79');
    // Produto KG não recebe data de vencimento.
    expect(banana[7]).toBe('');
  });

  it('deixa preço e margem vazios quando o produto não tem custo', () => {
    const rows = linesOf(createValidadeCsv(items, tipos));
    const leite = rows[1].split(';');
    expect(leite[4]).toBe('');
    expect(leite[5]).toBe('');
    expect(leite[6]).toBe('');
  });

  it('protege descrições com ponto e vírgula ou aspas', () => {
    const csv = createValidadeCsv(
      [{ ...items[0], descricao: 'REGAJO "VIP"; 500ML' }],
      tipos,
    );
    const rows = linesOf(csv);
    expect(rows[1]).toContain('"REGAJO ""VIP""; 500ML"');
  });

  it('grava o motivo KG na descrição da oferta e o preço final na coluna', () => {
    const rows = linesOf(createValidadeCsv(
      [
        {
          ean: '2000000000012',
          codigo: '456',
          descricao: 'BANANA PRATA',
          quantidade: 2.5,
          validade: null,
          tipo: 'KG',
          oferta: 'Qualidade',
          precoFinal: 3.45,
        },
        { ...items[0], tipo: 'UN', oferta: '', precoFinal: 2.5 },
      ],
      tipos,
      { custos: { '456': 7.5, '123': 5 } },
    ));

    const banana = rows[1].split(';');
    expect(banana[7]).toBe('');
    expect(banana[9]).toBe('Qualidade');
    expect(banana[10]).toBe('3,45');

    const leite = rows[2].split(';');
    expect(leite[7]).toBe('30/10/2026');
    expect(leite[9]).toBe('');
    expect(leite[10]).toBe('2,50');
  });

  it('deixa o preço final vazio quando não informado', () => {
    const rows = linesOf(createValidadeCsv(items, tipos));
    expect(rows[1].split(';')[10]).toBe('');
    expect(rows[2].split(';')[10]).toBe('');
  });

  it('gera o nome do arquivo com a data', () => {
    expect(csvFileName(new Date(2026, 9, 5))).toBe('solicitacao-rebaixa-2026-10-05.csv');
  });
});
