import * as XLSX from 'xlsx-js-style';

export const DEFAULT_STORE = 103;

export const SHEET_TITLE = 'SOLICITAÇÃO DE REBAIXA / PERECÍVEIS';
export const STORE_SECTION = 'PREENCHIMENTO LOJA';
export const COMMERCIAL_SECTION = 'COMERCIAL';

export const COLUMNS = [
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
] as const;

export interface ValidadeSpreadsheetItem {
  ean: string | number;
  codigo: string | number;
  descricao: string;
  quantidade: number;
  validade: string;
}

export interface ValidadeSpreadsheetRow {
  loja: number;
  ean: string;
  codigo: string;
  descricao: string;
  pmz: string;
  precoSugerido: string;
  margem: string;
  vencimento: string;
  quantidade: number;
  descricaoOferta: string;
  precoFinalRebaxa: string;
  inicio: string;
  final: string;
}

export type TipoMap = Record<string, string>;

const BORDER = {
  top: { style: 'thin', color: { rgb: '808080' } },
  bottom: { style: 'thin', color: { rgb: '808080' } },
  left: { style: 'thin', color: { rgb: '808080' } },
  right: { style: 'thin', color: { rgb: '808080' } },
};

const BASE_FONT = { name: 'Calibri', sz: 10 };

export function formatDateBR(iso: string, withYear = true): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = withYear ? String(date.getFullYear()) : String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function formatShortDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function isWeightProduct(tipo?: string): boolean {
  return String(tipo ?? '').trim().toUpperCase() === 'KG';
}

export function isUnitProduct(tipo?: string): boolean {
  return String(tipo ?? '').trim().toUpperCase() === 'UN';
}

export function buildSpreadsheetRows(
  items: ValidadeSpreadsheetItem[],
  tipos: TipoMap,
  store = DEFAULT_STORE,
): ValidadeSpreadsheetRow[] {
  return items.map((item) => ({
    loja: store,
    ean: String(item.ean),
    codigo: String(item.codigo),
    descricao: item.descricao,
    pmz: '',
    precoSugerido: '',
    margem: '',
    // KG fica vazio, UN recebe a validade da lista e tipo desconhecido não é chutado como UN.
    vencimento: isUnitProduct(tipos[String(item.codigo)]) ? formatDateBR(item.validade) : '',
    quantidade: Number(item.quantidade) || 0,
    descricaoOferta: '',
    precoFinalRebaxa: '',
    inicio: '',
    final: '',
  }));
}

function styleCell(sheet: XLSX.WorkSheet, address: string, style: Record<string, unknown>) {
  const cell = sheet[address];
  if (cell) cell.s = style;
}

export function createValidadeWorkbook(
  items: ValidadeSpreadsheetItem[],
  tipos: TipoMap,
  options: { store?: number; date?: Date } = {},
): XLSX.WorkBook {
  const rows = buildSpreadsheetRows(items, tipos, options.store ?? DEFAULT_STORE);
  const date = options.date ?? new Date();

  const aoa: (string | number)[][] = [
    ['DATA:', '', SHEET_TITLE, '', '', '', '', '', '', '', '', '', ''],
    ['', formatShortDate(date), STORE_SECTION, '', '', '', '', '', '', COMMERCIAL_SECTION, '', '', ''],
    [...COLUMNS],
    ...rows.map((row) => [
      row.loja,
      row.ean,
      row.codigo,
      row.descricao,
      row.pmz,
      row.precoSugerido,
      row.margem,
      row.vencimento,
      row.quantidade,
      row.descricaoOferta,
      row.precoFinalRebaxa,
      row.inicio,
      row.final,
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const lastRow = aoa.length;

  sheet['!merges'] = [
    { s: { r: 0, c: 2 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 2 }, e: { r: 1, c: 8 } },
    { s: { r: 1, c: 9 }, e: { r: 1, c: 12 } },
  ];

  sheet['!cols'] = [
    { wch: 8 },   // LOJA
    { wch: 18 },  // EAN OU BALANÇA
    { wch: 12 },  // CÓDIGO C5
    { wch: 42 },  // DESCRIÇÃO
    { wch: 8 },   // PMZ
    { wch: 15 },  // PREÇO SUGERIDO
    { wch: 10 },  // MARGEM %
    { wch: 17 },  // VENCIMENTO
    { wch: 17 },  // QUANTIDADE
    { wch: 26 },  // DESCRIÇÃO DA OFERTA
    { wch: 16 },  // PREÇO FINAL REBAIXA
    { wch: 10 },  // INÍCIO
    { wch: 10 },  // FINAL
  ];

  sheet['!rows'] = [
    { hpt: 30 },
    { hpt: 20 },
    { hpt: 38 },
    ...rows.map(() => ({ hpt: 18 })),
  ];

  // ── Linha 1: rótulo DATA + faixa azul do título ──
  styleCell(sheet, 'A1', {
    font: { ...BASE_FONT, bold: true, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER,
  });
  styleCell(sheet, 'B1', {
    fill: { fgColor: { rgb: 'FFFFFF' } },
    border: BORDER,
  });
  for (let col = 2; col <= 12; col++) {
    const address = XLSX.utils.encode_cell({ r: 0, c: col });
    styleCell(sheet, address, {
      fill: { fgColor: { rgb: '1F4E79' } },
      font: { ...BASE_FONT, bold: true, italic: true, sz: 13, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    });
  }

  // ── Linha 2: data do download + seções ──
  styleCell(sheet, 'A2', {
    fill: { fgColor: { rgb: 'FFFFFF' } },
    border: BORDER,
  });
  styleCell(sheet, 'B2', {
    font: { ...BASE_FONT, bold: true, sz: 10 },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER,
  });
  for (let col = 2; col <= 12; col++) {
    const address = XLSX.utils.encode_cell({ r: 1, c: col });
    styleCell(sheet, address, {
      fill: { fgColor: { rgb: 'D9D9D9' } },
      font: { ...BASE_FONT, bold: true, italic: true },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    });
  }

  // ── Linha 3: cabeçalho das colunas ──
  for (let col = 0; col <= 12; col++) {
    const address = XLSX.utils.encode_cell({ r: 2, c: col });
    const isRed = col === 7 || col === 8;
    const isBlue = col >= 9;
    styleCell(sheet, address, {
      fill: { fgColor: { rgb: col >= 7 ? 'D9D9D9' : 'FFFFFF' } },
      font: {
        ...BASE_FONT,
        bold: true,
        color: { rgb: isRed ? 'C00000' : isBlue ? '1F4E79' : '000000' },
      },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    });
  }

  // ── Linhas de dados ──
  for (let row = 3; row < lastRow; row++) {
    for (let col = 0; col <= 12; col++) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      styleCell(sheet, address, {
        font: BASE_FONT,
        alignment: {
          horizontal: col === 0 || col === 8 ? 'center' : col === 7 ? 'center' : 'left',
          vertical: 'center',
          wrapText: col === 3,
        },
        border: BORDER,
      });
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Rebaixa');
  return workbook;
}

export function spreadSheetFileName(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `solicitacao-rebaixa-${date.getFullYear()}-${month}-${day}.xlsx`;
}

export function saveValidadeSpreadsheet(workbook: XLSX.WorkBook, date = new Date()): void {
  XLSX.writeFile(workbook, spreadSheetFileName(date));
}
