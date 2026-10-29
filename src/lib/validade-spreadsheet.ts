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
  /** Custo do catálogo (PMZ); vazio quando o produto não tem custo. */
  pmz: string | number;
  /** Metade do custo; vazio quando o produto não tem custo. */
  precoSugerido: string | number;
  /** Fórmula ((custo - sugestão) / custo) * 100; vazia quando não há custo. */
  margem: string;
  vencimento: string;
  quantidade: number;
  descricaoOferta: string;
  precoFinalRebaxa: string;
  inicio: string;
  final: string;
}

export type TipoMap = Record<string, string>;
/** Custo (PMZ) de cada código do produto. */
export type CustoMap = Record<string, number>;

/** Índices (base 0) das colunas de preço dentro de COLUMNS. */
const PMZ_COLUMN = 4;
const SUGERIDO_COLUMN = 5;
const MARGEM_COLUMN = 6;
/** Primeira linha de dados no Excel (linha 4, contando o título, a data e o cabeçalho). */
const FIRST_DATA_ROW = 4;
/** Fração do custo usada como preço sugerido de rebaixa. */
export const SUGESTAO_FRACTION = 0.5;

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
  /** Formato numérico aplicado aos valores (ex.: '#,##0.00'). */
  dataNumFmt?: string;
}

