import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  DEFAULT_STORE,
  buildSpreadsheetRows,
  createValidadeWorkbook,
  descriptionColumnWidth,
  formatDateBR,
  isWeightProduct,
  spreadSheetFileName,
  type ValidadeSpreadsheetItem,
} from '../lib/validade-spreadsheet';

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

const cell = (sheet: Record<string, { v?: unknown }>, address: string) => sheet[address]?.v ?? '';

describe('planilha de solicitação de rebaixa', () => {
  it('usa a loja 103 como padrão', () => {
    expect(DEFAULT_STORE).toBe(103);
    expect(buildSpreadsheetRows(items, tipos).map((row) => row.loja)).toEqual([103, 103]);
  });

  it('preenche ean, código, descrição e quantidade da lista', () => {
    const [row] = buildSpreadsheetRows(items, tipos);

    expect(row.ean).toBe('7891000315507');
    expect(row.codigo).toBe('123');
    expect(row.descricao).toBe('LEITE INTEGRAL 1L');
    expect(row.quantidade).toBe(4);
    expect(row.pmz).toBe('');
    expect(row.precoSugerido).toBe('');
    expect(row.margem).toBe('');
    expect(row.descricaoOferta).toBe('');
    expect(row.precoFinalRebaxa).toBe('');
    expect(row.inicio).toBe('');
    expect(row.final).toBe('');
  });

  it('deixa o vencimento vazio para KG e usa a validade para UN', () => {
    expect(isWeightProduct('kg')).toBe(true);
    expect(isWeightProduct('UN')).toBe(false);

    const [un, kg] = buildSpreadsheetRows(items, tipos);
    expect(un.vencimento).toBe('30/10/2026');
    expect(kg.vencimento).toBe('');

    const [semTipo] = buildSpreadsheetRows([items[0]], {});
    expect(semTipo.vencimento).toBe('');
  });

  it('formata a data no padrão dd/mm/aaaa', () => {
    expect(formatDateBR(localIso(2026, 1, 5))).toBe('05/01/2026');
    expect(formatDateBR('data-invalida')).toBe('');
  });

  it('monta o cabeçalho, os merges e as linhas de dados', () => {
    const wb = createValidadeWorkbook(items, tipos, { date: new Date(2026, 9, 28) });
    const sheet = wb.Sheets['Rebaixa'];
    const sheetCells = sheet as unknown as Record<string, { v?: unknown }>;

    // Faixa de título e seções
    expect(cell(sheetCells, 'A1')).toBe('DATA:');
    expect(cell(sheetCells, 'A2')).toBe('28/10/26');
    expect(cell(sheetCells, 'C1')).toBe('SOLICITAÇÃO DE REBAIXA / PERECÍVEIS');
    expect(cell(sheetCells, 'C2')).toBe('PREENCHIMENTO LOJA');
    expect(cell(sheetCells, 'J2')).toBe('COMERCIAL');

    expect(sheet['!merges']).toEqual([
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 0, c: 12 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
      { s: { r: 1, c: 2 }, e: { r: 1, c: 8 } },
      { s: { r: 1, c: 9 }, e: { r: 1, c: 12 } },
    ]);

    // Cabeçalho das colunas A–M
    COLUMNS.forEach((label, index) => {
      const address = `${String.fromCharCode(65 + index)}3`;
      expect(cell(sheetCells, address)).toBe(label);
    });

    // Primeira linha de dados (UN)
    expect(cell(sheetCells, 'A4')).toBe(103);
    expect(cell(sheetCells, 'B4')).toBe('7891000315507');
    expect(cell(sheetCells, 'C4')).toBe('123');
    expect(cell(sheetCells, 'D4')).toBe('LEITE INTEGRAL 1L');
    expect(cell(sheetCells, 'E4')).toBe('');
    expect(cell(sheetCells, 'F4')).toBe('');
    expect(cell(sheetCells, 'G4')).toBe('');
    expect(cell(sheetCells, 'H4')).toBe('30/10/2026');
    expect(cell(sheetCells, 'I4')).toBe(4);
    expect(cell(sheetCells, 'J4')).toBe('');
    expect(cell(sheetCells, 'K4')).toBe('');
    expect(cell(sheetCells, 'L4')).toBe('');
    expect(cell(sheetCells, 'M4')).toBe('');

    // Segunda linha (KG): vencimento zerado
    expect(cell(sheetCells, 'A5')).toBe(103);
    expect(cell(sheetCells, 'B5')).toBe('2000000000012');
    expect(cell(sheetCells, 'C5')).toBe('456');
    expect(cell(sheetCells, 'H5')).toBe('');
    expect(cell(sheetCells, 'I5')).toBe(2);
  });

  it('mantém fonte, cores e tamanhos do modelo original', () => {
    const wb = createValidadeWorkbook(items, tipos, { date: new Date(2026, 9, 28) });
    const sheet = wb.Sheets['Rebaixa'];
    interface Style {
      fill?: { fgColor?: { rgb?: string } };
      font?: {
        name?: string;
        sz?: number;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        color?: { rgb?: string };
      };
    }
    const styleOf = (address: string): Style =>
      ((sheet[address] as unknown as { s?: Style }).s ?? {});

    const title = styleOf('C1');
    expect(title.fill?.fgColor?.rgb).toBe('3465A4');
    expect(title.font).toMatchObject({
      name: 'Trebuchet MS',
      sz: 15,
      bold: true,
      italic: true,
      underline: true,
      color: { rgb: 'FFFFFF' },
    });

    const date = styleOf('A2');
    expect(date.fill?.fgColor?.rgb).toBe('E6E6FF');
    expect(date.font).toMatchObject({
      name: 'Trebuchet MS',
      sz: 11,
      bold: true,
      italic: true,
      underline: true,
    });

    expect(styleOf('C2').fill?.fgColor?.rgb).toBe('DEDCE6');
    expect(styleOf('J2').fill?.fgColor?.rgb).toBe('E6E6FF');

    // Cabeçalho: LOJA/EAN/PMZ/PREÇO/VENC./QTD em vermelho; CÓDIGO/DESCRIÇÃO/MARGEM em preto; COMERCIAL em azul.
    const header = styleOf;
    expect(header('A3').fill?.fgColor?.rgb).toBe('CCCCCC');
    expect(header('A3').font).toMatchObject({ name: 'Trebuchet MS', sz: 10, bold: true, color: { rgb: 'FF0000' } });
    expect(header('B3').font?.color?.rgb).toBe('FF0000');
    expect(header('C3').font?.color?.rgb).toBe('000000');
    expect(header('D3').font?.color?.rgb).toBe('000000');
    expect(header('E3').font?.color?.rgb).toBe('FF0000');
    expect(header('F3').font?.color?.rgb).toBe('FF0000');
    expect(header('G3').font?.color?.rgb).toBe('000000');
    expect(header('H3').font?.color?.rgb).toBe('FF0000');
    expect(header('I3').font?.color?.rgb).toBe('FF0000');
    expect(header('J3').fill?.fgColor?.rgb).toBe('E6E6E6');
    expect(header('J3').font?.color?.rgb).toBe('0000FF');
    expect(header('K3').font?.color?.rgb).toBe('0000FF');
    expect(header('L3').font?.color?.rgb).toBe('0000FF');
    expect(header('M3').font?.color?.rgb).toBe('0000FF');

    // Larguras e alturas extraídas do ODS (cm convertidos para caracteres/pontos).
    expect(sheet['!cols']?.[0]).toEqual({ wch: 11.5 });
    expect(sheet['!cols']?.[12]).toEqual({ wch: 36.3 });
    expect(sheet['!rows']?.[0]).toEqual({ hpt: 48.5 });

    // A coluna do código de barras tem moldura reforçada no modelo (0,74pt).
    const eanData = styleOf('B4') as unknown as { border?: { left?: { style?: string } } };
    expect(eanData.border?.left?.style).toBe('medium');
    expect((styleOf('C4') as unknown as { border?: { left?: { style?: string } } }).border?.left?.style).toBe('thin');
  });

  it('ajusta a largura da descrição pelo texto mais longo da coluna', () => {
    const curto = [{ ...items[0], descricao: 'LEITE' }];
    expect(descriptionColumnWidth(curto)).toBe(22); // largura mínima

    const longo = [{ ...items[0], descricao: 'CP HORTELA 50G 100000043709' }];
    const wb = createValidadeWorkbook(longo, tipos, { date: new Date(2026, 9, 28) });
    const sheet = wb.Sheets['Rebaixa'];
    const width = (sheet['!cols']?.[3] as { wch?: number } | undefined)?.wch;

    expect(width).toBe(descriptionColumnWidth(longo));
    expect(width).toBeGreaterThan(22);
    // Com a coluna dimensionada pelo maior texto, a linha fica em uma só linha.
    expect(sheet['!rows']?.[3]).toEqual({ hpt: 14.1 });

    const gigante = [{ ...items[0], descricao: 'X'.repeat(300) }];
    expect(descriptionColumnWidth(gigante)).toBe(60); // limite máximo
  });

  it('nomeia o arquivo com a data do download', () => {
    expect(spreadSheetFileName(new Date(2026, 9, 5))).toBe('solicitacao-rebaixa-2026-10-05.xlsx');
  });
});
