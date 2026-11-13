/**
 * Alertas de validade por WhatsApp (Meta Cloud API).
 *
 * A lógica mora aqui (em `_lib`, que não vira Serverless Function) e é
 * chamada por `api/manage-validade.ts` — o plano Hobby da Vercel limita o
 * deploy a 12 funções, então o cron e as ações da tela entram na função que já
 * atende a Validade.
 *
 * Dois modos:
 *
 * - **GET** — chamado pelos crons da Vercel (`0 10 * * *` e `0 16 * * *`,
 *   equivalentes a 07h e 13h em Brasília). Exige `CRON_SECRET` no cabeçalho
 *   `Authorization: Bearer <secret>` e é idempotente por slot/dia na tabela
 *   `whatsapp_envios` — se o cron repetir, a segunda chamada não reenvia.
 * - **POST** — usado pela tela da Validade (só admin), com as ações
 *   prefixadas por `whatsapp_`:
 *   - `whatsapp_config`: estado da integração e destinatários (mascarados);
 *   - `whatsapp_preview`: resumo e lista que seriam enviados, sem enviar nada;
 *   - `whatsapp_send`: envia agora (registra no histórico como `manual`);
 *   - `whatsapp_history`: últimos envios (automáticos e manuais).
 *
 * A integração é opcional: sem as variáveis de ambiente o endpoint responde
 * 503 e o restante do app continua funcionando.
 */

