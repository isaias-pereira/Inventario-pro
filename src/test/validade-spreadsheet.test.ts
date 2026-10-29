import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import {
  COLUMNS,
  DEFAULT_STORE,
  buildSpreadsheetRows,
  buildValidadeOdsContent,
  createValidadeOds,
  descriptionColumnWidth,
  formatDateBR,
  isWeightProduct,
  marginFormula,
  spreadSheetFileName,
  suggestedPrice,
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

/** Lê o content.xml gerado como XML de verdade (jsdom). */
function parseContent(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function rowsOf(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagName('table:table-row'));
}

function cellsOf(row: Element): Element[] {
  return Array.from(row.getElementsByTagName('table:table-cell'));
}

function cellText(cell: Element): string {
  const paragraph = cell.getElementsByTagName('text:p')[0];
  return paragraph?.textContent ?? '';
}

/** Valor lógico da célula: número em office:value, texto no parágrafo. */
function cellValue(cell: Element): string {
  if (cell.getAttribute('office:value-type') === 'float') {
    return cell.getAttribute('office:value') ?? '';
  }
  return cellText(cell);
}

function styleByName(doc: Document, name: string): Element | undefined {
  return Array.from(doc.getElementsByTagName('style:style')).find(
    (style) => style.getAttribute('style:name') === name,
  );
}

function styleProp(doc: Document, styleName: string, tag: string, attribute: string): string | null {
  const style = styleByName(doc, styleName);
  const element = style?.getElementsByTagName(tag)[0];
  return element?.getAttribute(attribute) ?? null;
}

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

  it('monta o título, as seções e o cabeçalho com os merges do modelo', () => {
    const doc = parseContent(buildValidadeOdsContent(items, tipos, { date: new Date(2026, 9, 28) }));
    const rows = rowsOf(doc);

    // Linha 1: DATA: ocupa A:B e o título ocupa C:M.
    const titulo = cellsOf(rows[0]);
    expect(titulo).toHaveLength(2);
    expect(cellText(titulo[0])).toBe('DATA:');
    expect(titulo[0].getAttribute('table:number-columns-spanned')).toBe('2');
    expect(cellText(titulo[1])).toBe('SOLICITAÇÃO DE REBAIXA / PERECÍVEIS');
    expect(titulo[1].getAttribute('table:number-columns-spanned')).toBe('11');

    // Linha 2: data (A:B), PREENCHIMENTO LOJA (C:I) e COMERCIAL (J:M).
    const secoes = cellsOf(rows[1]);
    expect(secoes).toHaveLength(3);
    expect(cellText(secoes[0])).toBe('28/10/26');
    expect(secoes[0].getAttribute('table:number-columns-spanned')).toBe('2');
    expect(cellText(secoes[1])).toBe('PREENCHIMENTO LOJA');
    expect(secoes[1].getAttribute('table:number-columns-spanned')).toBe('7');
    expect(cellText(secoes[2])).toBe('COMERCIAL');
    expect(secoes[2].getAttribute('table:number-columns-spanned')).toBe('4');

    // Linha 3: as 13 colunas A–M.
    const cabecalho = cellsOf(rows[2]);
    expect(cabecalho).toHaveLength(13);
    COLUMNS.forEach((label, index) => expect(cellText(cabecalho[index])).toBe(label));
  });

  it('grava as linhas de dados com tipo, vencimento e quantidade', () => {
    const doc = parseContent(buildValidadeOdsContent(items, tipos, { date: new Date(2026, 9, 28) }));
    const rows = rowsOf(doc);

    const primeira = cellsOf(rows[3]);
    expect(primeira).toHaveLength(13);
    expect(cellValue(primeira[0])).toBe('103');
    expect(primeira[0].getAttribute('office:value-type')).toBe('float');
    expect(cellValue(primeira[1])).toBe('7891000315507');
    expect(cellValue(primeira[2])).toBe('123');
    expect(cellValue(primeira[3])).toBe('LEITE INTEGRAL 1L');
    expect(cellText(primeira[4])).toBe('');
    expect(cellText(primeira[5])).toBe('');
    expect(cellText(primeira[6])).toBe('');
    expect(cellValue(primeira[7])).toBe('30/10/2026');
    expect(cellValue(primeira[8])).toBe('4');

    // Segunda linha (KG): vencimento vazio.
    const segunda = cellsOf(rows[4]);
    expect(cellValue(segunda[1])).toBe('2000000000012');
    expect(cellValue(segunda[2])).toBe('456');
    expect(cellText(segunda[7])).toBe('');
    expect(cellValue(segunda[8])).toBe('2');
  });

  it('mantém fonte, cores e tamanhos do modelo original', () => {
    const doc = parseContent(buildValidadeOdsContent(items, tipos, { date: new Date(2026, 9, 28) }));

    expect(styleProp(doc, 'ceTitle', 'style:table-cell-properties', 'fo:background-color')).toBe('#3465a4');
    expect(styleProp(doc, 'ceTitle', 'style:text-properties', 'style:font-name')).toBe('Trebuchet MS');
    expect(styleProp(doc, 'ceTitle', 'style:text-properties', 'fo:font-size')).toBe('15pt');
    expect(styleProp(doc, 'ceTitle', 'style:text-properties', 'fo:font-weight')).toBe('bold');
    expect(styleProp(doc, 'ceTitle', 'style:text-properties', 'fo:font-style')).toBe('italic');
    expect(styleProp(doc, 'ceTitle', 'style:text-properties', 'style:text-underline-style')).toBe('solid');
    expect(styleProp(doc, 'ceTitle', 'style:text-properties', 'fo:color')).toBe('#ffffff');

    expect(styleProp(doc, 'ceDateValue', 'style:table-cell-properties', 'fo:background-color')).toBe('#e6e6ff');
    expect(styleProp(doc, 'ceDateValue', 'style:text-properties', 'fo:font-size')).toBe('11pt');
    expect(styleProp(doc, 'ceStoreSection', 'style:table-cell-properties', 'fo:background-color')).toBe('#dedce6');
    expect(styleProp(doc, 'ceCommercialSection', 'style:table-cell-properties', 'fo:background-color')).toBe('#e6e6ff');

    // Cabeçalho: LOJA/EAN/PMZ/PREÇO/VENC./QTD em vermelho; CÓDIGO/DESCRIÇÃO/MARGEM em preto; COMERCIAL em azul.
    expect(styleProp(doc, 'ceH0', 'style:table-cell-properties', 'fo:background-color')).toBe('#cccccc');
    expect(styleProp(doc, 'ceH0', 'style:text-properties', 'fo:color')).toBe('#ff0000');
    expect(styleProp(doc, 'ceH1', 'style:text-properties', 'fo:color')).toBe('#ff0000');
    expect(styleProp(doc, 'ceH2', 'style:text-properties', 'fo:color')).toBe('#000000');
    expect(styleProp(doc, 'ceH3', 'style:text-properties', 'fo:color')).toBe('#000000');
    expect(styleProp(doc, 'ceH4', 'style:text-properties', 'fo:color')).toBe('#ff0000');
    expect(styleProp(doc, 'ceH5', 'style:text-properties', 'fo:color')).toBe('#ff0000');
    expect(styleProp(doc, 'ceH6', 'style:text-properties', 'fo:color')).toBe('#000000');
    expect(styleProp(doc, 'ceH7', 'style:text-properties', 'fo:color')).toBe('#ff0000');
    expect(styleProp(doc, 'ceH8', 'style:text-properties', 'fo:color')).toBe('#ff0000');
    expect(styleProp(doc, 'ceH9', 'style:table-cell-properties', 'fo:background-color')).toBe('#e6e6e6');
    expect(styleProp(doc, 'ceH9', 'style:text-properties', 'fo:color')).toBe('#0000ff');
    expect(styleProp(doc, 'ceH12', 'style:text-properties', 'fo:color')).toBe('#0000ff');

    // Larguras e alturas extraídas do modelo original (cm).
    expect(styleProp(doc, 'co0', 'style:table-column-properties', 'style:column-width')).toBe('2.19cm');
    expect(styleProp(doc, 'co12', 'style:table-column-properties', 'style:column-width')).toBe('6.9cm');
    expect(styleProp(doc, 'ro0', 'style:table-row-properties', 'style:row-height')).toBe('1.71cm');

    // A coluna do código de barras tem moldura reforçada no modelo (0,74pt).
    expect(styleProp(doc, 'ceD1', 'style:table-cell-properties', 'fo:border')).toBe('1.5pt solid #000000');
    expect(styleProp(doc, 'ceD2', 'style:table-cell-properties', 'fo:border')).toBe('0.5pt solid #000000');
  });

  it('ajusta a largura da descrição pelo texto mais longo da coluna', () => {
    const curto = [{ ...items[0], descricao: 'LEITE' }];
    expect(descriptionColumnWidth(curto)).toBe(22); // largura mínima

    const longo = [{ ...items[0], descricao: 'CP HORTELA 50G 100000043709' }];
    const doc = parseContent(buildValidadeOdsContent(longo, tipos, { date: new Date(2026, 9, 28) }));
    const width = styleProp(doc, 'co3', 'style:table-column-properties', 'style:column-width');

    expect(width).toBe(`${Math.round(descriptionColumnWidth(longo) * 0.19 * 100) / 100}cm`);
    // Com a coluna dimensionada pelo maior texto, a linha fica em uma só linha.
    expect(styleProp(doc, 'ro3', 'style:table-row-properties', 'style:row-height')).toBe('0.5cm');

    const gigante = [{ ...items[0], descricao: 'X'.repeat(300) }];
    expect(descriptionColumnWidth(gigante)).toBe(60); // limite máximo
  });

  it('nomeia o arquivo com a data do download em .ods', () => {
    expect(spreadSheetFileName(new Date(2026, 9, 5))).toBe('solicitacao-rebaixa-2026-10-05.ods');
  });
});

