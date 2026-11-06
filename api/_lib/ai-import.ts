/**
 * Importação assistida (Fase 1 — IA).
 *
 * A IA **não** reescreve a planilha: ela propõe o mapeamento das colunas e
 * aponta os problemas. O código aplica o mapeamento de forma determinística
 * (`src/lib/ai-import.ts`) e mostra uma prévia antes de gravar.
 *
 * Este arquivo é a parte server-side (prompt + validação do mapeamento).
 */

export type ImportTarget = 'consulta' | 'meta' | 'venda';

/** Alvos de importação suportados pela tela Base de Dados. */
export const IMPORT_TARGETS: ImportTarget[] = ['consulta', 'meta', 'venda'];

/** Campos esperados por alvo (a mesma lista vive em `src/lib/ai-import.ts`). */
export const IMPORT_FIELDS: Record<ImportTarget, string[]> = {
  consulta: ['codigo', 'descricao', 'estoque', 'preco'],
  meta: ['dia', 'meta'],
  venda: ['dia', 'venda'],
};

/** Nome legível do alvo (usado no prompt). */
export function importTargetLabel(target: ImportTarget): string {
  if (target === 'consulta') return 'Planilha de Consulta (código, descrição, estoque, preço)';
  if (target === 'meta') return 'Planilha de Meta (dia do mês, meta em R$)';
  return 'Planilha de Realizado (dia do mês, venda em R$)';
}

/** Monta o prompt de revisão (cabeçalhos + poucas linhas de exemplo). */
export function buildImportPrompt(
  target: ImportTarget,
  headers: string[],
  samples: string[][],
): { system: string; prompt: string } {
  const system = [
    'Você ajuda a mapear colunas de planilhas de supermercado para um sistema de inventário.',
    'Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código (```).',
    'Formato exato:',
    '{"mapa": {"campo": numero_da_coluna}, "avisos": ["texto curto"], "confianca": number}',
    'Regras:',
    '- "mapa": campo esperado -> índice da coluna (começando em 0). Só inclua campos que você conseguiu identificar.',
    '- Use o nome do campo exatamente como aparece na lista de campos esperados.',
    '- "avisos": problemas que você percebeu (colunas faltando, formato de número diferente, datas, duplicidades, coluna de total, etc.).',
    '- "confianca": número entre 0 e 1.',
  ].join('\n');

  const headerList = headers.map((header, index) => `${index}: ${header || '(sem título)'}`).join('\n');
  const sampleList = samples
    .map((row, rowIndex) => `${rowIndex}: ${row.map((cell) => (cell === '' ? '-' : cell)).join(' | ')}`)
    .join('\n');

  const prompt = [
    `Alvo: ${importTargetLabel(target)}`,
    'Campos esperados:',
    IMPORT_FIELDS[target].map((field) => `- ${field}`).join('\n'),
    '',
    'Cabeçalhos da planilha:',
    headerList || '(a planilha não tem cabeçalho)',
    '',
    'Primeiras linhas (separadas por |):',
    sampleList || '(sem linhas de exemplo)',
  ].join('\n');

  return { system, prompt };
}

/** Extrai o primeiro objeto JSON de um texto (mesma técnica da leitura de etiqueta). */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```json/gi, '```').replace(/```/g, ' ').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(cleaned.slice(start, index + 1));
          return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Mantém só o mapeamento utilizável: campos esperados, índice inteiro e
 * dentro da quantidade de colunas informadas.
 */
export function sanitizeMapping(
  target: ImportTarget,
  mapping: unknown,
  headerCount: number,
): Record<string, number> {
  const allowed = IMPORT_FIELDS[target] ?? [];
  const result: Record<string, number> = {};
  if (!mapping || typeof mapping !== 'object') return result;
  for (const [field, value] of Object.entries(mapping as Record<string, unknown>)) {
    if (!allowed.includes(field)) continue;
    const index = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= headerCount) continue;
    result[field] = index;
  }
  return result;
}

/** Lê a revisão do modelo: `{ mapa, avisos, confianca }`. */
export function parseImportReview(
  text: string,
  target: ImportTarget,
  headerCount: number,
): { mapping: Record<string, number>; avisos: string[]; confianca: number } | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const rawAvisos = Array.isArray(parsed.avisos) ? parsed.avisos : [];
  const avisos = rawAvisos
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
  const confiancaRaw = Number(parsed.confianca);
  const confianca = Number.isFinite(confiancaRaw)
    ? Math.min(1, Math.max(0, confiancaRaw > 1 ? confiancaRaw / 100 : confiancaRaw))
    : 0.5;
  return {
    mapping: sanitizeMapping(target, parsed.mapa, headerCount),
    avisos,
    confianca,
  };
}
