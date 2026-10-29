/**
 * Exportação da planilha de rebaixa em ODF (.ods), o formato nativo do
 * LibreOffice Calc. O arquivo é montado à mão (XML ODF + ZIP) para preservar
 * cores, bordas, larguras, merges e a fórmula viva da margem.
 */

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
  /** Fórmula ODF ((custo - sugestão) / custo) * 100; vazia quando não há custo. */
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
/** Primeira linha de dados no Calc (linha 4, contando o título, a data e o cabeçalho). */
const FIRST_DATA_ROW = 4;
/** Fração do custo usada como preço sugerido de rebaixa. */
export const SUGESTAO_FRACTION = 0.5;
/**
 * Produto barato (custo até R$ 1,00) não pode ser sugerido abaixo de R$ 0,99:
 * metade de R$ 0,53 seria R$ 0,27, o que não é um preço de ponta praticável.
 */
export const SUGESTAO_MINIMA = 0.99;

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

type BorderWeight = 'thin' | 'medium' | 'none';
type NumberFormat = 'currency' | 'percent';

interface ColumnStyle {
  /** Largura em caracteres, como no modelo original. */
  width: number;
  align: 'left' | 'center';
  headerColor: string;
  headerFill: string;
  dataFont: string;
  dataSize: number;
  dataBold?: boolean;
  dataItalic?: boolean;
  dataColor?: string;
  dataFill?: string;
  dataBorder?: BorderWeight;
  wrap?: boolean;
  /** Formato numérico aplicado aos valores (moeda ou porcentagem). */
  dataFormat?: NumberFormat;
}

