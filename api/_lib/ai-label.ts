/**
 * Leitura de etiqueta por foto (Fase 1 — IA).
 *
 * Aqui fica a lógica pura: o prompt, o parse do JSON devolvido pelo modelo e a
 * normalização dos campos (EAN, data de validade, quantidade, tipo). A Function
 * `api/ai-assist.ts` só orquestra: chama o provedor, roda estas funções e
 * consulta o catálogo.
 *
 * Nada aqui importa o entrypoint da Function — os testes rodam direto neste
 * arquivo, como em `product-validation.ts`.
 */

/** Instrução de sistema: o modelo responde **apenas** JSON. */
export const LABEL_SYSTEM_PROMPT = [
  'Você lê etiquetas de produtos de supermercado (validade, código de barras, quantidade).',
  'Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código (```).',
  'Formato exato:',
  '{"ean": string|null, "codigo": string|null, "descricao": string|null, "validade": string|null, "quantidade": number|null, "tipo": string|null, "confianca": number}',
  'Regras:',
  '- "ean": dígitos do código de barras (8 a 14 dígitos). Sem código de barras legível, use null.',
  '- "codigo": código interno do produto, se estiver impresso e for numérico. Caso contrário, null.',
  '- "descricao": nome do produto como aparece na etiqueta.',
  '- "validade": data de vencimento (ou "conservar até"/"val. até") no formato AAAA-MM-DD. Sem data legível, null.',
  '- "quantidade": quantidade de unidades da embalagem (inteiro). Não confunda com o peso. Se não der para saber, null.',
  '- "tipo": "KG" se o produto for vendido a peso/balança, "UN" caso contrário. Se não souber, null.',
  '- "confianca": número entre 0 e 1 com sua certeza na leitura.',
].join('\n');

/** Pergunta enviada junto da foto. */
export const LABEL_PROMPT = [
  'Leia a etiqueta desta foto e extraia os dados do produto.',
  'Se a foto não mostrar uma etiqueta, devolva todos os campos como null e "confianca": 0.',
].join(' ');

export interface LabelReading {
  /** Código de barras lido (dígitos). */
  ean: string | null;
  /** Código interno lido. */
  codigo: string | null;
  /** Descrição lida na etiqueta. */
  descricao: string | null;
  /** Validade no formato `AAAA-MM-DD`. */
  validade: string | null;
  /** Quantidade de unidades da embalagem. */
  quantidade: number | null;
  /** `KG` ou `UN`. */
  tipo: 'KG' | 'UN' | null;
  /** Confiança do modelo (0 a 1). */
  confianca: number;
  /** Avisos para o usuário (o que não foi lido com segurança). */
  avisos: string[];
}

const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Data real no formato `AAAA-MM-DD` (rejeita 31/02 e afins). */
function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Extrai a data de validade de um texto livre.
 *
 * Aceita `AAAA-MM-DD`, `DD/MM/AAAA`, `DD-MM-AA`, `DD.MM.AAAA` e datas por
 * extenso (`12 de março de 2027`). Em data ambígua (`03/04/2027`) vale o padrão
 * brasileiro: dia primeiro.
 */
