/**
 * Arrastão (multi-loja).
 *
 * Cada loja tem as suas sessões e os seus itens. Ao finalizar, os itens vão
 * para a Validade **da mesma loja** da sessão — a loja nunca muda na
 * transferência.
 */

import { createSql, type Sql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { ensureLojaSchema, resolveLoja } from './_lib/loja.js';
import { ensureEncarregadosSchema, usuariosDaEquipe } from './_lib/encarregados.js';
import { codigoEhKg, MSG_KG_ARRASTAO } from './_lib/produto-tipo.js';

let schemaReady = false;

async function ensureSchema(sql: Sql) {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS arrastao_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corredor TEXT NOT NULL,
    started_by TEXT NOT NULL,
    participants TEXT[] NOT NULL DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active',
    loja INTEGER NOT NULL DEFAULT 103
  )`;
  await sql`CREATE TABLE IF NOT EXISTS arrastao_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES arrastao_sessions(id) ON DELETE CASCADE,
    ean BIGINT NOT NULL,
    codigo BIGINT NOT NULL,
    descricao TEXT NOT NULL,
    validade TIMESTAMPTZ NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    scanned_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    loja INTEGER NOT NULL DEFAULT 103
  )`;
  await sql`ALTER TABLE arrastao_sessions ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
  await sql`ALTER TABLE arrastao_items ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_items_session ON arrastao_items(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_items_validade ON arrastao_items(validade)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_items_created_at ON arrastao_items(created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_sessions_status_started ON arrastao_sessions(status, started_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_sessions_loja_status ON arrastao_sessions(loja, status, started_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_items_loja_session ON arrastao_items(loja, session_id)`;
  schemaReady = true;
}

/**
 * Expira sessões ativas com mais de 6 h.
 *
 * A limpeza é do sistema (roda para todas as lojas): cada sessão encerrada
 * transfere os itens para a Validade da **sua** loja.
 */
async function autoExpire(sql: Sql) {
  // Find sessions exceeding 6h still active -> finalize automatically
  const expired = await sql`SELECT id FROM arrastao_sessions WHERE status = 'active' AND started_at < (NOW() - INTERVAL '6 hours')`;
  for (const s of expired as Array<{ id: string }>) {
    await finalizeSession(sql, s.id, 'auto_expired');
  }
}

