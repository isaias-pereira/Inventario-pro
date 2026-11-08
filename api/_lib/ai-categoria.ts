/**
 * Revisão da classificação de produtos por IA (Fase 3).
 *
 * A IA **não** decide a seção: ela propõe. O código valida a proposta contra a
 * taxonomia (`categoria`) e a pessoa confere antes de gravar — a gravação usa a
 * action `set_categoria` do `query-product`, de forma determinística.
 *
 * Este arquivo é a parte server-side (prompt + validação da resposta).
 */

/** Seção da taxonomia (categoria). */
export interface SecaoTaxonomia {
  codigo: string;
  secao: string;
}

/** Produto aguardando revisão. */
export interface CandidatoSecao {
  codigo: string;
  descricao: string;
  secaoAtual: string | null;
}

/** Proposta da IA para um produto (validada contra a taxonomia). */
export interface PropostaSecao {
  codigo: string;
  descricao: string;
  secaoAtual: string | null;
  /** Nome oficial da seção proposta. */
  secao: string;
  /** Código da seção proposta (`categoria.codigo`). */
  secaoCodigo: string;
  /** Confiança declarada pelo modelo (0 a 1). */
  confianca: number;
}

/** Seção genérica: nunca entra como proposta (é justamente o que se quer corrigir). */
export const SECAO_OUTROS = 'Outros';

/**
 * Limite de produtos por lote de revisão.
 *
 * Medido com o modelo padrão (`nemotron-3.5-super-vl-120b-a12b`):
 * 12 itens → 28 s, 20 itens → 22 s, 30 itens → 45 s (e 50 itens estoura o
 * teto de tokens). O padrão de 20 deixa folga dentro do timeout de 55 s do
 * cliente e do `maxDuration: 60` da Function.
 */
export const MAX_CANDIDATOS = 30;
export const CANDIDATOS_PADRAO = 20;

/**
 * Teto de tokens da resposta da revisão.
 *
 * O modelo é raciocinador: gasta quase tudo pensando. Com 4096 tokens ele
 * terminava o raciocínio sem responder (`finish_reason: length`) a partir de
 * 20 produtos — 8192 deixa sobrar a resposta.
 */
export const CATEGORIA_MAX_TOKENS = 8192;

/**
 * Monta o prompt da revisão.
 *
 * O modelo recebe a taxonomia completa e a lista de produtos (código,
 * descrição e seção atual) e devolve um JSON com as propostas.
 */
export function buildCategoriaPrompt(
  candidatos: CandidatoSecao[],
  secoes: SecaoTaxonomia[],
): { system: string; prompt: string } {
  const system = [
    'Você revisa a classificação de produtos de uma mercearia em seções.',
    'Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código (```).',
    'Formato exato:',
    '{"propostas": [{"codigo": "123", "secao": "Nome da seção", "confianca": 0.9}], "avisos": ["texto curto"]}',
    'Regras:',
    '- "propostas": uma entrada por produto classificado. "codigo" é o código do produto, exatamente como aparece na lista de produtos.',
    '- "secao": o nome exato de uma das seções da lista de seções.',
    `- Não proponha a seção "${SECAO_OUTROS}": ela é a seção genérica dos produtos sem classificação melhor.`,
    '- Não proponha mais de uma seção para o mesmo produto.',
    '- Se um produto não couber com segurança em nenhuma seção, não o inclua na resposta.',
    '- "confianca": número entre 0 e 1 (0.9 = muito claro, 0.5 = duvidoso).',
    '- "avisos": observações curtas sobre os produtos ambíguos (opcional).',
  ].join('\n');

  const listaSecoes = secoes
    .map((item) => `- ${item.secao}`)
    .join('\n');

  const listaProdutos = candidatos
    .map((item) => `${item.codigo} | ${item.descricao} | atual: ${item.secaoAtual ?? 'sem seção'}`)
    .join('\n');

  const prompt = [
    'Seções disponíveis:',
    listaSecoes || '(sem seções)',
    '',
    'Produtos para revisar (código | descrição | seção atual):',
    listaProdutos || '(sem produtos)',
  ].join('\n');

  return { system, prompt };
}

/** Normaliza um nome de seção para comparar (espaços e caixa). */
function normalizaNome(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve o nome da seção proposta na taxonomia.
 *
 * Devolve `null` quando a seção não existe (a IA inventou um nome) — nesse
 * caso a proposta é descartada, não gravada.
 */
export function resolveSecao(nome: unknown, secoes: SecaoTaxonomia[]): SecaoTaxonomia | null {
  if (typeof nome !== 'string') return null;
  const alvo = normalizaNome(nome);
  if (!alvo) return null;
  return secoes.find((item) => normalizaNome(item.secao) === alvo) ?? null;
}

/** Lê a revisão do modelo e mantém só as propostas utilizáveis. */
export function parseCategoriaReview(
  text: string,
  candidatos: CandidatoSecao[],
  secoes: SecaoTaxonomia[],
): { propostas: PropostaSecao[]; avisos: string[] } | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  const porCodigo = new Map(candidatos.map((item) => [item.codigo, item]));
  const rawPropostas = Array.isArray(parsed.propostas) ? parsed.propostas : [];
  const propostas: PropostaSecao[] = [];
  const vistas = new Set<string>();

  for (const raw of rawPropostas) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const codigo = String(item.codigo ?? '').trim();
    if (!codigo || vistas.has(codigo)) continue;
    const candidato = porCodigo.get(codigo);
    if (!candidato) continue;

    const secao = resolveSecao(item.secao, secoes);
    if (!secao) continue;
    // "Outros" é a seção genérica: a revisão existe para tirá-lo de lá.
    if (normalizaNome(secao.secao) === normalizaNome(SECAO_OUTROS)) continue;

    const confiancaRaw = Number(item.confianca);
    const confianca = Number.isFinite(confiancaRaw)
      ? Math.min(1, Math.max(0, confiancaRaw > 1 ? confiancaRaw / 100 : confiancaRaw))
      : 0.5;

    vistas.add(codigo);
    propostas.push({
      codigo,
      descricao: candidato.descricao,
      secaoAtual: candidato.secaoAtual,
      secao: secao.secao,
      secaoCodigo: secao.codigo,
      confianca,
    });
  }

  const rawAvisos = Array.isArray(parsed.avisos) ? parsed.avisos : [];
  const avisos = rawAvisos
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);

  return { propostas, avisos };
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