const COLUMN_STYLES: ColumnStyle[] = [
  { width: 11.5, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5 }, // LOJA
  { width: 18.3, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10, dataBorder: 'medium' }, // EAN
  { width: 11.5, align: 'center', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5 }, // CÓDIGO C5
  { width: 11.5, align: 'left', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5, wrap: true }, // DESCRIÇÃO
  { width: 13.5, align: 'left', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10, dataFormat: 'currency' }, // PMZ
  { width: 21.8, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10, dataFormat: 'currency' }, // PREÇO SUGERIDO
  { width: 15.8, align: 'center', headerColor: COLORS.black, headerFill: COLORS.headerStoreFill, dataFont: FONTS.data, dataSize: 9.5, dataBold: true, dataColor: COLORS.red, dataFormat: 'percent' }, // MARGEM %
  { width: 18.6, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10 }, // VENCIMENTO
  { width: 22.7, align: 'center', headerColor: COLORS.red, headerFill: COLORS.headerStoreFill, dataFont: FONTS.default, dataSize: 10 }, // QUANTIDADE
  { width: 16.6, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // DESCRIÇÃO DA OFERTA
  { width: 11.5, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5, dataBold: true, dataItalic: true, dataColor: COLORS.blue }, // PREÇO FINAL REBAIXA
  { width: 11.5, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // INÍCIO
  { width: 36.3, align: 'center', headerColor: COLORS.blue, headerFill: COLORS.headerCommercialFill, dataFont: FONTS.data, dataSize: 9.5 }, // FINAL
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

/**
 * Preço sugerido de rebaixa: metade do custo, mas nunca abaixo de R$ 0,99.
 * Regra: produto com custo (PMZ) até R$ 1,00 sai com sugestão padrão de R$ 0,99 —
 * metade de R$ 0,53 seria R$ 0,27, que não é preço de ponta praticável.
 */
export function suggestedPrice(custo: number): number {
  return Math.max(custo * SUGESTAO_FRACTION, SUGESTAO_MINIMA);
}

/** Coluna (0-based) → letra usada na planilha (0 → 'A'). */
function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Fórmula ODF da coluna MARGEM %: ((custo - sugestão) / custo) * 100.
 * Referências `[.E4]` apontam para a célula da mesma tabela.
 */
export function marginFormula(row: number): string {
  const custo = `[.${columnLetter(PMZ_COLUMN)}${row}]`;
  const sugestao = `[.${columnLetter(SUGERIDO_COLUMN)}${row}]`;
  return `of:=IF(${custo}=0;"";((${custo}-${sugestao})/${custo})*100)`;
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
      margem: temCusto ? marginFormula(FIRST_DATA_ROW + index) : '',
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

// ───────────────────────────── XML / ODF ─────────────────────────────

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';

const OFFICE_NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"',
].join(' ');

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reais com duas casas, para o texto cacheado da célula. */
function formatBrl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/** Porcentagem inteira, para o texto cacheado da célula. */
function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Largura de coluna: caractere do Excel ≈ 0,19 cm no Calc. */
function widthToCm(width: number): number {
  return Math.round(width * 0.19 * 100) / 100;
}

/** Altura de linha: 1 pt = 0,03528 cm. */
function heightToCm(points: number): number {
  return Math.round(points * 0.03528 * 100) / 100;
}

interface CellStyleSpec {
  background?: string;
  border?: BorderWeight;
  font: {
    name: string;
    size: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
  };
  align: 'left' | 'center';
  wrap?: boolean;
  format?: NumberFormat;
}

const NUMBER_STYLE_NAME: Record<NumberFormat, string> = {
  currency: 'Nbrl',
  percent: 'Npct',
};

function cellStyleXml(name: string, spec: CellStyleSpec): string {
  const cellProps: string[] = [];
  if (spec.background) cellProps.push(`fo:background-color="#${spec.background.toLowerCase()}"`);
  if (spec.border !== 'none') {
    const width = spec.border === 'medium' ? '1.5pt' : '0.5pt';
    cellProps.push(`fo:border="${width} solid #000000"`);
  }
  cellProps.push('style:vertical-align="middle"');
  if (spec.wrap) cellProps.push('fo:wrap-option="wrap"');

  const textProps = [
    `style:font-name="${spec.font.name}"`,
    `fo:font-size="${spec.font.size}pt"`,
    `fo:font-weight="${spec.font.bold ? 'bold' : 'normal'}"`,
    `fo:font-style="${spec.font.italic ? 'italic' : 'normal'}"`,
    `fo:color="#${(spec.font.color ?? COLORS.black).toLowerCase()}"`,
  ];
  if (spec.font.underline) {
    textProps.push(
      'style:text-underline-style="solid"',
      'style:text-underline-width="auto"',
      'style:text-underline-color="font-color"',
    );
  }

  const dataStyle = spec.format ? ` style:data-style-name="${NUMBER_STYLE_NAME[spec.format]}"` : '';

  return (
    `<style:style style:name="${name}" style:family="table-cell"${dataStyle}>` +
    `<style:table-cell-properties ${cellProps.join(' ')}/>` +
    `<style:paragraph-properties fo:text-align="${spec.align === 'center' ? 'center' : 'start'}"/>` +
    `<style:text-properties ${textProps.join(' ')}/>` +
    '</style:style>'
  );
}

function numberStylesXml(): string {
  return (
    '<number:currency-style style:name="Nbrl">' +
    '<number:currency-symbol>R$</number:currency-symbol>' +
    '<number:text> </number:text>' +
    '<number:number number:decimal-places="2" number:min-integer-digits="1" number:grouping="true"/>' +
    '<style:text-properties fo:language="pt" fo:country="BR"/>' +
    '</number:currency-style>' +
    '<number:number-style style:name="Npct">' +
    '<number:number number:decimal-places="0" number:min-integer-digits="1"/>' +
    '<number:text>%</number:text>' +
    '<style:text-properties fo:language="pt" fo:country="BR"/>' +
    '</number:number-style>'
  );
}

function textCell(style: string, text: string): string {
  if (text === '') return `<table:table-cell table:style-name="${style}"/>`;
  return (
    `<table:table-cell table:style-name="${style}" office:value-type="string">` +
    `<text:p>${escapeXml(text)}</text:p>` +
    '</table:table-cell>'
  );
}

function numberCell(style: string, value: number, display: string): string {
  return (
    `<table:table-cell table:style-name="${style}" office:value-type="float" office:value="${value}">` +
    `<text:p>${escapeXml(display)}</text:p>` +
    '</table:table-cell>'
  );
}

function formulaCell(style: string, formula: string, value: number, display: string): string {
  return (
    `<table:table-cell table:style-name="${style}" table:formula="${escapeXml(formula)}"` +
    ` office:value-type="float" office:value="${value}">` +
    `<text:p>${escapeXml(display)}</text:p>` +
    '</table:table-cell>'
  );
}

function mergedCell(style: string, span: number, text: string): string {
  const covered = span > 1
    ? `<table:covered-table-cell${span > 2 ? ` table:number-columns-repeated="${span - 1}"` : ''}/>`
    : '';
  return (
    `<table:table-cell table:style-name="${style}" table:number-columns-spanned="${span}"` +
    ' office:value-type="string">' +
    `<text:p>${escapeXml(text)}</text:p>` +
    '</table:table-cell>' +
    covered
  );
}

export interface ValidadeOdsOptions {
  store?: number;
  date?: Date;
  custos?: CustoMap;
}

/**
 * Gera o `content.xml` da planilha de rebaixa. Separado da compactação para
 * permitir testar o conteúdo sem descompactar o arquivo.
 */
export function buildValidadeOdsContent(
  items: ValidadeSpreadsheetItem[],
  tipos: TipoMap,
  options: ValidadeOdsOptions = {},
): string {
  const rows = buildSpreadsheetRows(
    items,
    tipos,
    options.store ?? DEFAULT_STORE,
    options.custos ?? {},
  );
  const date = options.date ?? new Date();
  const descricaoWidth = descriptionColumnWidth(items);
  const widths = COLUMN_STYLES.map((column, index) =>
    index === DESCRICAO_COLUMN ? descricaoWidth : column.width,
  );

  // ── Estilos automáticos: números, colunas, linhas e células ──
  const automaticStyles: string[] = [numberStylesXml()];

  automaticStyles.push(
    '<style:style style:name="ta1" style:family="table" style:master-page-name="Default">' +
      '<style:table-properties table:display="true" style:page-layout-name="pm1"/>' +
      '</style:style>',
  );

  widths.forEach((width, index) => {
    automaticStyles.push(
      `<style:style style:name="co${index}" style:family="table-column">` +
        `<style:table-column-properties style:column-width="${widthToCm(width)}cm"/>` +
        '</style:style>',
    );
  });

  // Linha 1 (título), linha 2 (data/seções), linha 3 (cabeçalho) e as de dados.
  const rowHeights = [
    48.5,
    19.4,
    35.0,
    ...rows.map((row) => {
      const charsPerLine = Math.max(10, Math.floor(descricaoWidth * 1.05));
      const lines = Math.max(1, Math.ceil(String(row.descricao ?? '').length / charsPerLine));
      return Math.max(14.1, lines * 13.5);
    }),
  ];
  rowHeights.forEach((height, index) => {
    automaticStyles.push(
      `<style:style style:name="ro${index}" style:family="table-row">` +
        `<style:table-row-properties style:row-height="${heightToCm(height)}cm" style:use-optimal-row-height="false"/>` +
        '</style:style>',
    );
  });

  automaticStyles.push(
    cellStyleXml('ceTitle', {
      background: COLORS.titleFill,
      font: { name: FONTS.title, size: 15, bold: true, italic: true, underline: true, color: COLORS.white },
      align: 'center',
    }),
    cellStyleXml('ceDateLabel', {
      font: { name: FONTS.default, size: 10, bold: true, italic: true, underline: true },
      align: 'center',
      border: 'none',
    }),
    cellStyleXml('ceDateValue', {
      background: COLORS.dateFill,
      font: { name: FONTS.section, size: 11, bold: true, italic: true, underline: true },
      align: 'center',
    }),
    cellStyleXml('ceStoreSection', {
      background: COLORS.storeSectionFill,
      font: { name: FONTS.section, size: 11, bold: true, italic: true, underline: true },
      align: 'center',
    }),
    cellStyleXml('ceCommercialSection', {
      background: COLORS.commercialSectionFill,
      font: { name: FONTS.section, size: 11, bold: true, italic: true, underline: true },
      align: 'center',
    }),
  );

  COLUMN_STYLES.forEach((column, index) => {
    automaticStyles.push(
      cellStyleXml(`ceH${index}`, {
        background: column.headerFill,
        font: { name: FONTS.header, size: 10, bold: true, color: column.headerColor },
        align: 'center',
        wrap: true,
      }),
      cellStyleXml(`ceD${index}`, {
        background: column.dataFill,
        border: column.dataBorder ?? 'thin',
        font: {
          name: column.dataFont,
          size: column.dataSize,
          bold: column.dataBold,
          italic: column.dataItalic,
          color: column.dataColor,
        },
        align: column.align,
        wrap: column.wrap,
        format: column.dataFormat,
      }),
    );
  });

  // ── Linhas ──
  const sheetRows: string[] = [];

  sheetRows.push(
    '<table:table-row table:style-name="ro0">' +
      mergedCell('ceDateLabel', 2, 'DATA:') +
      mergedCell('ceTitle', 11, SHEET_TITLE) +
      '</table:table-row>',
  );

  sheetRows.push(
    '<table:table-row table:style-name="ro1">' +
      mergedCell('ceDateValue', 2, formatShortDate(date)) +
      mergedCell('ceStoreSection', 7, STORE_SECTION) +
      mergedCell('ceCommercialSection', 4, COMMERCIAL_SECTION) +
      '</table:table-row>',
  );

  sheetRows.push(
    '<table:table-row table:style-name="ro2">' +
      COLUMNS.map((label, index) => textCell(`ceH${index}`, label)).join('') +
      '</table:table-row>',
  );

  rows.forEach((row, index) => {
    const custo = typeof row.pmz === 'number' ? row.pmz : 0;
    const sugestao = typeof row.precoSugerido === 'number' ? row.precoSugerido : 0;
    const margem = custo > 0 ? ((custo - sugestao) / custo) * 100 : 0;

    const cells = [
      numberCell('ceD0', row.loja, String(row.loja)),
      textCell('ceD1', row.ean),
      textCell('ceD2', row.codigo),
      textCell('ceD3', row.descricao),
      typeof row.pmz === 'number' ? numberCell('ceD4', row.pmz, formatBrl(row.pmz)) : textCell('ceD4', ''),
      typeof row.precoSugerido === 'number'
        ? numberCell('ceD5', row.precoSugerido, formatBrl(row.precoSugerido))
        : textCell('ceD5', ''),
      row.margem
        ? formulaCell('ceD6', row.margem, Math.round(margem * 1e10) / 1e10, formatPercent(margem))
        : textCell('ceD6', ''),
      textCell('ceD7', row.vencimento),
      numberCell('ceD8', row.quantidade, String(row.quantidade)),
      textCell('ceD9', row.descricaoOferta),
      textCell('ceD10', row.precoFinalRebaxa),
      textCell('ceD11', row.inicio),
      textCell('ceD12', row.final),
    ];

    sheetRows.push(
      `<table:table-row table:style-name="ro${3 + index}">${cells.join('')}</table:table-row>`,
    );
  });

  const table =
    '<table:table table:name="Rebaixa" table:style-name="ta1">' +
    widths.map((_, index) => `<table:table-column table:style-name="co${index}"/>`).join('') +
    sheetRows.join('') +
    '</table:table>';

  return (
    `${XML_HEADER}` +
    `<office:document-content ${OFFICE_NS} office:version="1.2">` +
    `<office:automatic-styles>${automaticStyles.join('')}</office:automatic-styles>` +
    `<office:body><office:spreadsheet>${table}</office:spreadsheet></office:body>` +
    '</office:document-content>'
  );
}

// ───────────────────────────── ZIP ─────────────────────────────

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * ZIP sem compressão (método "store"). ODF exige que `mimetype` seja a
 * primeira entrada e que não esteja comprimido; para os arquivos pequenos da
 * planilha, guardar tudo sem deflate é mais simples e igualmente válido.
 */
function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // versão necessária
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // método: store
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // versão que criou
    centralView.setUint16(6, 20, true); // versão necessária
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comentário
    centralView.setUint16(34, 0, true); // disco
    centralView.setUint16(36, 0, true); // atributos internos
    centralView.setUint32(38, 0, true); // atributos externos
    centralView.setUint32(42, offset, true);
    central.set(name, 46);

    localParts.push(local, file.data);
    centralParts.push(central);
    offset += local.length + size;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...localParts, centralDirectory, end]);
}

