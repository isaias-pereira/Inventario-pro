/**
 * Lista de rebaixa (rascunho + histórico).
 *
 * A Rebaixa é a lista que o encarregado monta com produtos vencendo, perdendo
 * qualidade ou em excesso e envia ao comercial. Regras:
 * - UN usa data de vencimento;
 * - KG usa motivo (Excesso, Qualidade ou Excesso/qualidade) e quantidade em kg;
 * - o preço sugerido é 50% do PMZ, com piso de R$ 0,99, e pode ser ajustado;
 * - ao enviar, os itens viram histórico (status `enviada` + lote) e o rascunho
 *   começa vazio.
 *
 * Ações (POST):
 * `list`, `add`, `add_many`, `update`, `remove`, `clear`, `mark_sent`,
 * `history`, `history_items`.
 *
 * Restrito a admin e encarregado.
 */

import { randomUUID } from 'node:crypto';
import { createSql, type Sql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { SECAO_COLUNAS, secaoJoin } from './_lib/categoria.js';
import { ensureLojaSchema, resolveLoja } from './_lib/loja.js';

export type RebaixaTipo = 'KG' | 'UN';

export const REBAIXA_ROLES = ['admin', 'encarregado'] as const;
export const MOTIVOS_REBAIXA = ['Excesso', 'Qualidade', 'Excesso/qualidade'] as const;

/** Fração do custo usada como preço sugerido e piso praticável. */
const SUGESTAO_FRACTION = 0.5;
const SUGESTAO_MINIMA = 0.99;

const MAX_ITEMS_PER_REQUEST = 200;
const MAX_IDS_PER_SEND = 500;

export function canUseRebaixa(role: unknown): boolean {
  return typeof role === 'string' && (REBAIXA_ROLES as readonly string[]).includes(role);
}

export function normalizeTipo(value: unknown): RebaixaTipo | null {
  if (typeof value !== 'string') return null;
  const tipo = value.trim().toUpperCase();
  return tipo === 'KG' || tipo === 'UN' ? tipo : null;
}

/** Motivo do rebaixa para produtos de balança (KG). Vazio ou nulo = sem motivo. */
export function normalizeMotivo(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const normalized = value.trim().toLowerCase();
  const found = MOTIVOS_REBAIXA.find((motivo) => motivo.toLowerCase() === normalized);
  return found ? { ok: true, value: found } : { ok: false };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  const clean = value.trim().replace(/[^\d.,-]/g, '');
  if (!clean) return Number.NaN;
  // Padrão brasileiro: ponto é separador de milhar e vírgula é decimal.
  if (clean.includes(',')) return Number(clean.replace(/\./g, '').replace(',', '.'));
  return Number(clean);
}

/** Quantidade positiva, com até 3 casas (kg fracionado). */
export function normalizeQuantity(value: unknown): number | null {
  const number = toNumber(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000) return null;
  return Math.round(number * 1000) / 1000;
}

/** Preço em reais; aceita vírgula ou ponto. `null`/vazio = sem preço. */
export function normalizePrice(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const number = toNumber(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) return { ok: false };
  return { ok: true, value: Math.round(number * 10000) / 10000 };
}

export function normalizeValidade(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return { ok: false };
  return { ok: true, value: new Date(ms).toISOString() };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Preço sugerido: metade do custo, nunca abaixo de R$ 0,99 (mesma regra da planilha). */
export function suggestedPriceFromCost(cost: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return SUGESTAO_MINIMA;
  return Math.max(Math.round(cost * SUGESTAO_FRACTION * 100) / 100, SUGESTAO_MINIMA);
}

function isDigits14(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const clean = String(value).trim();
  return /^\d{1,14}$/.test(clean) ? clean : null;
}

interface ParsedItem {
  ean: string;
  codigo: string;
  descricao: string;
  tipo: RebaixaTipo;
  validade: string | null;
  motivo: string | null;
  quantidade: number;
  pmz: number | null;
  precoSugerido: number | null;
  precoFinal: number | null;
  validadeId: string | null;
}

/** Valida um item vindo do cliente (busca no catálogo ou da Validade). */
export function parseItem(raw: unknown): { ok: true; item: ParsedItem } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Item inválido' };
  const item = raw as Record<string, unknown>;

  const ean = isDigits14(item.ean);
  const codigo = isDigits14(item.codigo);
  const descricao = typeof item.descricao === 'string'
    && item.descricao.trim().length > 0
    && item.descricao.trim().length <= 150
    ? item.descricao.trim()
    : null;
  if (!ean || !codigo || !descricao) {
    return { ok: false, error: 'Dados do produto inválidos (EAN/código até 14 dígitos, descrição até 150)' };
  }

  const motivo = normalizeMotivo(item.motivo);
  if (motivo.ok === false) {
    return { ok: false, error: 'Motivo inválido (use Excesso, Qualidade ou Excesso/qualidade)' };
  }

  const tipo = normalizeTipo(item.tipo) ?? (motivo.value ? 'KG' : 'UN');
  if (tipo === 'KG' && !motivo.value) {
    return { ok: false, error: 'Produto KG exige motivo (Excesso, Qualidade ou Excesso/qualidade)' };
  }
  if (tipo === 'UN' && motivo.value) {
    return { ok: false, error: 'Produto UN não usa motivo' };
  }

  const validade = normalizeValidade(item.validade);
  if (validade.ok === false) return { ok: false, error: 'Validade inválida' };
  if (tipo === 'UN' && !validade.value) {
    return { ok: false, error: 'Produto UN exige data de vencimento' };
  }

  const quantidade = normalizeQuantity(item.quantidade);
  if (quantidade === null) return { ok: false, error: 'Quantidade inválida (maior que zero)' };

  const pmz = normalizePrice(item.pmz);
  const precoSugerido = normalizePrice(item.preco_sugerido ?? item.precoSugerido);
  if (pmz.ok === false || precoSugerido.ok === false) {
    return { ok: false, error: 'Preços inválidos' };
  }
  // Não existe "preço final" decidido à parte: o preço da rebaixa É o sugerido.
  // O que o cliente mandar em `preco_final` é ignorado de propósito.

  // Vínculo opcional com o item de origem na Validade.
  const rawValidadeId = item.validade_id ?? item.validadeId;
  let validadeId: string | null = null;
  if (rawValidadeId !== undefined && rawValidadeId !== null && rawValidadeId !== '') {
    if (typeof rawValidadeId !== 'string' || !validUuid(rawValidadeId)) {
      return { ok: false, error: 'Vínculo de validade inválido' };
    }
    validadeId = rawValidadeId;
  }

  return {
    ok: true,
    item: {
      ean,
      codigo,
      descricao,
      tipo,
      validade: tipo === 'UN' ? validade.value : null,
      motivo: tipo === 'KG' ? motivo.value : null,
      quantidade,
      pmz: pmz.value,
      precoSugerido: precoSugerido.value,
      precoFinal: precoSugerido.value,
      validadeId,
    },
  };
}

/** Completa PMZ e preços a partir do custo do catálogo quando o cliente não mandou. */
export function withCatalogCost(item: ParsedItem, cost: number | null): ParsedItem {
  const pmz = item.pmz ?? (cost && cost > 0 ? cost : null);
  const precoSugerido = item.precoSugerido ?? (pmz !== null ? suggestedPriceFromCost(pmz) : null);
  // O preço final acompanha o sugerido: é o mesmo número na planilha.
  const precoFinal = precoSugerido;
  return { ...item, pmz, precoSugerido, precoFinal };
}

// Custo (PMZ) por código, incluindo códigos alternativos (produto_codigos).
// O registro mestre vence o alternativo quando o mesmo código existe nos dois.
const CUSTO_SELECT = `
  SELECT DISTINCT ON (codigo) codigo, custo FROM (
    SELECT p.codigo::text AS codigo, p."Custo"::float8 AS custo, 1 AS prioridade
      FROM public.produto p
     WHERE p.codigo = ANY($1::bigint[])
    UNION ALL
    SELECT pc.codigo::text AS codigo, p."Custo"::float8 AS custo, 2 AS prioridade
      FROM public.produto_codigos pc
      JOIN public.produto p ON p.codigo = pc.produto_codigo
     WHERE pc.codigo = ANY($1::bigint[])
  ) origem
  ORDER BY codigo, prioridade`;

async function fetchCosts(sql: Sql, codigos: string[]): Promise<Record<string, number>> {
  if (codigos.length === 0) return {};
  const rows = await sql(CUSTO_SELECT, [codigos]);
  const costs: Record<string, number> = {};
  for (const row of rows) {
    const value = Number(row.custo);
    if (Number.isFinite(value) && value > 0) costs[String(row.codigo)] = value;
  }
  return costs;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public.rebaixa_products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ean BIGINT NOT NULL,
    codigo BIGINT NOT NULL,
    descricao VARCHAR(150) NOT NULL,
    tipo VARCHAR(10) NOT NULL DEFAULT 'UN',
    validade TIMESTAMP WITH TIME ZONE,
    motivo VARCHAR(20),
    quantidade NUMERIC(12,3) NOT NULL DEFAULT 0,
    pmz NUMERIC(12,4),
    preco_sugerido NUMERIC(12,4),
    preco_final NUMERIC(12,4),
    validade_id UUID,
    status VARCHAR(12) NOT NULL DEFAULT 'rascunho',
    batch_id UUID,
    sent_at TIMESTAMP WITH TIME ZONE,
    sent_to TEXT,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    loja INTEGER NOT NULL DEFAULT 103,
    CONSTRAINT rebaixa_products_status_check CHECK (status IN ('rascunho', 'enviada')),
    CONSTRAINT rebaixa_products_tipo_check CHECK (tipo IN ('KG', 'UN')),
    CONSTRAINT rebaixa_products_quantidade_check CHECK (quantidade > 0)
  )`;

let schemaReady = false;

/** Tabela e índices criados de forma idempotente (uma vez por instância). */
async function ensureSchema(sql: Sql): Promise<boolean> {
  if (schemaReady) return true;
  try {
    await sql(CREATE_TABLE_SQL);
  } catch (error) {
    // Pode já existir (corrida entre instâncias) ou faltar permissão.
    console.error('Rebaixa schema create:', error);
  }
  try {
    const rows = await sql`SELECT to_regclass('public.rebaixa_products') AS table_name`;
    schemaReady = Boolean(rows[0]?.table_name);
  } catch {
    schemaReady = false;
  }
  if (!schemaReady) return false;

  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_rebaixa_status_created ON public.rebaixa_products(status, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_rebaixa_batch ON public.rebaixa_products(batch_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_rebaixa_loja_status_created ON public.rebaixa_products(loja, status, created_at)`;
    // O mesmo item da Validade só pode estar uma vez no rascunho **do usuário**
    // (cada login monta a sua lista; o admin supervisiona pelo histórico).
    await sql`ALTER TABLE public.rebaixa_products ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
    await sql`DROP INDEX IF EXISTS public.idx_rebaixa_validade_draft`;
    await sql`DROP INDEX IF EXISTS public.idx_rebaixa_loja_validade_draft`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_rebaixa_usuario_validade_draft
      ON public.rebaixa_products(loja, created_by, validade_id)
      WHERE status = 'rascunho' AND validade_id IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_rebaixa_loja_created_by
      ON public.rebaixa_products(loja, created_by, status)`;
  } catch {
    /* índices são otimização: seguem mesmo se falharem */
  }
  return true;
}