describe('custo, sugestão e margem na planilha de rebaixa', () => {
  it('coloca o custo na coluna PMZ e a sugestão na metade do custo', () => {
    const [banana] = buildSpreadsheetRows([{ ...items[1], codigo: '631612' }], { '631612': 'KG' }, 103, { '631612': 5 });

    expect(banana.pmz).toBe(5);
    expect(banana.precoSugerido).toBe(2.5);
  });

  it('usa R$ 0,99 como sugestão padrão quando o custo é até R$ 1,00', () => {
    const [banana] = buildSpreadsheetRows([{ ...items[1], codigo: '631612' }], { '631612': 'KG' }, 103, { '631612': 0.53 });

    expect(banana.pmz).toBe(0.53);
    expect(banana.precoSugerido).toBe(0.99);
  });

  it('mantém as colunas vazias quando o produto não tem custo', () => {
    const [semCusto] = buildSpreadsheetRows([items[0]], { '123': 'UN' }, 103, {});

    expect(semCusto.pmz).toBe('');
    expect(semCusto.precoSugerido).toBe('');
    expect(semCusto.margem).toBe('');
  });

  it('ignora custo zerado ou inválido', () => {
    const [zero] = buildSpreadsheetRows([items[0]], { '123': 'UN' }, 103, { '123': 0 });
    const [negativo] = buildSpreadsheetRows([items[0]], { '123': 'UN' }, 103, { '123': -3 });

    expect(zero.pmz).toBe('');
    expect(negativo.pmz).toBe('');
  });

  it('escreve a fórmula ODF ((custo - sugestão) / custo) * 100 na coluna MARGEM', () => {
    expect(marginFormula(4)).toBe('of:=IF([.E4]=0;"";(([.E4]-[.F4])/[.E4])*100)');

    const [row] = buildSpreadsheetRows([{ ...items[0], codigo: '123' }], { '123': 'UN' }, 103, { '123': 5 });
    expect(row.margem).toBe('of:=IF([.E4]=0;"";(([.E4]-[.F4])/[.E4])*100)');

    const [, segunda] = buildSpreadsheetRows(items, tipos, 103, { '123': 5, '456': 7.5 });
    expect(segunda.margem).toBe('of:=IF([.E5]=0;"";(([.E5]-[.F5])/[.E5])*100)');
  });

  it('sugestão é metade do custo, nunca abaixo de R$ 0,99', () => {
    expect(suggestedPrice(5)).toBe(2.5);
    expect(suggestedPrice(0.53)).toBe(0.99);
    expect(suggestedPrice(1)).toBe(0.99);
    expect(suggestedPrice(179.6884)).toBeCloseTo(89.8442, 4);
  });

  it('grava custo, sugestão e a fórmula de margem no XML da planilha', () => {
    const doc = parseContent(
      buildValidadeOdsContent(items, tipos, { date: new Date(2026, 9, 28), custos: { '123': 5, '456': 7.5 } }),
    );
    const rows = rowsOf(doc);

    const primeira = cellsOf(rows[3]);
    expect(cellValue(primeira[4])).toBe('5');
    expect(cellValue(primeira[5])).toBe('2.5');
    expect(primeira[6].getAttribute('table:formula')).toBe('of:=IF([.E4]=0;"";(([.E4]-[.F4])/[.E4])*100)');
    expect(cellValue(primeira[6])).toBe('50');

    const segunda = cellsOf(rows[4]);
    expect(cellValue(segunda[4])).toBe('7.5');
    expect(cellValue(segunda[5])).toBe('3.75');
    expect(segunda[6].getAttribute('table:formula')).toBe('of:=IF([.E5]=0;"";(([.E5]-[.F5])/[.E5])*100)');
  });

  it('usa os estilos de moeda e de porcentagem no arquivo', () => {
    const doc = parseContent(buildValidadeOdsContent(items, tipos, { custos: { '123': 5, '456': 7.5 } }));

    // PMZ e PREÇO SUGERIDO com formato de reais.
    expect(styleByName(doc, 'ceD4')?.getAttribute('style:data-style-name')).toBe('Nbrl');
    expect(styleByName(doc, 'ceD5')?.getAttribute('style:data-style-name')).toBe('Nbrl');
    // MARGEM em porcentagem e vermelho.
    expect(styleByName(doc, 'ceD6')?.getAttribute('style:data-style-name')).toBe('Npct');
    expect(styleProp(doc, 'ceD6', 'style:text-properties', 'fo:color')).toBe('#ff0000');
    expect(styleProp(doc, 'ceD6', 'style:text-properties', 'fo:font-weight')).toBe('bold');

    const moeda = Array.from(doc.getElementsByTagName('number:currency-style'))[0];
    expect(moeda?.getAttribute('style:name')).toBe('Nbrl');
    expect(moeda?.getElementsByTagName('number:currency-symbol')[0]?.textContent).toBe('R$');
    expect(
      moeda?.getElementsByTagName('number:number')[0]?.getAttribute('number:decimal-places'),
    ).toBe('2');

    const porcentagem = Array.from(doc.getElementsByTagName('number:number-style')).find(
      (style) => style.getAttribute('style:name') === 'Npct',
    );
    expect(
      porcentagem?.getElementsByTagName('number:number')[0]?.getAttribute('number:decimal-places'),
    ).toBe('0');
    expect(porcentagem?.getElementsByTagName('number:text')[0]?.textContent).toBe('%');
  });

  it('gera um .ods válido, legível por um leitor de planilhas', () => {
    const bytes = createValidadeOds(items, tipos, { custos: { '123': 5, '456': 7.5 } });

    // ZIP: primeira entrada é o mimetype, como o ODF exige.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(new TextDecoder().decode(bytes.slice(30, 38))).toBe('mimetype');

    const wb = XLSX.read(bytes, { type: 'array' });
    const sheet = wb.Sheets['Rebaixa'] as unknown as Record<string, { v?: unknown }>;

    expect(sheet['A1']?.v).toBe('DATA:');
    expect(sheet['C1']?.v).toBe('SOLICITAÇÃO DE REBAIXA / PERECÍVEIS');
    expect(sheet['E4']?.v).toBe(5);
    expect(sheet['F4']?.v).toBe(2.5);
    expect(sheet['E5']?.v).toBe(7.5);
    expect(sheet['F5']?.v).toBe(3.75);
  });

  it('aplica o piso de R$ 0,99 na planilha final', () => {
    const doc = parseContent(
      buildValidadeOdsContent(
        [{ ...items[1], codigo: '631612' }],
        { '631612': 'KG' },
        { custos: { '631612': 0.53 } },
      ),
    );
    const primeira = cellsOf(rowsOf(doc)[3]);

    expect(cellValue(primeira[4])).toBe('0.53');
    expect(cellValue(primeira[5])).toBe('0.99');
    expect(cellValue(primeira[6])).toBe('-86.7924528302');
  });
});