// ───────────────────────────── Arquivo ─────────────────────────────

function stylesXml(): string {
  return (
    `${XML_HEADER}` +
    `<office:document-styles ${OFFICE_NS} office:version="1.2">` +
    '<office:styles>' +
    '<style:default-style style:family="table-cell">' +
    `<style:text-properties style:font-name="${FONTS.default}" fo:font-size="10pt"/>` +
    '</style:default-style>' +
    '</office:styles>' +
    '<office:automatic-styles>' +
    '<style:page-layout style:name="pm1">' +
    '<style:page-layout-properties fo:page-width="29.7cm" fo:page-height="21cm"' +
    ' style:print-orientation="landscape" style:scale-to-pages="1"' +
    ' fo:margin-top="1cm" fo:margin-bottom="1cm" fo:margin-left="0.8cm" fo:margin-right="0.8cm"/>' +
    '</style:page-layout>' +
    '</office:automatic-styles>' +
    '<office:master-styles>' +
    '<style:master-page style:name="Default" style:page-layout-name="pm1"/>' +
    '</office:master-styles>' +
    '</office:document-styles>'
  );
}

function metaXml(): string {
  return (
    `${XML_HEADER}` +
    '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2">' +
    '<office:meta><meta:generator>Inventario-pro</meta:generator></office:meta>' +
    '</office:document-meta>'
  );
}