async function finalizeSession(sql: Sql, sessionId: string, reason: string) {
  // A loja vem da própria sessão: os itens nunca mudam de loja na transferência.
  const sessao = await sql`SELECT loja FROM arrastao_sessions WHERE id = ${sessionId} LIMIT 1`;
  const loja = Number(sessao[0]?.loja) || 103;
  // Bulk-transfer items to validade_products in a single INSERT...SELECT (was N round-trips)
  const inserted = await sql`
    INSERT INTO validade_products (ean, codigo, descricao, validade, quantidade, status, created_by, loja)
    SELECT ean, codigo, descricao, validade, quantidade, true, scanned_by, ${loja}
    FROM arrastao_items WHERE session_id = ${sessionId}
    RETURNING id`;
  await sql`UPDATE arrastao_sessions SET status = ${reason === 'auto_expired' ? 'expired' : 'finalized'}, ended_at = NOW() WHERE id = ${sessionId}`;
  return inserted.length;
}

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const username = payload.sub;
    const body = await readJsonBody<Record<string, any>>(req);
    const { action } = body;
    const sql = createSql();

    await ensureSchema(sql);
    await ensureLojaSchema(sql);
    // Escopo multi-loja: sessões, itens e consultas são da loja do token.
    const loja = await resolveLoja(sql, payload);
    // Auto-expire only on session-state-relevant actions (skip per-item writes)
    if (action === 'start' || action === 'list_active' || action === 'list_log' || action === 'finalize') {
      await autoExpire(sql);
    }

    if (action === 'start') {
      const { corredor } = body;
      if (!corredor || typeof corredor !== 'string' || corredor.length > 100) {
        sendJson(res, { error: 'Corredor obrigatório' }, 400);
        return;
      }
      const rows = await sql`INSERT INTO arrastao_sessions (corredor, started_by, participants, loja) VALUES (${corredor}, ${username}, ARRAY[${username}]::TEXT[], ${loja}) RETURNING *`;
      sendJson(res, { session: rows[0] });
      return;
    }

    if (action === 'list_active') {
      const sessions = await sql`SELECT s.*, COALESCE((SELECT COUNT(*) FROM arrastao_items i WHERE i.session_id = s.id), 0)::int AS total_items FROM arrastao_sessions s WHERE s.loja = ${loja} AND s.status = 'active' ORDER BY s.started_at DESC`;
      sendJson(res, { sessions });
      return;
    }

    if (action === 'list_log') {
      // History log of finalized/expired sessions
      const sessions = await sql`
        SELECT s.*,
          COALESCE((SELECT COUNT(*) FROM arrastao_items i WHERE i.session_id = s.id), 0)::int AS total_items,
          COALESCE((SELECT COUNT(*) FROM arrastao_items i WHERE i.session_id = s.id AND i.validade < NOW()), 0)::int AS total_vencidos
        FROM arrastao_sessions s
        WHERE s.loja = ${loja} AND s.status IN ('finalized','expired')
        ORDER BY s.ended_at DESC NULLS LAST
        LIMIT 100`;
      sendJson(res, { sessions });
      return;
    }

    if (action === 'join') {
      const { session_id } = body;
      if (!session_id) {
        sendJson(res, { error: 'session_id obrigatório' }, 400);
        return;
      }
      await sql`UPDATE arrastao_sessions SET participants = (
        SELECT ARRAY(SELECT DISTINCT unnest(participants || ARRAY[${username}]::TEXT[]))
      ) WHERE id = ${session_id} AND loja = ${loja} AND status = 'active'`;
      const rows = await sql`SELECT * FROM arrastao_sessions WHERE id = ${session_id} AND loja = ${loja}`;
      sendJson(res, { session: rows[0] });
      return;
    }

    if (action === 'add_item') {
      const { session_id, item } = body;
      if (!session_id || !item?.ean || !item?.codigo || !item?.descricao || !item?.validade) {
        sendJson(res, { error: 'Dados incompletos' }, 400);
        return;
      }
      const isDigits14 = (v: unknown): string | null => {
        if (typeof v !== 'string' && typeof v !== 'number') return null;
        const clean = String(v).trim();
        return /^\d{1,14}$/.test(clean) ? clean : null;
      };
      const cleanEan = isDigits14(item.ean);
      const cleanCodigo = isDigits14(item.codigo);
      const cleanDescricao = typeof item.descricao === 'string' && item.descricao.trim().length > 0 && item.descricao.length <= 500
        ? item.descricao.trim() : null;
      const validadeMs = typeof item.validade === 'string' ? Date.parse(item.validade) : NaN;
      const cleanValidade = !isNaN(validadeMs) ? new Date(validadeMs).toISOString() : null;
      const qtyNum = Number(item.quantidade);
      const cleanQuantidade = Number.isInteger(qtyNum) && qtyNum > 0 && qtyNum <= 100000 ? qtyNum : 1;
      if (!cleanEan || !cleanCodigo || !cleanDescricao || !cleanValidade) {
        sendJson(res, { error: 'Dados inválidos (EAN/código devem ser dígitos até 14, descrição até 500 chars, validade data válida)' }, 400);
        return;
      }
      // Regra de negócio: produto de balança (KG) não entra no Arrastão
      // (a mesma regra da Validade).
      if (await codigoEhKg(sql, cleanCodigo)) {
        sendJson(res, { error: MSG_KG_ARRASTAO }, 400);
        return;
      }
      const s = await sql`SELECT status, participants FROM arrastao_sessions WHERE id = ${session_id} AND loja = ${loja}`;
      if (!s.length || s[0].status !== 'active') {
        sendJson(res, { error: 'Arrastão não está ativo' }, 400);
        return;
      }
      if (!(s[0].participants as string[]).includes(username)) {
        sendJson(res, { error: 'Você não é participante' }, 403);
        return;
      }
      await sql`INSERT INTO arrastao_items (session_id, ean, codigo, descricao, validade, quantidade, scanned_by, loja)
        VALUES (${session_id}, ${cleanEan}, ${cleanCodigo}, ${cleanDescricao}, ${cleanValidade}, ${cleanQuantidade}, ${username}, ${loja})`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'list_items') {
      const { session_id } = body;
      if (!session_id) {
        sendJson(res, { error: 'session_id obrigatório' }, 400);
        return;
      }
      const items = await sql`SELECT * FROM arrastao_items WHERE loja = ${loja} AND session_id = ${session_id} ORDER BY created_at DESC`;
      sendJson(res, { items });
      return;
    }

    if (action === 'consulta_all_items') {
      const { data_inicio, data_fim, incluir_vencidos } = body;
      const incluirVencidos = incluir_vencidos === true;
      const startDate = data_inicio ? new Date(data_inicio).toISOString() : null;
      const endDate = data_fim ? new Date(data_fim + 'T23:59:59').toISOString() : null;

      const conditions: string[] = ['i.validade <= (NOW() + INTERVAL \'7 days\')'];
      const params: unknown[] = [];
      params.push(loja);
      conditions.push(`i.loja = $${params.length}`);
      if (!incluirVencidos) conditions.push('i.validade >= NOW()');
      if (startDate) {
        params.push(startDate);
        conditions.push(`i.created_at >= $${params.length}`);
      }
      if (endDate) {
        params.push(endDate);
        conditions.push(`i.created_at <= $${params.length}`);
      }
      // O encarregado vê apenas os itens coletados por ele e pela equipe.
      if (payload.role === 'encarregado') {
        await ensureEncarregadosSchema(sql);
        const equipe = [...new Set([username, ...(await usuariosDaEquipe(sql, username, loja))])];
        params.push(equipe);
        conditions.push(`i.scanned_by = ANY($${params.length}::text[])`);
      }

      const limit = startDate || endDate ? '' : ' LIMIT 500';
      const data = await sql(
        `SELECT i.id, i.ean, i.codigo, i.descricao, i.validade, i.quantidade,
                i.scanned_by AS created_by, i.created_at,
                (i.validade >= NOW()) AS status, s.corredor
           FROM arrastao_items i
           JOIN arrastao_sessions s ON s.id = i.session_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY i.validade ASC${limit}`,
        params,
      );
      sendJson(res, { items: data });
      return;
    }

    if (action === 'remove_item') {
      const { item_id, session_id } = body;
      if (!item_id || !session_id) {
        sendJson(res, { error: 'IDs obrigatórios' }, 400);
        return;
      }
      const s = await sql`SELECT participants, status FROM arrastao_sessions WHERE id = ${session_id} AND loja = ${loja}`;
      if (!s.length || s[0].status !== 'active' || !(s[0].participants as string[]).includes(username)) {
        sendJson(res, { error: 'Sem permissão' }, 403);
        return;
      }
      await sql`DELETE FROM arrastao_items WHERE loja = ${loja} AND id = ${item_id} AND session_id = ${session_id}`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'finalize') {
      const { session_id } = body;
      if (!session_id) {
        sendJson(res, { error: 'session_id obrigatório' }, 400);
        return;
      }
      const s = await sql`SELECT started_by, status FROM arrastao_sessions WHERE id = ${session_id} AND loja = ${loja}`;
      if (!s.length) {
        sendJson(res, { error: 'Não encontrado' }, 404);
        return;
      }
      if (s[0].status !== 'active') {
        sendJson(res, { success: true, already: true });
        return;
      }
      if (s[0].started_by !== username && payload.role !== 'admin') {
        sendJson(res, { error: 'Apenas o criador do arrastão pode finalizá-lo' }, 403);
        return;
      }
      const count = await finalizeSession(sql, session_id, 'manual');
      sendJson(res, { success: true, transferred: count });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('Manage arrastao error:', error);
    sendJson(res, { error: 'Erro interno' }, 500);
  }
};

export default handler;