const COLUMN_STYLES: ColumnStyle[] = [
  { wch: 11.5, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5 }, // LOJA
  { wch: 18.3, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10, dataBorder: EAN_BORDER }, // EAN
  { wch: 11.5, align: 'center', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5 }, // CÓDIGO C5
  { wch: 11.5, align: 'left', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5, wrap: true }, // DESCRIÇÃO
  { wch: 11.5, align: 'left', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10, dataNumFmt: '#,##0.00' }, // PMZ
  { wch: 21.8, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10, dataNumFmt: '#,##0.00' }, // PREÇO SUGERIDO
  { wch: 15.8, align: 'center', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5, dataFill: COLORS.white, dataNumFmt: '0.00' }, // MARGEM %
  { wch: 18.6, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10 }, // VENCIMENTO
  { wch: 22.7, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10 }, // QUANTIDADE
  { wch: 16.6, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // DESCRIÇÃO DA OFERTA
  { wch: 11.5, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5, dataBold: true, dataItalic: true, dataColor: COLORS.blue }, // PREÇO FINAL REBAIXA
  { wch: 11.5, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // INÍCIO
  { wch: 36.3, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // FINAL
];

const DESCRICAO_COLUMN = 3;
const DESCRICAO_MIN_WCH = 22;
const DESCRICAO_MAX_WCH = 60;

/**
 * Largura da coluna DESCRIÇÃO calculada pelo texto mais longo da lista: assim
 * todas as linhas ficam uniformes e a descrição cabe em uma única linha.
 */
export function descriptionColumnWidth(items: ValidadeSpreadsheetItem[]): number {
  const longest = items.reduce((max, item) => Math.max(max, String(item.descricao ?? '').length), 0);
  return Math.min(DESCRICAO_MAX_WCH, Math.max(DESCRICAO_MIN_WCH, Math.ceil(longest * 0.95) + 2));
}

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

/** Coluna (0-based) → letra usada na planilha (0 → 'A'). */
function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Preço sugerido de rebaixa: metade do custo. */
export function suggestedPrice(custo: number): number {
  return custo * SUGESTAO_FRACTION;
}

/**
 * Fórmula da coluna MARGEM %: ((custo - sugestão) / custo) * 100.
 * Retorna vazio quando o custo (PMZ) estiver zerado, para não dividir por zero.
 */
export function marginFormula(custoColumn: number, sugestaoColumn: number, row: number): string {
  const custo = `${columnLetter(custoColumn)}${row}`;
  const sugestao = `${columnLetter(sugestaoColumn)}${row}`;
  return `=IF(${custo}=0,"",((${custo}-${sugestao})/${custo})*100)`;
}

export function buildSpreadsheetRows(
  items: ValidadeSpreadsheetItem[],
  tipos: TipoMap,
  store = DEFAULT_STORE,
  custos: CustoMap = {},
): ValidadeSpreadsheetRow[] {
  return items.map((item, index) => {
    const codigo = String(item.codigo);
    const custo = custos[codigo];
    const temCusto = typeof custo === 'number' && Number.isFinite(custo) && custo > 0;

    return {
      loja: store,
      ean: String(item.ean),
      codigo,
      descricao: item.descricao,
      // PMZ recebe o custo do catálogo; sem custo a coluna fica vazia.
      pmz: temCusto ? custo : '',
      // Sugestão é sempre 50% do custo (banana 5,00 → 2,50).
      precoSugerido: temCusto ? suggestedPrice(custo!) : '',
      // Margem calculada pela própria planilha, assim o comercial pode ajustar a sugestão.
      margem: temCusto
        ? marginFormula(PMZ_COLUMN, SUGERIDO_COLUMN, FIRST_DATA_ROW + index)
        : '',
      // KG fica vazio, UN recebe a validade da lista e tipo desconhecido não é chutado como UN.
      vencimento: isUnitProduct(tipos[codigo]) ? formatDateBR(item.validade) : '',
      quantidade: Number(item.quantidade) || 0,
      descricaoOferta: '',
      precoFinalRebaxa: '',
      inicio: '',
      final: '',
    };
  });
}

function styleCell(sheet: XLSX.WorkSheet, address: string, style: Record<string, unknown>) {
  const cell = sheet[address];
  if (cell) cell.s = style;
}

export function createValidadeWorkbook(
  items: ValidadeSpreadsheetItem[],
  tipos: TipoMap,
  options: { store?: number; date?: Date; custos?: CustoMap } = {},
): XLSX.WorkBook {
  const rows = buildSpreadsheetRows(
    items,
    tipos,
    options.store ?? DEFAULT_STORE,
    options.custos ?? {},
  );
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
  const descricaoWidth = descriptionColumnWidth(items);

  // MARGEM % é uma fórmula de verdade: converte o texto em célula de fórmula
  // para que o comercial possa alterar a sugestão e ver a margem recalcular.
  // (aoa_to_sheet grava textos começados em "=" como string comum.)
  rows.forEach((row, index) => {
    if (!row.margem.startsWith('=')) return;
    const address = XLSX.utils.encode_cell({ r: FIRST_DATA_ROW - 1 + index, c: MARGEM_COLUMN });
    const cell = sheet[address] as unknown as { v?: unknown; t?: string; f?: string } | undefined;
    if (!cell || typeof cell.v !== 'string' || !cell.v.startsWith('=')) return;
    cell.f = cell.v.slice(1);
    cell.t = 'f';
    delete (cell as { v?: unknown }).v;
  });

  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },   // DATA: (A1:B1)
    { s: { r: 0, c: 2 }, e: { r: 0, c: 12 } },  // título (C1:M1)
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },   // data (A2:B2)
    { s: { r: 1, c: 2 }, e: { r: 1, c: 8 } },   // PREENCHIMENTO LOJA (C2:I2)
    { s: { r: 1, c: 9 }, e: { r: 1, c: 12 } },  // COMERCIAL (J2:M2)
  ];

  sheet['!cols'] = COLUMN_STYLES.map((column, index) => ({
    wch: index === DESCRICAO_COLUMN ? descricaoWidth : column.wch,
  }));

  const descricaoCharsPerLine = Math.max(10, Math.floor(descricaoWidth * 1.05));

  sheet['!rows'] = [
    { hpt: 48.5 }, // 1,711 cm no modelo
    { hpt: 19.4 }, // 0,684 cm
    { hpt: 35.0 }, // 1,236 cm
    ...rows.map((row) => {
      // A largura acompanha a descrição mais longa; ainda assim quebramos em
      // linhas para o caso de textos que passem do limite máximo da coluna.
      const lines = Math.max(1, Math.ceil(String(row.descricao ?? '').length / descricaoCharsPerLine));
      return { hpt: Math.max(14.1, lines * 13.5) };
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
        ...(column.dataNumFmt ? { z: column.dataNumFmt } : {}),
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
