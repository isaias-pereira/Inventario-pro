/**
 * Importação assistida — parte do cliente (Fase 1).
 *
 * A IA (quando configurada) propõe o mapeamento das colunas; este módulo
 * **aplica** o mapeamento de forma determinística e avisa sobre linhas
 * suspeitas. Sem IA, o `guessMapping` (heurística por nome de cabeçalho)
 * mantém a importação funcionando como sempre.
 *
 * A lista de campos é a mesma do servidor (`api/_lib/ai-import.ts`) — o teste
 * `src/test/ai-import.test.ts` trava essa equivalência.
 */

export type ImportTarget = 'consulta' | 'meta' | 'venda';

export interface ImportField {
  /** Chave usada no item final. */
  key: string;
  /** Nome exibido ao usuário. */
  label: string;
  /** Cabeçalhos alternativos que já sabemos identificar. */
  aliases: string[];
  /** Campo sem o qual a linha não serve. */
  required: boolean;
}

export const IMPORT_FIELDS: Record<ImportTarget, ImportField[]> = {
  consulta: [
    { key: 'codigo', label: 'Código', aliases: ['codigo', 'cod', 'cod_produto', 'codigo_produto', 'codigo_interno', 'sku'], required: true },
    { key: 'descricao', label: 'Descrição', aliases: ['descricao', 'produto', 'nome', 'item', 'descricao_produto'], required: true },
    { key: 'estoque', label: 'Estoque', aliases: ['estoque', 'qtd', 'quantidade', 'saldo', 'estoque_atual', 'quantidade_estoque'], required: false },
    { key: 'preco', label: 'Preço', aliases: ['preco', 'preco_venda', 'valor', 'vlr', 'p_venda', 'preco_de_venda'], required: false },
  ],
  meta: [
    { key: 'dia', label: 'Dia', aliases: ['dia', 'data', 'dt', 'dia_mes'], required: true },
    { key: 'meta', label: 'Meta (R$)', aliases: ['meta', 'meta_r', 'objetivo', 'alvo', 'meta_dia'], required: true },
  ],
  venda: [
    { key: 'dia', label: 'Dia', aliases: ['dia', 'data', 'dt', 'dia_mes'], required: true },
    { key: 'venda', label: 'Venda (R$)', aliases: ['venda', 'realizado', 'faturamento', 'valor_total', 'vlr_total', 'venda_dia'], required: true },
  ],
};

export interface ImportWarning {
  nivel: 'erro' | 'aviso';
  mensagem: string;
  /** Número da linha na planilha (1 = primeira linha de dados). */
  linha?: number;
}

export interface ImportResult<T = unknown> {
  itens: T[];
  avisos: ImportWarning[];
  /** Linhas ignoradas (vazias ou sem os campos obrigatórios). */
  ignoradas: number;
}

/** Normaliza um cabeçalho: minúsculas, sem acentos, só letras e números. */
export function normalizeHeader(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Procura a linha de cabeçalho da planilha.
 *
 * Devolve o índice da linha de cabeçalho ou -1 quando a planilha já começa
 * pelos dados (o formato que a tela usava antes).
 */
export function findHeaderRow(rows: unknown[][], target: ImportTarget): number {
  const fields = IMPORT_FIELDS[target] ?? [];
  const limit = Math.min(3, rows.length);
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    if (!row || !Array.isArray(row)) continue;
    const normalized = row.map((cell) => normalizeHeader(cell));
    const hits = fields.filter((field) =>
      field.aliases.some((alias) => normalized.includes(normalizeHeader(alias))),
    ).length;
    if (hits >= 2) return index;
  }
  return -1;
}

/**
 * Mapeamento automático por nome de cabeçalho (não usa IA).
 *
 * Primeiro tenta o nome exato; depois, um cabeçalho que contém o apelido. Cada
 * coluna é usada uma única vez.
 */
export function guessMapping(target: ImportTarget, headers: string[]): Record<string, number> {
  const fields = IMPORT_FIELDS[target] ?? [];
  const normalized = headers.map((header) => normalizeHeader(header));
  const used = new Set<number>();
  const mapping: Record<string, number> = {};

  for (const field of fields) {
    const aliases = field.aliases.map((alias) => normalizeHeader(alias));
    let found = -1;
    for (const alias of aliases) {
      const index = normalized.findIndex((header, position) => header === alias && !used.has(position));
      if (index >= 0) { found = index; break; }
    }
    if (found < 0) {
      for (const alias of aliases) {
        const index = normalized.findIndex(
          (header, position) => !used.has(position) && header.length > 2 && (header.includes(alias) || alias.includes(header)),
        );
        if (index >= 0) { found = index; break; }
      }
    }
    if (found >= 0) {
      mapping[field.key] = found;
      used.add(found);
    }
  }

  return mapping;
}