/**
 * Rascunho corrente.
 *
 * O rascunho é **por usuário**: cada login monta a sua lista — inclusive o
 * admin, que supervisiona pelo histórico (lotes enviados da loja toda).
 */
const LIST_SQL = `
  SELECT r.id::text, r.ean::text, r.codigo::text, r.descricao, r.tipo, r.validade, r.motivo,
         r.quantidade::float8, r.pmz::float8, r.preco_sugerido::float8, r.preco_final::float8,
         r.validade_id::text, r.created_by, r.created_at,
         ${SECAO_COLUNAS}
    FROM public.rebaixa_products r
   ${secaoJoin('r')}
   WHERE r.status = 'rascunho' AND r.loja = $1 AND r.created_by = $2
   ORDER BY r.created_at ASC`;

const HISTORY_ITEM_SQL = `
  SELECT r.id::text, r.ean::text, r.codigo::text, r.descricao, r.tipo, r.validade, r.motivo,
         r.quantidade::float8, r.pmz::float8, r.preco_sugerido::float8, r.preco_final::float8,
         r.validade_id::text, r.created_by, r.created_at, r.sent_at, r.sent_to,
         ${SECAO_COLUNAS}
    FROM public.rebaixa_products r
   ${secaoJoin('r')}
   WHERE r.batch_id = $1::uuid AND r.loja = $2
   ORDER BY r.created_at ASC`;

