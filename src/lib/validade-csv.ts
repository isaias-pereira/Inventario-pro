/**
 * Exportação da planilha de rebaixa em CSV.
 *
 * O Chromium (Chrome do Android, Edge, Samsung Internet) só aceita anexar
 * arquivos de uma allowlist fixa: PDF, imagens, áudio, vídeo e alguns textos
 * — entre eles `text/csv`. `.ods` e `.xlsx` são recusados pelo navegador, então
 * o CSV é o formato que chega ao Thunderbird como planilha de verdade,
 * abrindo direto no LibreOffice Calc e no Excel.
 *
 * O arquivo usa o padrão brasileiro: separador `;`, decimal `,` e BOM UTF-8
 * (para o Excel reconhecer os acentos).
 */

import {
  buildSpreadsheetRows,
  DEFAULT_STORE,
  type CustoMap,
  type TipoMap,
  type ValidadeSpreadsheetItem,
} from './validade-spreadsheet';

export const CSV_MIME = 'text/csv';

/** Escapa um campo: aspas duplicadas e envelope quando há `;`, aspas ou quebra. */
function csvField(value: string): string {
  if (/[";\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Número no padrão brasileiro (vírgula decimal). */
function brNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Margem em %: ((custo - sugestão) / custo) * 100, como a fórmula do .ods. */
function marginPercent(custo: number, sugestao: number): number {
  if (!custo) return 0;
  return ((custo - sugestao) / custo) * 100;
}

/**
 * Monta a planilha de rebaixa em CSV (mesmas colunas do .ods).
 * A primeira linha é o cabeçalho, para o Calc/Excel reconhecerem as colunas.
 */
export function createValidadeCsv(
  items: ValidadeSpreadsheetItem[],
  tipos: TipoMap,
  options: { custos?: CustoMap; store?: number } = {},
): Uint8Array {
  const rows = buildSpreadsheetRows(items, tipos, options.store ?? DEFAULT_STORE, options.custos ?? {});

  const lines: string[] = [];
  lines.push(
    [
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
    ].join(';'),
  );

  for (const row of rows) {
    const temCusto = typeof row.pmz === 'number' && row.pmz > 0;
    const margem = temCusto
      ? brNumber(marginPercent(row.pmz as number, Number(row.precoSugerido)))
      : '';
    const fields = [
      String(row.loja),
      row.ean,
      row.codigo,
      row.descricao,
      temCusto ? brNumber(row.pmz as number) : '',
      temCusto ? brNumber(Number(row.precoSugerido)) : '',
      margem,
      row.vencimento,
      String(row.quantidade),
      row.descricaoOferta,
      row.precoFinalRebaxa,
      row.inicio,
      row.final,
    ];
    lines.push(fields.map(csvField).join(';'));
  }

  // BOM UTF-8 para o Excel abrir os acentos; CRLF para o Calc.
  const text = `\uFEFF${lines.join('\r\n')}\r\n`;
  return new TextEncoder().encode(text);
}

/** Nome do arquivo CSV com a data. */
export function csvFileName(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `solicitacao-rebaixa-${date.getFullYear()}-${month}-${day}.csv`;
}

/** Baixa o CSV no aparelho (para anexar manualmente no Thunderbird). */
export function saveValidadeCsv(bytes: Uint8Array, date = new Date()): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: CSV_MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = csvFileName(date);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