function manifestXml(): string {
  return (
    `${XML_HEADER}` +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"' +
    ' manifest:version="1.2">' +
    '<manifest:file-entry manifest:full-path="/" manifest:version="1.2"' +
    ' manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>' +
    '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
    '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>' +
    '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>' +
    '</manifest:manifest>'
  );
}

/** Gera o arquivo .ods completo (ZIP com as partes ODF). */
export function createValidadeOds(
  items: ValidadeSpreadsheetItem[],
  tipos: TipoMap,
  options: ValidadeOdsOptions = {},
): Uint8Array {
  const encoder = new TextEncoder();
  return zipStore([
    {
      name: 'mimetype',
      data: encoder.encode('application/vnd.oasis.opendocument.spreadsheet'),
    },
    { name: 'content.xml', data: encoder.encode(buildValidadeOdsContent(items, tipos, options)) },
    { name: 'styles.xml', data: encoder.encode(stylesXml()) },
    { name: 'meta.xml', data: encoder.encode(metaXml()) },
    { name: 'META-INF/manifest.xml', data: encoder.encode(manifestXml()) },
  ]);
}

export function spreadSheetFileName(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `solicitacao-rebaixa-${date.getFullYear()}-${month}-${day}.ods`;
}

/** Baixa o .ods gerado, com o nome datado e o MIME do OpenDocument. */
export function saveValidadeOds(bytes: Uint8Array, date = new Date()): void {
  const blob = new Blob([bytes.slice().buffer], {
    type: 'application/vnd.oasis.opendocument.spreadsheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = spreadSheetFileName(date);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