const INSERT_SQL = `
  INSERT INTO public.rebaixa_products
    (ean, codigo, descricao, tipo, validade, motivo, quantidade, pmz,
     preco_sugerido, preco_final, validade_id, status, created_by, loja)
  VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7::numeric, $8::numeric,
          $9::numeric, $10::numeric, $11::uuid, 'rascunho', $12, $13)`;

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    if (!canUseRebaixa(payload.role)) {
      sendJson(res, { error: 'Acesso restrito a admin e encarregado' }, 403);
      return;
    }

    const body = await readJsonBody<Record<string, unknown>>(req);
    const action = body.action;
    const sql = createSql();

    const ready = await ensureSchema(sql);
    if (!ready) {
      sendJson(res, { error: 'A tabela da rebaixa não está disponível' }, 503);
      return;
    }
    await ensureLojaSchema(sql);
    // Escopo multi-loja: o rascunho e o histórico são da loja do token.
    const loja = await resolveLoja(sql, payload);
    const usuario = String(payload.sub ?? '');
    // O **rascunho é sempre do próprio usuário** (inclusive para o admin): a
    // lista que ele monta, exporta e envia é a dele. Sem essa separação, o
    // admin veria os itens de outro login na própria lista e o envio não
    // marcaria o lote (o `mark_sent` só alcança o que é dele).
    // A supervisão do admin acontece no **histórico**, que lista os lotes
    // enviados da loja inteira (com o autor de cada um).
    const somenteDono = payload.role !== 'admin';

    // LIST — rascunho corrente (sempre do próprio usuário)
    if (action === 'list') {
      const items = await sql(LIST_SQL, [loja, usuario]);
      sendJson(res, { items });
      return;
    }

    // ADD / ADD_MANY
    if (action === 'add' || action === 'add_many') {
      const rawItems = action === 'add' ? [body.item] : body.items;
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        sendJson(res, { error: 'Informe ao menos um item' }, 400);
        return;
      }
      if (rawItems.length > MAX_ITEMS_PER_REQUEST) {
        sendJson(res, { error: `Envie no máximo ${MAX_ITEMS_PER_REQUEST} itens por vez` }, 400);
        return;
      }

      const parsed: ParsedItem[] = [];
      for (const raw of rawItems) {
        const result = parseItem(raw);
        if (result.ok === false) {
          sendJson(res, { error: result.error }, 400);
          return;
        }
        parsed.push(result.item);
      }

      const costs = await fetchCosts(sql, parsed.map((item) => item.codigo));
      const completed = parsed.map((item) => withCatalogCost(item, costs[item.codigo] ?? null));

      // Um item da Validade só pode estar uma vez no rascunho **do usuário**.
      const validadeIds = [...new Set(
        completed.map((item) => item.validadeId).filter((id): id is string => Boolean(id)),
      )];
      let alreadyDrafted = new Set<string>();
      if (validadeIds.length > 0) {
        const rows = await sql(
          `SELECT validade_id::text FROM public.rebaixa_products
            WHERE status = 'rascunho' AND loja = $2 AND created_by = $3
              AND validade_id = ANY($1::uuid[])`,
          [validadeIds, loja, usuario],
        );
        alreadyDrafted = new Set(rows.map((row) => String(row.validade_id)));
      }

      const seen = new Set<string>();
      const rows = completed.filter((item) => {
        if (item.validadeId && (alreadyDrafted.has(item.validadeId) || seen.has(item.validadeId))) {
          return false;
        }
        const key = `${item.codigo}|${item.tipo}|${item.validade ?? ''}|${item.motivo ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        if (item.validadeId) seen.add(item.validadeId);
        return true;
      });

      if (rows.length > 0) {
        await sql(
          rows.map((item) => ({
            query: INSERT_SQL,
            params: [
              item.ean,
              item.codigo,
              item.descricao,
              item.tipo,
              item.validade,
              item.motivo,
              item.quantidade,
              item.pmz,
              item.precoSugerido,
              item.precoFinal,
              item.validadeId,
              payload.sub,
              loja,
            ],
          })),
          [],
          true,
        );
      }

      sendJson(res, {
        success: true,
        added: rows.length,
        skipped: completed.length - rows.length,
      });
      return;
    }

    // UPDATE — quantidade, preços, validade (UN) ou motivo (KG)
    if (action === 'update') {
      const id = body.id;
      if (!validUuid(id)) {
        sendJson(res, { error: 'ID inválido' }, 400);
        return;
      }

      const existing = await sql(
        `SELECT id::text, tipo, validade, motivo, quantidade::float8,
                preco_sugerido::float8, preco_final::float8
           FROM public.rebaixa_products
          WHERE id = $1::uuid AND status = 'rascunho' AND loja = $2 AND created_by = $3`,
        [id, loja, usuario],
      );
      const row = existing[0];
      if (!row) {
        sendJson(res, { error: 'Item não encontrado no rascunho' }, 404);
        return;
      }

      const tipo = normalizeTipo(row.tipo);
      if (!tipo) {
        sendJson(res, { error: 'Tipo do item inválido' }, 500);
        return;
      }
      if (body.tipo !== undefined && normalizeTipo(body.tipo) !== tipo) {
        sendJson(res, { error: 'O tipo do produto não pode ser alterado' }, 400);
        return;
      }

      const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

      let quantidade = Number(row.quantidade);
      if (has('quantidade')) {
        const value = normalizeQuantity(body.quantidade);
        if (value === null) {
          sendJson(res, { error: 'Quantidade inválida (maior que zero)' }, 400);
          return;
        }
        quantidade = value;
      }

      let precoSugerido = row.preco_sugerido === null ? null : Number(row.preco_sugerido);
      if (has('preco_sugerido')) {
        const value = normalizePrice(body.preco_sugerido);
        if (value.ok === false) {
          sendJson(res, { error: 'Preço sugerido inválido' }, 400);
          return;
        }
        precoSugerido = value.value;
      }

      // O preço final não é um campo editável: acompanha o preço sugerido.
      const precoFinal = precoSugerido;

      let validade = row.validade ? new Date(row.validade as string).toISOString() : null;
      let motivo = typeof row.motivo === 'string' ? row.motivo : null;

      if (tipo === 'UN') {
        if (has('validade')) {
          const value = normalizeValidade(body.validade);
          if (value.ok === false || !value.value) {
            sendJson(res, { error: 'Produto UN exige data de vencimento' }, 400);
            return;
          }
          validade = value.value;
        }
        motivo = null;
      } else {
        if (has('motivo')) {
          const value = normalizeMotivo(body.motivo);
          if (value.ok === false || !value.value) {
            sendJson(res, { error: 'Produto KG exige motivo (Excesso, Qualidade ou Excesso/qualidade)' }, 400);
            return;
          }
          motivo = value.value;
        }
        validade = null;
      }

      await sql(
        `UPDATE public.rebaixa_products
            SET quantidade = $2::numeric, preco_sugerido = $3::numeric,
                preco_final = $4::numeric, validade = $5, motivo = $6
          WHERE id = $1::uuid AND status = 'rascunho' AND loja = $7 AND created_by = $8`,
        [id, quantidade, precoSugerido, precoFinal, validade, motivo, loja, usuario],
      );
      sendJson(res, { success: true });
      return;
    }

    // REMOVE — só o rascunho
    if (action === 'remove') {
      const id = body.id;
      if (!validUuid(id)) {
        sendJson(res, { error: 'ID inválido' }, 400);
        return;
      }
      const removed = await sql(
        `DELETE FROM public.rebaixa_products
          WHERE id = $1::uuid AND status = 'rascunho' AND loja = $2 AND created_by = $3
          RETURNING id`,
        [id, loja, usuario],
      );
      if (removed.length === 0) {
        sendJson(res, { error: 'Item não encontrado no rascunho' }, 404);
        return;
      }
      sendJson(res, { success: true });
      return;
    }

    // CLEAR — limpa o rascunho do próprio usuário; o histórico é preservado
    if (action === 'clear') {
      const removed = await sql(
        `DELETE FROM public.rebaixa_products
          WHERE status = 'rascunho' AND loja = $1 AND created_by = $2
          RETURNING id`,
        [loja, usuario],
      );
      sendJson(res, { success: true, removed: removed.length });
      return;
    }

    // MARK_SENT — chamado após o e-mail ser aceito pelo servidor
    if (action === 'mark_sent') {
      if (payload.role !== 'admin' && payload.role !== 'encarregado') {
        sendJson(res, { error: 'Apenas admin e encarregado podem marcar a rebaixa como enviada' }, 403);
        return;
      }
      const rawIds = Array.isArray(body.ids) ? body.ids : [];
      if (
        rawIds.length === 0
        || rawIds.length > MAX_IDS_PER_SEND
        || rawIds.some((id) => !validUuid(id))
      ) {
        sendJson(res, { error: 'Informe de 1 a 500 IDs válidos' }, 400);
        return;
      }
      const to = typeof body.to === 'string' ? body.to.trim() : '';
      if (!to || to.length > 500) {
        sendJson(res, { error: 'Destinatário inválido' }, 400);
        return;
      }

      const batchId = randomUUID();
      const ids = rawIds as string[];
      const sent = await sql(
        `UPDATE public.rebaixa_products
            SET status = 'enviada', sent_at = NOW(), sent_to = $2, batch_id = $3::uuid
          WHERE id = ANY($1::uuid[]) AND status = 'rascunho' AND loja = $4 AND created_by = $5
          RETURNING id`,
        [ids, to, batchId, loja, usuario],
      );
      sendJson(res, { success: true, batch_id: batchId, sent: sent.length });
      return;
    }

    // HISTORY — lotes enviados (mais recentes primeiro)
    // O admin vê todos os lotes da loja; o encarregado, só os dele.
    if (action === 'history') {
      const batches = somenteDono
        ? await sql(`
          SELECT batch_id::text, MAX(sent_at) AS sent_at, MAX(sent_to) AS sent_to,
                 MAX(created_by) AS created_by, COUNT(*)::int AS itens,
                 COALESCE(SUM(quantidade * COALESCE(preco_final, 0)), 0)::float8 AS total
            FROM public.rebaixa_products
           WHERE status = 'enviada' AND batch_id IS NOT NULL AND loja = $1 AND created_by = $2
           GROUP BY batch_id
           ORDER BY MAX(sent_at) DESC
           LIMIT 50`, [loja, usuario])
        : await sql(`
          SELECT batch_id::text, MAX(sent_at) AS sent_at, MAX(sent_to) AS sent_to,
                 MAX(created_by) AS created_by, COUNT(*)::int AS itens,
                 COALESCE(SUM(quantidade * COALESCE(preco_final, 0)), 0)::float8 AS total
            FROM public.rebaixa_products
           WHERE status = 'enviada' AND batch_id IS NOT NULL AND loja = $1
           GROUP BY batch_id
           ORDER BY MAX(sent_at) DESC
           LIMIT 50`, [loja]);
      sendJson(res, { batches });
      return;
    }

    // HISTORY_ITEMS — itens de um lote enviado
    if (action === 'history_items') {
      const batchId = body.batch_id ?? body.batchId;
      if (!validUuid(batchId)) {
        sendJson(res, { error: 'Lote inválido' }, 400);
        return;
      }
      // O encarregado só abre os lotes que ele mesmo enviou.
      const items = somenteDono
        ? await sql(
          `${HISTORY_ITEM_SQL} AND r.created_by = $3`,
          [batchId, loja, usuario],
        )
        : await sql(HISTORY_ITEM_SQL, [batchId, loja]);
      sendJson(res, { items });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('Manage rebaixa error:', error);
    sendJson(res, { error: 'Erro interno do servidor' }, 500);
  }
};

export default handler;
