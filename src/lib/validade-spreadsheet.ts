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

// Cores e fontes extraídas do modelo original "Modelo de rabaixa.ods".
const COLORS = {
  titleFill: '3465A4',
  storeSectionFill: 'DEDCE6',
  commercialSectionFill: 'E6E6FF',
  dateFill: 'E6E6FF',
  headerStoreFill: 'CCCCCC',
  headerCommercialFill: 'E6E6E6',
  red: 'FF0000',
  blue: '0000FF',
  black: '000000',
  white: 'FFFFFF',
};

const FONTS = {
  title: 'Trebuchet MS',
  section: 'Trebuchet MS',
  header: 'Trebuchet MS',
  data: 'Trebuchet MS',
  default: 'Arial',
};

const BORDER = {
  top: { style: 'thin', color: { rgb: COLORS.black } },
  bottom: { style: 'thin', color: { rgb: COLORS.black } },
  left: { style: 'thin', color: { rgb: COLORS.black } },
  right: { style: 'thin', color: { rgb: COLORS.black } },
};

// No modelo a coluna do código de barras tem moldura reforçada (0,74pt).
const EAN_BORDER = {
  top: { style: 'medium', color: { rgb: COLORS.black } },
  bottom: { style: 'medium', color: { rgb: COLORS.black } },
  left: { style: 'medium', color: { rgb: COLORS.black } },
  right: { style: 'medium', color: { rgb: COLORS.black } },
};

interface ColumnStyle {
  wch: number;
  align: 'left' | 'center';
  headerColor: string;
  headerFill: string;
  dataFont: string;
  dataSize: number;
  dataBold?: boolean;
  dataItalic?: boolean;
  dataColor?: string;
  dataFill?: string;
  dataBorder?: typeof BORDER;
  wrap?: boolean;
}

const COLUMN_STYLES: ColumnStyle[] = [
  { wch: 11.5, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5 }, // LOJA
  { wch: 18.3, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10, dataBorder: EAN_BORDER }, // EAN
  { wch: 11.5, align: 'center', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5 }, // CÓDIGO C5
  { wch: 11.5, align: 'left', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5, wrap: true }, // DESCRIÇÃO
  { wch: 11.5, align: 'left', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10 }, // PMZ
  { wch: 21.8, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10 }, // PREÇO SUGERIDO
  { wch: 15.8, align: 'center', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5, dataFill: COLORS.white }, // MARGEM %
  { wch: 18.6, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10 }, // VENCIMENTO
  { wch: 22.7, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10 }, // QUANTIDADE
  { wch: 16.6, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // DESCRIÇÃO DA OFERTA
  { wch: 11.5, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5, dataBold: true, dataItalic: true, dataColor: COLORS.blue }, // PREÇO FINAL REBAIXA
  { wch: 11.5, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // INÍCIO
  { wch: 36.3, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // FINAL
];

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
    [formatShortDate(date), '', STORE_SECTION, '', '', '', '', '', '', COMMERCIAL_SECTION, '', '', ''],
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
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },   // DATA: (A1:B1)
    { s: { r: 0, c: 2 }, e: { r: 0, c: 12 } },  // título (C1:M1)
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },   // data (A2:B2)
    { s: { r: 1, c: 2 }, e: { r: 1, c: 8 } },   // PREENCHIMENTO LOJA (C2:I2)
    { s: { r: 1, c: 9 }, e: { r: 1, c: 12 } },  // COMERCIAL (J2:M2)
  ];

  sheet['!cols'] = COLUMN_STYLES.map((column) => ({ wch: column.wch }));

  sheet['!rows'] = [
    { hpt: 48.5 }, // 1,711 cm no modelo
    { hpt: 19.4 }, // 0,684 cm
    { hpt: 35.0 }, // 1,236 cm
    ...rows.map((row) => {
      // Reproduz o auto-ajuste do modelo: a descrição ocupa ~14 caracteres por linha.
      const lines = Math.max(1, Math.ceil(String(row.descricao ?? '').length / 14));
      return { hpt: Math.max(14.1, lines * 13.5 + 1) };
    }),
  ];

  // ── Linha 1: rótulo DATA (sem borda, como no modelo) + faixa azul do título ──
  styleCell(sheet, 'A1', {
    font: { name: FONTS.default, sz: 10, bold: true, italic: true, underline: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  for (let col = 2; col <= 12; col++) {
    const address = XLSX.utils.encode_cell({ r: 0, c: col });
    styleCell(sheet, address, {
      fill: { fgColor: { rgb: COLORS.titleFill } },
      font: { name: FONTS.title, sz: 15, bold: true, italic: true, underline: true, color: { rgb: COLORS.white } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    });
  }

  // ── Linha 2: data do download + seções ──
  for (let col = 0; col <= 1; col++) {
    const address = XLSX.utils.encode_cell({ r: 1, c: col });
    styleCell(sheet, address, {
      fill: { fgColor: { rgb: COLORS.dateFill } },
      font: { name: FONTS.section, sz: 11, bold: true, italic: true, underline: true, color: { rgb: COLORS.black } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    });
  }
  for (let col = 2; col <= 8; col++) {
    const address = XLSX.utils.encode_cell({ r: 1, c: col });
    styleCell(sheet, address, {
      fill: { fgColor: { rgb: COLORS.storeSectionFill } },
      font: { name: FONTS.section, sz: 11, bold: true, italic: true, underline: true, color: { rgb: COLORS.black } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    });
  }
  for (let col = 9; col <= 12; col++) {
    const address = XLSX.utils.encode_cell({ r: 1, c: col });
    styleCell(sheet, address, {
      fill: { fgColor: { rgb: COLORS.commercialSectionFill } },
      font: { name: FONTS.section, sz: 11, bold: true, italic: true, underline: true, color: { rgb: COLORS.black } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    });
  }

  // ── Linha 3: cabeçalho das colunas ──
  for (let col = 0; col <= 12; col++) {
    const address = XLSX.utils.encode_cell({ r: 2, c: col });
    const column = COLUMN_STYLES[col];
    styleCell(sheet, address, {
      fill: { fgColor: { rgb: column.headerFill } },
      font: { name: FONTS.header, sz: 10, bold: true, color: { rgb: column.headerColor } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    });
  }

  // ── Linhas de dados ──
  for (let row = 3; row < lastRow; row++) {
    for (let col = 0; col <= 12; col++) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const column = COLUMN_STYLES[col];
      styleCell(sheet, address, {
        ...(column.dataFill ? { fill: { fgColor: { rgb: column.dataFill } } } : {}),
        font: {
          name: column.dataFont,
          sz: column.dataSize,
          bold: column.dataBold ?? false,
          italic: column.dataItalic ?? false,
          ...(column.dataColor ? { color: { rgb: column.dataColor } } : {}),
        },
        alignment: {
          horizontal: column.align,
          vertical: 'center',
          wrapText: column.wrap ?? false,
        },
        border: column.dataBorder ?? BORDER,
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