/** Número em formato brasileiro (`1.234,56`) ou americano (`1,234.56`). */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let text = String(value).trim().replace(/r\$/gi, '').replace(/\s/g, '').replace(/%/g, '');
  if (!text) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // O separador mais à direita é o decimal.
    if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (comma >= 0) {
    text = text.replace(',', '.');
  } else if (dot >= 0) {
    const parts = text.split('.');
    const last = parts[parts.length - 1];
    // "1.234" com 3 casas é separador de milhar; "12.50" é decimal.
    if (parts.length === 2 && last.length === 3 && Number(parts[0]) <= 999) text = parts.join('');
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Dia do mês: aceita data, número e serial do Excel. */
export function parseDay(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getDate();
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Só números grandes podem ser serial do Excel; entre 32 e 1000 é um dia
    // inválido (e não uma data).
    if (value > 1000) {
      const excel = new Date((value - 25569) * 86400000);
      return excel.getDate();
    }
    return Math.round(value);
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return Number(iso[3]);
  const br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) return Number(br[1]);
  const number = Number(text.replace(',', '.'));
  if (!Number.isFinite(number)) return null;
  return parseDay(number);
}

function cell(row: unknown[], index: number | undefined): unknown {
  if (index == null || index < 0 || index >= row.length) return null;
  return row[index];
}

function isEmptyRow(row: unknown[]): boolean {
  return !row || row.every((value) => value == null || String(value).trim() === '');
}

/**
 * Aplica o mapeamento e devolve os itens prontos para gravar, com os avisos.
 *
 * Nenhuma linha é gravada aqui: quem grava é a tela Base de Dados, depois da
 * prévia.
 */
export function applyMapping<T = unknown>(
  target: ImportTarget,
  rows: unknown[][],
  mapping: Record<string, number>,
): ImportResult<T> {
  const fields = IMPORT_FIELDS[target] ?? [];
  const avisos: ImportWarning[] = [];
  const itens: T[] = [];
  let ignoradas = 0;

  for (const field of fields) {
    if (field.required && mapping[field.key] == null) {
      avisos.push({ nivel: 'erro', mensagem: `Coluna "${field.label}" não foi identificada na planilha.` });
    }
  }

  const seenCodes = new Set<string>();

  rows.forEach((row, index) => {
    if (isEmptyRow(row)) return;
    const line = index + 1;

    if (target === 'consulta') {
      const codigo = String(cell(row, mapping.codigo) ?? '').trim();
      const descricao = String(cell(row, mapping.descricao) ?? '').trim();
      const estoqueRaw = cell(row, mapping.estoque);
      const precoRaw = cell(row, mapping.preco);

      if (!codigo && !descricao) { ignoradas += 1; return; }
      if (!codigo) {
        avisos.push({ nivel: 'erro', mensagem: 'Linha sem código.', linha: line });
        ignoradas += 1;
        return;
      }
      if (!descricao) {
        avisos.push({ nivel: 'aviso', mensagem: `Linha ${codigo} sem descrição.`, linha: line });
      }
      if (seenCodes.has(codigo)) {
        avisos.push({ nivel: 'aviso', mensagem: `Código ${codigo} repetido — a última linha vale.`, linha: line });
      }
      seenCodes.add(codigo);

      const estoque = estoqueRaw == null || String(estoqueRaw).trim() === '' ? 0 : parseNumber(estoqueRaw);
      const preco = precoRaw == null || String(precoRaw).trim() === '' ? 0 : parseNumber(precoRaw);
      if (estoqueRaw != null && String(estoqueRaw).trim() !== '' && estoque === null) {
        avisos.push({ nivel: 'aviso', mensagem: `Estoque inválido na linha do código ${codigo}.`, linha: line });
      }
      if (precoRaw != null && String(precoRaw).trim() !== '' && preco === null) {
        avisos.push({ nivel: 'aviso', mensagem: `Preço inválido na linha do código ${codigo}.`, linha: line });
      }

      itens.push({
        codigo,
        descricao,
        estoque: estoque ?? 0,
        preco: preco ?? 0,
      } as unknown as T);
      return;
    }

    const diaRaw = cell(row, mapping.dia);
    const valueRaw = target === 'meta' ? cell(row, mapping.meta) : cell(row, mapping.venda);
    const dia = parseDay(diaRaw);
    const value = parseNumber(valueRaw);

    if (diaRaw == null || String(diaRaw).trim() === '') { ignoradas += 1; return; }
    if (dia == null || dia < 1 || dia > 31) {
      avisos.push({ nivel: 'erro', mensagem: `Dia inválido ("${String(diaRaw).trim()}").`, linha: line });
      ignoradas += 1;
      return;
    }
    if (value == null) {
      avisos.push({ nivel: 'erro', mensagem: `Valor inválido no dia ${dia}.`, linha: line });
      ignoradas += 1;
      return;
    }
    if (value < 0) {
      avisos.push({ nivel: 'aviso', mensagem: `Valor negativo no dia ${dia}.`, linha: line });
    }

    itens.push((target === 'meta' ? { dia, meta: value } : { dia, venda: value }) as unknown as T);
  });

  return { itens, avisos, ignoradas };
}
