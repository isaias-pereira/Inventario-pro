/**
 * Ponto de entrada da IA no SGS-PRO (Fase 1).
 *
 * Tudo server-side: a chave (`NVIDIA_API_KEY`) vive nas variáveis de ambiente
 * da Vercel e nunca chega ao navegador. O frontend chama por `invokeFunction`,
 * como nas demais rotas.
 *
 * Ações (POST):
 * - `config`: devolve `{ enabled, model }` — o cliente usa para avisar quando a
 *   IA está indisponível (e esconder/limitar os botões que dependem dela);
 * - `read_label`: lê a foto de uma etiqueta e devolve EAN, validade,
 *   quantidade, descrição e tipo, já cruzados com o catálogo;
 * - `import_review`: propõe o mapeamento de colunas de uma planilha e aponta
 *   os problemas (admin only).
 *
 * Regra do projeto: **sem IA, o app continua funcionando**. Se a chave faltar
 * ou o provedor cair, a função responde 503 e a tela segue no fluxo manual.
 */

import { createSql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { identifier } from './_lib/product-validation.js';
import { aiConfigured, aiModel, callAi, isSupportedImageMime, type AiError, type AiResult } from './_lib/ai.js';
import {
  LABEL_PROMPT,
  LABEL_SYSTEM_PROMPT,
  mergeLabelWithProduct,
  normalizeLabel,
  parseJsonObject,
} from './_lib/ai-label.js';
import {
  buildImportPrompt,
  parseImportReview,
  IMPORT_TARGETS,
  type ImportTarget,
} from './_lib/ai-import.js';

/** Cache em memória (por instância quente): evita pagar a mesma foto duas vezes. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 40;
const cache = new Map<string, { at: number; payload: unknown }>();

function cacheGet(key: string): unknown {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key: string, payload: unknown): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { at: Date.now(), payload });
}

/** Só administradores importam planilhas (Base de Dados é área do admin). */
function canImport(role: unknown): boolean {
  return role === 'admin';
}

/**
 * Log de consumo por chamada (acompanhar custo/latência nas logs da Vercel).
 * Não guarda nenhum dado do usuário — só modelo e contagem de tokens.
 */
function logAiUsage(action: string, result: AiResult): void {
  console.log(
    `[ai] ${action} model=${result.model} in=${result.usage.inputTokens} out=${result.usage.outputTokens} tokens`,
  );
}

/** Busca o produto no catálogo pelo EAN (mestre, alias ou embalagem fechada). */
async function findProductByEan(sql: ReturnType<typeof createSql>, ean: string) {
  const rows = await sql(
    `SELECT p.ean::text, p.codigo::text, p.descricao, p.tipo
       FROM public.produto p
      WHERE p.ean=$1::bigint
         OR p.codigo IN (SELECT produto_codigo FROM public.produto_eans WHERE ean=$1::bigint)
         OR p.codigo IN (SELECT produto_codigo FROM public.produto_embalagens WHERE ean_fechado=$1::bigint)
      LIMIT 1`,
    [ean],
  );
  return rows[0] ?? null;
}

/** Busca o produto no catálogo pelo código interno. */
async function findProductByCodigo(sql: ReturnType<typeof createSql>, codigo: string) {
  const rows = await sql(
    `SELECT p.ean::text, p.codigo::text, p.descricao, p.tipo
       FROM public.produto p
      WHERE p.codigo=$1::bigint
         OR p.codigo IN (SELECT produto_codigo FROM public.produto_codigos WHERE codigo=$1::bigint)
      LIMIT 1`,
    [codigo],
  );
  return rows[0] ?? null;
}

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const body = await readJsonBody<Record<string, unknown>>(req);
    const action = String(body.action ?? '');

    // CONFIGURAÇÃO — o cliente pergunta se a IA está disponível.
    if (action === 'config') {
      sendJson(res, { enabled: aiConfigured(), model: aiModel() });
      return;
    }
    if (action === 'read_label') {
      if (!aiConfigured()) {
        sendJson(res, { error: 'Leitura por foto indisponível: a IA não está configurada neste ambiente.' }, 503);
        return;
      }

      const image = typeof body.image === 'string' ? body.image.trim() : '';
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
      if (!image) {
        sendJson(res, { error: 'Nenhuma imagem foi enviada.' }, 400);
        return;
      }
      if (!isSupportedImageMime(mimeType)) {
        sendJson(res, { error: 'Formato de imagem não suportado (use JPEG ou PNG).' }, 400);
        return;
      }

      const cacheKey = `label:${mimeType}:${image.length}:${image.slice(-64)}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        sendJson(res, cached);
        return;
      }

      const result = await callAi({
        system: LABEL_SYSTEM_PROMPT,
        prompt: LABEL_PROMPT,
        image: { base64: image, mimeType },
        // Extração de dados: raciocínio baixo e temperatura mínima (medido:
        // `low` usa ~55% menos tokens que o padrão, com a mesma leitura).
        reasoningEffort: 'low',
        maxTokens: 2048,
        temperature: 0.1,
      });
      logAiUsage('read_label', result);

      const raw = parseJsonObject(result.text);
      if (!raw) {
        sendJson(res, { error: 'A IA não devolveu uma leitura válida. Tente outra foto.' }, 502);
        return;
      }

      const label = normalizeLabel(raw);
      const sql = createSql();

      const eanKey = identifier(label.ean);
      const codigoKey = identifier(label.codigo);
      let product = eanKey ? await findProductByEan(sql, eanKey) : null;
      if (!product && codigoKey) product = await findProductByCodigo(sql, codigoKey);

      const merged = mergeLabelWithProduct(label, product);
      const avisos = [...label.avisos];
      if (!product) {
        avisos.push('Produto não encontrado no catálogo: confira o código e consulte manualmente.');
      }
      if (label.confianca < 0.6) {
        avisos.push('Leitura com baixa confiança: confira os dados antes de registrar.');
      }

      const payloadOut = {
        label: { ...label, ...merged },
        produto: product
          ? {
            ean: product.ean != null ? String(product.ean) : merged.ean,
            codigo: product.codigo != null ? String(product.codigo) : merged.codigo,
            descricao: merged.descricao,
            tipo: product.tipo ?? merged.tipo,
          }
          : null,
        avisos,
        model: result.model,
      };

      cacheSet(cacheKey, payloadOut);
      sendJson(res, payloadOut);
      return;
    }

    if (action === 'import_review') {
      if (!canImport(payload.role)) {
        sendJson(res, { error: 'Apenas administradores podem revisar importações.' }, 403);
        return;
      }
      if (!aiConfigured()) {
        sendJson(res, { error: 'Revisão por IA indisponível: a IA não está configurada neste ambiente.' }, 503);
        return;
      }

      const target = String(body.target ?? '') as ImportTarget;
      if (!IMPORT_TARGETS.includes(target)) {
        sendJson(res, { error: 'Tipo de importação inválido.' }, 400);
        return;
      }

      const headers = Array.isArray(body.headers)
        ? body.headers.filter((item): item is string => typeof item === 'string').slice(0, 40)
        : [];
      const samples = Array.isArray(body.samples)
        ? (body.samples as unknown[])
          .filter((row): row is unknown[] => Array.isArray(row))
          .slice(0, 8)
          .map((row) => row.slice(0, 20).map((cell) => (cell == null ? '' : String(cell).slice(0, 120))))
        : [];

      if (headers.length === 0) {
        sendJson(res, { error: 'A planilha não tem cabeçalho para revisar.' }, 400);
        return;
      }

      const { system, prompt } = buildImportPrompt(target, headers, samples);
      const result = await callAi({
        system,
        prompt,
        reasoningEffort: 'low',
        maxTokens: 1200,
        temperature: 0.1,
      });
      logAiUsage('import_review', result);
      const review = parseImportReview(result.text, target, headers.length);
      if (!review) {
        sendJson(res, { error: 'A IA não devolveu uma revisão válida. O mapeamento automático foi mantido.' }, 502);
        return;
      }

      sendJson(res, { ...review, model: result.model });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    const known = error as AiError;
    console.error('AI assist error:', known?.message ?? 'Unknown error');
    const status = typeof known?.status === 'number' ? known.status : 500;
    sendJson(res, { error: known?.message ?? 'Erro interno do servidor' }, status);
  }
};

export default handler;