export function parseExpiryDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  const iso = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const parsed = toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (parsed) return parsed;
  }

  const dayFirst = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dayFirst) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    let year = Number(dayFirst[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    // 03/04/2027 é dia/mês no padrão brasileiro; 04/03/2027 também.
    const parsed = first > 12
      ? toIsoDate(year, second, first)
      : second > 12
        ? toIsoDate(year, first, second)
        : toIsoDate(year, second, first);
    if (parsed) return parsed;
  }

  const extenso = text.match(/(\d{1,2})\s*(?:de\s*)?([a-zç]+)\s*(?:de\s*)?(\d{4})/i);
  if (extenso) {
    const nome = extenso[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const month = MESES_PT[nome];
    if (month) {
      const parsed = toIsoDate(Number(extenso[3]), month, Number(extenso[1]));
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Extrai um identificador numérico (EAN/código) de um texto. */
export function parseIdentifier(value: unknown, minDigits = 6): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const text = String(Math.trunc(value));
    return /^\d+$/.test(text) && text.length >= minDigits ? text : null;
  }
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (!digits || digits.length < minDigits || digits.length > 14) return null;
  return digits;
}

/** Normaliza o tipo do produto (`KG`/`UN`), inferindo pelo texto quando preciso. */
export function parseTipo(value: unknown, description?: string | null): 'KG' | 'UN' | null {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (/^(KG|KILO|KILOS|QUILO|QUILOS|BALANCA|BALANÇA)$/.test(raw)) return 'KG';
  if (/^(UN|UNID|UNIDADE|UNIDADES|PC|PC[E|.]?)$/.test(raw)) return 'UN';
  const text = `${raw} ${description ?? ''}`.toUpperCase();
  if (/\b(KG|KILO|KILOS|QUILO|QUILOS)\b/.test(text)) return 'KG';
  if (/\b(UN|UNIDADE|UNIDADES)\b/.test(text)) return 'UN';
  return null;
}

/** Converte a confiança do modelo em número entre 0 e 1. */
export function parseConfidence(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value > 1 ? value / 100 : value));
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'alta' || text === 'high') return 0.9;
    if (text === 'media' || text === 'média' || text === 'medium') return 0.6;
    if (text === 'baixa' || text === 'low') return 0.3;
    const parsed = Number(text.replace(',', '.'));
    if (Number.isFinite(parsed)) return Math.min(1, Math.max(0, parsed));
  }
  return 0.5;
}

/** Extrai o primeiro objeto JSON de um texto que pode ter cercas ou comentários. */
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
 * Normaliza a resposta do modelo em dados prontos para o formulário.
 *
 * Não confia em nada: cada campo é validado e o que não pôde ser lido vira
 * aviso (a pessoa preenche na mão).
 */
export function normalizeLabel(raw: unknown): LabelReading {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const avisos: string[] = [];

  const ean = parseIdentifier(source.ean);
  if (!ean && source.ean != null) avisos.push('Código de barras não foi identificado com segurança.');

  const codigo = parseIdentifier(source.codigo, 1);
  if (codigo && codigo.length > 14) avisos.push('Código interno inválido.');

  const descricaoRaw = typeof source.descricao === 'string' ? source.descricao.trim() : '';
  const descricao = descricaoRaw ? descricaoRaw.toUpperCase().slice(0, 150) : null;

  const validade = parseExpiryDate(source.validade);
  if (!validade && source.validade != null) avisos.push('Data de validade não foi reconhecida — confirme a data.');

  const quantidadeRaw = Number(source.quantidade);
  const quantidade = Number.isFinite(quantidadeRaw) && quantidadeRaw >= 1
    ? Math.min(100000, Math.trunc(quantidadeRaw))
    : null;
  if (!quantidade && source.quantidade != null) avisos.push('Quantidade não foi reconhecida — informe a quantidade.');

  const tipo = parseTipo(source.tipo, descricao);

  return {
    ean,
    codigo: codigo && codigo.length <= 14 ? codigo : null,
    descricao,
    validade,
    quantidade,
    tipo,
    confianca: parseConfidence(source.confianca),
    avisos,
  };
}

export interface CatalogProduct {
  ean?: string | number | null;
  codigo?: string | number | null;
  descricao?: string | null;
  tipo?: string | null;
}

/**
 * Junta a leitura da etiqueta com o produto do catálogo.
 *
 * O catálogo manda em código, descrição e tipo (a etiqueta pode estar suja);
 * a leitura da IA só entra no que o catálogo não tem.
 */
export function mergeLabelWithProduct(
  label: LabelReading,
  product: CatalogProduct | null,
): { ean: string | null; codigo: string | null; descricao: string | null; tipo: 'KG' | 'UN' | null } {
  const catalogEan = product?.ean != null ? String(product.ean) : null;
  const catalogCodigo = product?.codigo != null ? String(product.codigo) : null;
  const catalogDescricao = typeof product?.descricao === 'string' ? product.descricao.trim() : '';
  const catalogTipo = parseTipo(product?.tipo ?? null, catalogDescricao);

  return {
    ean: catalogEan ?? label.ean,
    codigo: catalogCodigo ?? label.codigo,
    descricao: catalogDescricao ? catalogDescricao.toUpperCase() : label.descricao,
    tipo: catalogTipo ?? label.tipo,
  };
}
