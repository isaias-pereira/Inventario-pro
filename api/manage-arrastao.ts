import { createSql, type Sql } from './_lib/db';
import { authenticate } from './_lib/auth';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http';

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
    status TEXT NOT NULL DEFAULT 'active'
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_items_session ON arrastao_items(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_items_validade ON arrastao_items(validade)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_items_created_at ON arrastao_items(created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_arrastao_sessions_status_started ON arrastao_sessions(status, started_at DESC)`;
  schemaReady = true;
}

async function autoExpire(sql: Sql) {
  // Find sessions exceeding 6h still active -> finalize automatically
  const expired = await sql`SELECT id FROM arrastao_sessions WHERE status = 'active' AND started_at < (NOW() - INTERVAL '6 hours')`;
  for (const s of expired as Array<{ id: string }>) {
    await finalizeSession(sql, s.id, 'auto_expired');
  }
}

async function finalizeSession(sql: Sql, sessionId: string, reason: string) {
  // Bulk-transfer items to validade_products in a single INSERT...SELECT (was N round-trips)
  const inserted = await sql`
    INSERT INTO validade_products (ean, codigo, descricao, validade, quantidade, status, created_by)
    SELECT ean, codigo, descricao, validade, quantidade, true, scanned_by
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
      const rows = await sql`INSERT INTO arrastao_sessions (corredor, started_by, participants) VALUES (${corredor}, ${username}, ARRAY[${username}]::TEXT[]) RETURNING *`;
      sendJson(res, { session: rows[0] });
      return;
    }

    if (action === 'list_active') {
      const sessions = await sql`SELECT s.*, COALESCE((SELECT COUNT(*) FROM arrastao_items i WHERE i.session_id = s.id), 0)::int AS total_items FROM arrastao_sessions s WHERE s.status = 'active' ORDER BY s.started_at DESC`;
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
        WHERE s.status IN ('finalized','expired')
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
      ) WHERE id = ${session_id} AND status = 'active'`;
      const rows = await sql`SELECT * FROM arrastao_sessions WHERE id = ${session_id}`;
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
      const s = await sql`SELECT status, participants FROM arrastao_sessions WHERE id = ${session_id}`;
      if (!s.length || s[0].status !== 'active') {
        sendJson(res, { error: 'Arrastão não está ativo' }, 400);
        return;
      }
      if (!(s[0].participants as string[]).includes(username)) {
        sendJson(res, { error: 'Você não é participante' }, 403);
        return;
      }
      await sql`INSERT INTO arrastao_items (session_id, ean, codigo, descricao, validade, quantidade, scanned_by)
        VALUES (${session_id}, ${cleanEan}, ${cleanCodigo}, ${cleanDescricao}, ${cleanValidade}, ${cleanQuantidade}, ${username})`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'list_items') {
      const { session_id } = body;
      if (!session_id) {
        sendJson(res, { error: 'session_id obrigatório' }, 400);
        return;
      }
      const items = await sql`SELECT * FROM arrastao_items WHERE session_id = ${session_id} ORDER BY created_at DESC`;
      sendJson(res, { items });
      return;
    }

    if (action === 'consulta_all_items') {
      const { data_inicio, data_fim } = body;
      const startDate = data_inicio ? new Date(data_inicio).toISOString() : null;
      const endDate = data_fim ? new Date(data_fim + 'T23:59:59').toISOString() : null;
      // Apenas produtos com validade próxima (vencendo em até 7 dias e ainda ativos)
      let data;
      if (startDate && endDate) {
        data = await sql`SELECT i.id, i.ean, i.codigo, i.descricao, i.validade, i.quantidade, i.scanned_by AS created_by, i.created_at, (i.validade >= NOW()) AS status, s.corredor FROM arrastao_items i JOIN arrastao_sessions s ON s.id = i.session_id WHERE i.validade >= NOW() AND i.validade <= (NOW() + INTERVAL '7 days') AND i.created_at >= ${startDate} AND i.created_at <= ${endDate} ORDER BY i.validade ASC`;
      } else if (startDate) {
        data = await sql`SELECT i.id, i.ean, i.codigo, i.descricao, i.validade, i.quantidade, i.scanned_by AS created_by, i.created_at, (i.validade >= NOW()) AS status, s.corredor FROM arrastao_items i JOIN arrastao_sessions s ON s.id = i.session_id WHERE i.validade >= NOW() AND i.validade <= (NOW() + INTERVAL '7 days') AND i.created_at >= ${startDate} ORDER BY i.validade ASC`;
      } else if (endDate) {
        data = await sql`SELECT i.id, i.ean, i.codigo, i.descricao, i.validade, i.quantidade, i.scanned_by AS created_by, i.created_at, (i.validade >= NOW()) AS status, s.corredor FROM arrastao_items i JOIN arrastao_sessions s ON s.id = i.session_id WHERE i.validade >= NOW() AND i.validade <= (NOW() + INTERVAL '7 days') AND i.created_at <= ${endDate} ORDER BY i.validade ASC`;
      } else {
        data = await sql`SELECT i.id, i.ean, i.codigo, i.descricao, i.validade, i.quantidade, i.scanned_by AS created_by, i.created_at, (i.validade >= NOW()) AS status, s.corredor FROM arrastao_items i JOIN arrastao_sessions s ON s.id = i.session_id WHERE i.validade >= NOW() AND i.validade <= (NOW() + INTERVAL '7 days') ORDER BY i.validade ASC LIMIT 500`;
      }
      sendJson(res, { items: data });
      return;
    }

    if (action === 'remove_item') {
      const { item_id, session_id } = body;
      if (!item_id || !session_id) {
        sendJson(res, { error: 'IDs obrigatórios' }, 400);
        return;
      }
      const s = await sql`SELECT participants, status FROM arrastao_sessions WHERE id = ${session_id}`;
      if (!s.length || s[0].status !== 'active' || !(s[0].participants as string[]).includes(username)) {
        sendJson(res, { error: 'Sem permissão' }, 403);
        return;
      }
      await sql`DELETE FROM arrastao_items WHERE id = ${item_id} AND session_id = ${session_id}`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'finalize') {
      const { session_id } = body;
      if (!session_id) {
        sendJson(res, { error: 'session_id obrigatório' }, 400);
        return;
      }
      const s = await sql`SELECT started_by, status FROM arrastao_sessions WHERE id = ${session_id}`;
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