import { createSql, type Sql } from './db.js';
import { authenticate } from './auth.js';
import {
  bearerToken,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from './http.js';
import {
  buildValidadeDigest,
  maskPhone,
  saoPauloDay,
  saoPauloParts,
  sendWhatsappToRecipients,
  slotFromSchedule,
  whatsappConfig,
  type SendResult,
  type ValidadeDigest,
  type ValidadeSourceRow,
  type WhatsappConfig,
} from './whatsapp.js';
import { DEFAULT_LOJA, ensureLojaSchema, listarLojas, resolveLoja } from './loja.js';

/** Papéis que podem ver a configuração e disparar o alerta pela tela. */
export const WHATSAPP_ROLES = ['admin'] as const;

export function canSendWhatsapp(role: unknown): boolean {
  return typeof role === 'string' && (WHATSAPP_ROLES as readonly string[]).includes(role);
}

export type WhatsappSlot = 'manha' | 'tarde';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public.whatsapp_envios (
    id BIGSERIAL PRIMARY KEY,
    slot VARCHAR(10) NOT NULL,
    dia DATE NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    destinatarios INTEGER NOT NULL DEFAULT 0,
    enviados INTEGER NOT NULL DEFAULT 0,
    falhas INTEGER NOT NULL DEFAULT 0,
    erro TEXT,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    loja INTEGER NOT NULL DEFAULT 103,
    CONSTRAINT whatsapp_envios_slot_check CHECK (slot IN ('manha', 'tarde', 'manual'))
  )`;

const CREATE_DESTINATARIOS_SQL = `
  CREATE TABLE IF NOT EXISTS public.whatsapp_destinatarios (
    id BIGSERIAL PRIMARY KEY,
    loja INTEGER NOT NULL DEFAULT 103,
    telefone VARCHAR(20) NOT NULL,
    nome VARCHAR(60),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`;

let schemaReady = false;

/** Tabela e índices criados de forma idempotente (uma vez por instância). */
async function ensureSchema(sql: Sql): Promise<boolean> {
  if (schemaReady) return true;
  try {
    await sql(CREATE_TABLE_SQL);
    await sql(CREATE_DESTINATARIOS_SQL);
  } catch (error) {
    console.error('WhatsApp schema create:', error);
  }
  try {
    const rows = await sql`SELECT to_regclass('public.whatsapp_envios') AS table_name`;
    schemaReady = Boolean(rows[0]?.table_name);
  } catch {
    schemaReady = false;
  }
  if (!schemaReady) return false;

  try {
    // Multi-loja: o slot automático é único por loja/slot/dia e os
    // destinatários são cadastrados por loja.
    await sql`ALTER TABLE public.whatsapp_envios ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
    await sql`DROP INDEX IF EXISTS public.idx_whatsapp_envios_slot_dia`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_envios_loja_slot_dia
      ON public.whatsapp_envios (loja, slot, dia)
      WHERE slot <> 'manual'`;
    await sql`CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_created
      ON public.whatsapp_envios (created_at DESC)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_destinatarios_loja_telefone
      ON public.whatsapp_destinatarios (loja, telefone)`;
  } catch {
    /* índices são otimização: seguem mesmo se falharem */
  }
  return true;
}

/** Produtos da loja que vencem até `alertDays` dias à frente. */
async function loadRows(sql: Sql, alertDays: number, loja: number): Promise<ValidadeSourceRow[]> {
  const rows = await sql(
    `SELECT descricao, quantidade, validade, status, motivo
       FROM public.validade_products
      WHERE loja = $2
        AND status = true
        AND (motivo IS NULL OR btrim(motivo) = '')
        AND validade <= (NOW() + ($1::int * INTERVAL '1 day'))
      ORDER BY validade ASC`,
    [alertDays, loja],
  );
  return rows as ValidadeSourceRow[];
}

/** Monta o digest (resumo + lista) dos produtos de uma loja. */
function buildDigest(rows: ValidadeSourceRow[], alertDays: number): ValidadeDigest {
  return buildValidadeDigest(rows, alertDays);
}

/** Números cadastrados para a loja. */
async function destinatariosDaLoja(sql: Sql, loja: number): Promise<string[]> {
  try {
    const rows = await sql(
      `SELECT telefone
         FROM public.whatsapp_destinatarios
        WHERE loja = $1 AND ativo = TRUE
        ORDER BY nome NULLS LAST, id`,
      [loja],
    );
    return rows.map((row) => String(row.telefone ?? '').trim()).filter(Boolean);
  } catch (error) {
    console.error('WhatsApp destinatarios:', error);
    return [];
  }
}

/**
 * Para quem enviar o alerta da loja.
 *
 * Usa os números cadastrados da loja; se a loja não tiver nenhum, cai nos
 * números do servidor (`WHATSAPP_RECIPIENTS`) — o comportamento anterior.
 */
async function recipientsDaLoja(sql: Sql, config: WhatsappConfig, loja: number): Promise<string[]> {
  const cadastrados = await destinatariosDaLoja(sql, loja);
  return cadastrados.length > 0 ? cadastrados : config.recipients;
}

/**
 * Reserva o slot do dia. Devolve `null` quando outro invocação já reservou —
 * é o que garante um envio por slot mesmo com o cron repetindo.
 */
async function claimSlot(
  sql: Sql,
  slot: WhatsappSlot,
  dia: string,
  createdBy: string,
  loja: number,
): Promise<string | null> {
  const rows = await sql(
    `INSERT INTO public.whatsapp_envios (slot, dia, created_by, loja)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING id::text`,
    [slot, dia, createdBy, loja],
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}

async function finishSlot(
  sql: Sql,
  id: string,
  values: { total: number; destinatarios: number; enviados: number; falhas: number; erro: string | null },
): Promise<void> {
  await sql(
    `UPDATE public.whatsapp_envios
        SET total = $2, destinatarios = $3, enviados = $4, falhas = $5, erro = $6, updated_at = now()
      WHERE id = $1::bigint`,
    [id, values.total, values.destinatarios, values.enviados, values.falhas, values.erro],
  );
}

async function recordManual(
  sql: Sql,
  digest: ValidadeDigest,
  config: WhatsappConfig,
  enviados: number,
  falhas: number,
  erro: string | null,
  createdBy: string,
  loja: number,
): Promise<void> {
  try {
    await sql(
      `INSERT INTO public.whatsapp_envios
         (slot, dia, total, destinatarios, enviados, falhas, erro, created_by, loja)
       VALUES ('manual', $1::date, $2, $3, $4, $5, $6, $7, $8)`,
      [saoPauloDay(), digest.total, config.recipients.length, enviados, falhas, erro, createdBy, loja],
    );
  } catch (error) {
    // O histórico é acessório: o envio já aconteceu, não falha a resposta.
    console.error('WhatsApp manual history:', error);
  }
}

function maskedResults(results: SendResult[]): SendResult[] {
  return results.map((result) => ({ ...result, to: maskPhone(result.to) }));
}

function requestedSlot(req: ApiRequest): WhatsappSlot | null {
  const raw = req.query?.slot;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'manha' || value === 'tarde' ? value : null;
}

function isDryRun(req: ApiRequest): boolean {
  const raw = req.query?.dry;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
}

function firstError(results: SendResult[]): string | null {
  return results.find((result) => !result.ok)?.error ?? null;
}

// ── GET: cron da Vercel ───────────────────────────────────────────────

/**
 * Atende o cron (GET). Exportada para `api/manage-validade.ts` — o plano
 * Hobby da Vercel limita o deploy a 12 Serverless Functions.
 */
export async function handleWhatsappCron(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    await runCron(req, res);
  } catch (error) {
    console.error('WhatsApp cron error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    sendJson(res, { error: message }, 500);
  }
}

async function runCron(req: ApiRequest, res: ApiResponse): Promise<void> {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (!secret) {
    sendJson(res, { error: 'CRON_SECRET não configurado no servidor' }, 503);
    return;
  }
  if ((bearerToken(req) ?? '').trim() !== secret) {
    sendJson(res, { error: 'Não autorizado' }, 401);
    return;
  }

  const config = whatsappConfig();
  if (!config.enabled) {
    sendJson(res, { error: 'Integração do WhatsApp não configurada no servidor' }, 503);
    return;
  }

  const sql = createSql();
  if (!(await ensureSchema(sql))) {
    sendJson(res, { error: 'Tabela whatsapp_envios indisponível' }, 500);
    return;
  }
  await ensureLojaSchema(sql);

  const now = new Date();
  const slot = requestedSlot(req)
    ?? slotFromSchedule(req.headers['x-vercel-cron-schedule'], saoPauloParts(now).hour);
  const dia = saoPauloDay(now);

  // O cron envia o alerta de **cada loja** separadamente: o digest, os
  // destinatários e a idempotência são por loja.
  const lojas = (await listarLojas(sql)).filter((loja) => loja.ativo);
  const codigos = lojas.length > 0 ? lojas.map((loja) => loja.codigo) : [DEFAULT_LOJA];

  // Teste seguro: monta a mensagem sem reservar o slot nem enviar.
  if (isDryRun(req)) {
    const porLoja: Array<{ loja: number; total: number; summary: string; list: string }> = [];
    const todasRows: ValidadeSourceRow[] = [];
    for (const codigo of codigos) {
      const rows = await loadRows(sql, config.alertDays, codigo);
      const digest = buildDigest(rows, config.alertDays);
      todasRows.push(...rows);
      porLoja.push({ loja: codigo, total: digest.total, summary: digest.summary, list: digest.list });
    }
    const agregado = buildDigest(todasRows, config.alertDays);
    sendJson(res, {
      ok: true,
      dryRun: true,
      slot,
      dia,
      lojas: porLoja,
      total: agregado.total,
      summary: agregado.summary,
      list: agregado.list,
    });
    return;
  }

  const porLoja: Array<Record<string, unknown>> = [];
  let totalGeral = 0;
  let enviadosGeral = 0;
  let falhasGeral = 0;
  let destinatariosGeral = 0;
  let algumEnviou = false;
  let skippedSlot = false;
  let semProdutos = false;

  for (const codigo of codigos) {
    const recipients = await recipientsDaLoja(sql, config, codigo);
    if (recipients.length === 0) continue;

    const claim = await claimSlot(sql, slot, dia, 'cron', codigo);
    if (!claim) {
      skippedSlot = true;
      porLoja.push({ loja: codigo, skipped: 'slot já enviado' });
      continue;
    }

    const rows = await loadRows(sql, config.alertDays, codigo);
    const digest = buildDigest(rows, config.alertDays);
    if (digest.total === 0) {
      semProdutos = true;
      await finishSlot(sql, claim, {
        total: 0,
        destinatarios: recipients.length,
        enviados: 0,
        falhas: 0,
        erro: null,
      });
      porLoja.push({ loja: codigo, total: 0, destinatarios: recipients.length, enviados: 0, falhas: 0 });
      continue;
    }

    const { results, enviados, falhas } = await sendWhatsappToRecipients(
      recipients,
      digest,
      config,
    );
    const erro = firstError(results);
    await finishSlot(sql, claim, {
      total: digest.total,
      destinatarios: recipients.length,
      enviados,
      falhas,
      erro,
    });

    totalGeral += digest.total;
    enviadosGeral += enviados;
    falhasGeral += falhas;
    destinatariosGeral += recipients.length;
    if (enviados > 0) algumEnviou = true;

    console.log(
      `[whatsapp] loja=${codigo} ${slot} ${dia} total=${digest.total} enviados=${enviados} falhas=${falhas}`,
    );
    porLoja.push({
      loja: codigo,
      total: digest.total,
      destinatarios: recipients.length,
      enviados,
      falhas,
      erro,
      results: maskedResults(results),
    });
  }

  if (!algumEnviou && skippedSlot) {
    sendJson(res, { ok: true, skipped: 'slot já enviado', slot, dia, lojas: porLoja });
    return;
  }
  if (!algumEnviou && semProdutos) {
    sendJson(res, { ok: true, skipped: 'sem produtos vencendo', slot, dia, total: 0, lojas: porLoja });
    return;
  }

  sendJson(res, {
    ok: enviadosGeral > 0,
    slot,
    dia,
    total: totalGeral,
    destinatarios: destinatariosGeral,
    enviados: enviadosGeral,
    falhas: falhasGeral,
    lojas: porLoja,
  });
}

// ── POST: tela da Validade ────────────────────────────────────────────

/**
 * Atende as ações `whatsapp_*` da tela. O corpo já pode vir lido pelo
 * `manage-validade` (evita ler o JSON duas vezes).
 */
export async function handleWhatsappPost(
  req: ApiRequest,
  res: ApiResponse,
  preloadedBody?: Record<string, unknown>,
): Promise<void> {
  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    if (!canSendWhatsapp(payload.role)) {
      sendJson(res, { error: 'Apenas admin pode enviar alertas por WhatsApp' }, 403);
      return;
    }

    const body = preloadedBody ?? await readJsonBody<Record<string, unknown>>(req);
    // As ações chegam prefixadas (`whatsapp_config`) para não colidir com as
    // ações da própria Validade.
    const action = String(body.action ?? '').replace(/^whatsapp_/, '');
    const config = whatsappConfig();
    const sql = createSql();
    await ensureLojaSchema(sql);
    // A tela trabalha na loja do usuário: o alerta mostra e envia os produtos
    // dela, para os destinatários dela.
    const loja = await resolveLoja(sql, payload);
    const recipients = await recipientsDaLoja(sql, config, loja);

    // CONFIG — a tela usa para saber se o envio está disponível.
    if (action === 'config') {
      sendJson(res, {
        enabled: config.enabled,
        recipients: recipients.map(maskPhone),
        recipientsCount: recipients.length,
        template: config.templateName,
        language: config.templateLang,
        apiVersion: config.apiVersion,
        alertDays: config.alertDays,
        maxItems: config.maxItems,
        schedule: ['07:00', '13:00'],
        cronSecretConfigured: Boolean((process.env.CRON_SECRET ?? '').trim()),
        loja,
      });
      return;
    }

    // PREVIEW — monta a mensagem sem enviar (funciona mesmo sem credenciais).
    if (action === 'preview') {
      const rows = await loadRows(sql, config.alertDays, loja);
      const digest = buildDigest(rows, config.alertDays);
      sendJson(res, {
        enabled: config.enabled,
        alertDays: config.alertDays,
        loja,
        total: digest.total,
        vencidos: digest.vencidos,
        hoje: digest.hoje,
        proximos: digest.proximos,
        summary: digest.summary,
        list: digest.list,
        truncated: digest.truncated,
        items: digest.items.slice(0, 50),
        recipients: recipients.map(maskPhone),
      });
      return;
    }

    // HISTORY — últimos envios (automáticos e manuais).
    if (action === 'history') {
      if (!(await ensureSchema(sql))) {
        sendJson(res, { error: 'Tabela whatsapp_envios indisponível' }, 500);
        return;
      }
      const items = await sql(
        `SELECT id::text, slot, to_char(dia, 'YYYY-MM-DD') AS dia,
                total, destinatarios, enviados, falhas, erro, created_by,
                to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando
           FROM public.whatsapp_envios
          WHERE loja = $1
          ORDER BY created_at DESC
          LIMIT 20`,
        [loja],
      );
      sendJson(res, { items });
      return;
    }

    if (action !== 'send') {
      sendJson(res, { error: 'Ação inválida' }, 400);
      return;
    }

    if (!config.enabled) {
      sendJson(res, { error: 'Integração do WhatsApp não configurada no servidor' }, 503);
      return;
    }

    const rows = await loadRows(sql, config.alertDays, loja);
    const digest = buildDigest(rows, config.alertDays);
    if (digest.total === 0) {
      sendJson(res, {
        ok: true,
        skipped: 'sem produtos vencendo',
        total: 0,
        enviados: 0,
        falhas: 0,
        results: [],
      });
      return;
    }

    const { results, enviados, falhas } = await sendWhatsappToRecipients(
      recipients,
      digest,
      config,
    );
    const erro = firstError(results);

    if (await ensureSchema(sql)) {
      await recordManual(sql, digest, config, enviados, falhas, erro, payload.sub, loja);
    }

    console.log(
      `[whatsapp] manual por ${payload.sub} loja=${loja} total=${digest.total} enviados=${enviados} falhas=${falhas}`,
    );
    sendJson(res, {
      ok: enviados > 0,
      loja,
      total: digest.total,
      destinatarios: recipients.length,
      enviados,
      falhas,
      erro,
      results: maskedResults(results),
      summary: digest.summary,
      list: digest.list,
    });
  } catch (error) {
    console.error('WhatsApp validade error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    sendJson(res, { error: message }, 500);
  }
}
