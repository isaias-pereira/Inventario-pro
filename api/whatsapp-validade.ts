/**
 * Alertas de validade por WhatsApp (Meta Cloud API).
 *
 * Dois modos no mesmo endpoint:
 *
 * - **GET** — chamado pelos crons da Vercel (`0 10 * * *` e `0 16 * * *`,
 *   equivalentes a 07h e 13h em Brasília). Exige `CRON_SECRET` no cabeçalho
 *   `Authorization: Bearer <secret>` e é idempotente por slot/dia na tabela
 *   `whatsapp_envios` — se o cron repetir, a segunda chamada não reenvia.
 * - **POST** — usado pela tela da Validade (admin/encarregado):
 *   - `config`: estado da integração e destinatários (mascarados);
 *   - `preview`: resumo e lista que seriam enviados, sem enviar nada;
 *   - `send`: envia agora (registra no histórico como `manual`);
 *   - `history`: últimos envios (automáticos e manuais).
 *
 * A integração é opcional: sem as variáveis de ambiente o endpoint responde
 * 503 e o restante do app continua funcionando.
 */

import { createSql, type Sql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import {
  bearerToken,
  readJsonBody,
  requirePost,
  sendJson,
  type ApiHandler,
  type ApiRequest,
  type ApiResponse,
} from './_lib/http.js';
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
} from './_lib/whatsapp.js';

/** Papéis que podem ver a configuração e disparar o alerta pela tela. */
export const WHATSAPP_ROLES = ['admin', 'encarregado'] as const;

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
    CONSTRAINT whatsapp_envios_slot_check CHECK (slot IN ('manha', 'tarde', 'manual'))
  )`;

let schemaReady = false;

/** Tabela e índices criados de forma idempotente (uma vez por instância). */
async function ensureSchema(sql: Sql): Promise<boolean> {
  if (schemaReady) return true;
  try {
    await sql(CREATE_TABLE_SQL);
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
    // Só os slots automáticos são únicos: o envio manual pode repetir.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_envios_slot_dia
      ON public.whatsapp_envios (slot, dia)
      WHERE slot <> 'manual'`;
    await sql`CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_created
      ON public.whatsapp_envios (created_at DESC)`;
  } catch {
    /* índices são otimização: seguem mesmo se falharem */
  }
  return true;
}

/** Consulta os produtos que vencem até `alertDays` dias à frente. */
async function loadDigest(sql: Sql, alertDays: number): Promise<ValidadeDigest> {
  const rows = await sql(
    `SELECT descricao, quantidade, validade, status, motivo
       FROM public.validade_products
      WHERE status = true
        AND (motivo IS NULL OR btrim(motivo) = '')
        AND validade <= (NOW() + ($1::int * INTERVAL '1 day'))
      ORDER BY validade ASC`,
    [alertDays],
  );
  return buildValidadeDigest(rows as ValidadeSourceRow[], alertDays);
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
): Promise<string | null> {
  const rows = await sql(
    `INSERT INTO public.whatsapp_envios (slot, dia, created_by)
     VALUES ($1, $2::date, $3)
     ON CONFLICT DO NOTHING
     RETURNING id::text`,
    [slot, dia, createdBy],
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
): Promise<void> {
  try {
    await sql(
      `INSERT INTO public.whatsapp_envios
         (slot, dia, total, destinatarios, enviados, falhas, erro, created_by)
       VALUES ('manual', $1::date, $2, $3, $4, $5, $6, $7)`,
      [saoPauloDay(), digest.total, config.recipients.length, enviados, falhas, erro, createdBy],
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

async function handleCron(req: ApiRequest, res: ApiResponse): Promise<void> {
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

  const now = new Date();
  const slot = requestedSlot(req)
    ?? slotFromSchedule(req.headers['x-vercel-cron-schedule'], saoPauloParts(now).hour);
  const dia = saoPauloDay(now);

  // Teste seguro: monta a mensagem sem reservar o slot nem enviar.
  if (isDryRun(req)) {
    const digest = await loadDigest(sql, config.alertDays);
    sendJson(res, {
      ok: true,
      dryRun: true,
      slot,
      dia,
      total: digest.total,
      summary: digest.summary,
      list: digest.list,
    });
    return;
  }

  const claim = await claimSlot(sql, slot, dia, 'cron');
  if (!claim) {
    sendJson(res, { ok: true, skipped: 'slot já enviado', slot, dia });
    return;
  }

  const digest = await loadDigest(sql, config.alertDays);
  if (digest.total === 0) {
    await finishSlot(sql, claim, {
      total: 0,
      destinatarios: config.recipients.length,
      enviados: 0,
      falhas: 0,
      erro: null,
    });
    sendJson(res, { ok: true, skipped: 'sem produtos vencendo', slot, dia, total: 0 });
    return;
  }

  const { results, enviados, falhas } = await sendWhatsappToRecipients(
    config.recipients,
    digest,
    config,
  );
  const erro = firstError(results);
  await finishSlot(sql, claim, {
    total: digest.total,
    destinatarios: config.recipients.length,
    enviados,
    falhas,
    erro,
  });

  console.log(
    `[whatsapp] ${slot} ${dia} total=${digest.total} enviados=${enviados} falhas=${falhas}`,
  );
  sendJson(res, {
    ok: enviados > 0,
    slot,
    dia,
    total: digest.total,
    destinatarios: config.recipients.length,
    enviados,
    falhas,
    erro,
    results: maskedResults(results),
  });
}

// ── POST: tela da Validade ────────────────────────────────────────────

const handler: ApiHandler = async (req, res) => {
  if (req.method === 'GET') {
    try {
      await handleCron(req, res);
    } catch (error) {
      console.error('WhatsApp cron error:', error);
      const message = error instanceof Error ? error.message : 'Erro interno do servidor';
      sendJson(res, { error: message }, 500);
    }
    return;
  }

  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    if (!canSendWhatsapp(payload.role)) {
      sendJson(res, { error: 'Apenas admin e encarregado podem enviar alertas por WhatsApp' }, 403);
      return;
    }

    const body = await readJsonBody<Record<string, unknown>>(req);
    const action = body.action;
    const config = whatsappConfig();
    const sql = createSql();

    // CONFIG — a tela usa para saber se o envio está disponível.
    if (action === 'config') {
      sendJson(res, {
        enabled: config.enabled,
        recipients: config.recipients.map(maskPhone),
        recipientsCount: config.recipients.length,
        template: config.templateName,
        language: config.templateLang,
        apiVersion: config.apiVersion,
        alertDays: config.alertDays,
        maxItems: config.maxItems,
        schedule: ['07:00', '13:00'],
        cronSecretConfigured: Boolean((process.env.CRON_SECRET ?? '').trim()),
      });
      return;
    }

    // PREVIEW — monta a mensagem sem enviar (funciona mesmo sem credenciais).
    if (action === 'preview') {
      const digest = await loadDigest(sql, config.alertDays);
      sendJson(res, {
        enabled: config.enabled,
        alertDays: config.alertDays,
        total: digest.total,
        vencidos: digest.vencidos,
        hoje: digest.hoje,
        proximos: digest.proximos,
        summary: digest.summary,
        list: digest.list,
        truncated: digest.truncated,
        items: digest.items.slice(0, 50),
        recipients: config.recipients.map(maskPhone),
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
          ORDER BY created_at DESC
          LIMIT 20`,
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

    const digest = await loadDigest(sql, config.alertDays);
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
      config.recipients,
      digest,
      config,
    );
    const erro = firstError(results);

    if (await ensureSchema(sql)) {
      await recordManual(sql, digest, config, enviados, falhas, erro, payload.sub);
    }

    console.log(
      `[whatsapp] manual por ${payload.sub} total=${digest.total} enviados=${enviados} falhas=${falhas}`,
    );
    sendJson(res, {
      ok: enviados > 0,
      total: digest.total,
      destinatarios: config.recipients.length,
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
};

export default handler;
