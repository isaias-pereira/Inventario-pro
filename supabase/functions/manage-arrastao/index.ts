import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface JwtPayload { sub: string; role: string; exp: number }

async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(body)) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function sanitizeUrl(raw: string): string {
  let url = raw.replace(/^psql\s+/, '').replace(/^["']|["']$/g, '').trim();
  try { const u = new URL(url); u.searchParams.delete('channel_binding'); url = u.toString(); } catch { /* keep */ }
  return url;
}

let schemaReady = false;
async function ensureSchema(sql: ReturnType<typeof neon>) {
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

async function autoExpire(sql: ReturnType<typeof neon>) {
  // Find sessions exceeding 6h still active -> finalize automatically
  const expired = await sql`SELECT id FROM arrastao_sessions WHERE status = 'active' AND started_at < (NOW() - INTERVAL '6 hours')` as Array<{ id: string }>;
  for (const s of expired) {
    await finalizeSession(sql, s.id, 'auto_expired');
  }
}

async function finalizeSession(sql: ReturnType<typeof neon>, sessionId: string, reason: string) {
  // Bulk-transfer items to validade_products in a single INSERT...SELECT (was N round-trips)
  const inserted = await sql`
    INSERT INTO validade_products (ean, codigo, descricao, validade, quantidade, status, created_by)
    SELECT ean, codigo, descricao, validade, quantidade, true, scanned_by
    FROM arrastao_items WHERE session_id = ${sessionId}
    RETURNING id` as Array<{ id: string }>;
  await sql`UPDATE arrastao_sessions SET status = ${reason === 'auto_expired' ? 'expired' : 'finalized'}, ended_at = NOW() WHERE id = ${sessionId}`;
  return inserted.length;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return new Response(JSON.stringify({ error: 'Token obrigatório' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const payload = await verifyJwt(token, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (!payload) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const username = payload.sub;
    const body = await req.json();
    const { action } = body;
    const sql = neon(sanitizeUrl(Deno.env.get('NEON_DATABASE_URL') || ''));

    await ensureSchema(sql);
    // Auto-expire only on session-state-relevant actions (skip per-item writes)
    if (action === 'start' || action === 'list_active' || action === 'list_log' || action === 'finalize') {
      await autoExpire(sql);
    }

    if (action === 'start') {
      const { corredor } = body;
      if (!corredor || typeof corredor !== 'string' || corredor.length > 100) {
        return new Response(JSON.stringify({ error: 'Corredor obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const rows = await sql`INSERT INTO arrastao_sessions (corredor, started_by, participants) VALUES (${corredor}, ${username}, ARRAY[${username}]::TEXT[]) RETURNING *` as Array<Record<string, unknown>>;
      return new Response(JSON.stringify({ session: rows[0] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list_active') {
      const sessions = await sql`SELECT s.*, COALESCE((SELECT COUNT(*) FROM arrastao_items i WHERE i.session_id = s.id), 0)::int AS total_items FROM arrastao_sessions s WHERE s.status = 'active' ORDER BY s.started_at DESC`;
      return new Response(JSON.stringify({ sessions }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
      return new Response(JSON.stringify({ sessions }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'join') {
      const { session_id } = body;
      if (!session_id) return new Response(JSON.stringify({ error: 'session_id obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      await sql`UPDATE arrastao_sessions SET participants = (
        SELECT ARRAY(SELECT DISTINCT unnest(participants || ARRAY[${username}]::TEXT[]))
      ) WHERE id = ${session_id} AND status = 'active'`;
      const rows = await sql`SELECT * FROM arrastao_sessions WHERE id = ${session_id}` as Array<Record<string, unknown>>;
      return new Response(JSON.stringify({ session: rows[0] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'add_item') {
      const { session_id, item } = body;
      if (!session_id || !item?.ean || !item?.codigo || !item?.descricao || !item?.validade) {
        return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        return new Response(JSON.stringify({ error: 'Dados inválidos (EAN/código devem ser dígitos até 14, descrição até 500 chars, validade data válida)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const s = await sql`SELECT status, participants FROM arrastao_sessions WHERE id = ${session_id}` as Array<{ status: string; participants: string[] }>;
      if (!s.length || s[0].status !== 'active') return new Response(JSON.stringify({ error: 'Arrastão não está ativo' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (!s[0].participants.includes(username)) return new Response(JSON.stringify({ error: 'Você não é participante' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      await sql`INSERT INTO arrastao_items (session_id, ean, codigo, descricao, validade, quantidade, scanned_by)
        VALUES (${session_id}, ${cleanEan}, ${cleanCodigo}, ${cleanDescricao}, ${cleanValidade}, ${cleanQuantidade}, ${username})`;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list_items') {
      const { session_id } = body;
      if (!session_id) return new Response(JSON.stringify({ error: 'session_id obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const items = await sql`SELECT * FROM arrastao_items WHERE session_id = ${session_id} ORDER BY created_at DESC`;
      return new Response(JSON.stringify({ items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
      return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'remove_item') {
      const { item_id, session_id } = body;
      if (!item_id || !session_id) return new Response(JSON.stringify({ error: 'IDs obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const s = await sql`SELECT participants, status FROM arrastao_sessions WHERE id = ${session_id}` as Array<{ participants: string[]; status: string }>;
      if (!s.length || s[0].status !== 'active' || !s[0].participants.includes(username)) {
        return new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await sql`DELETE FROM arrastao_items WHERE id = ${item_id} AND session_id = ${session_id}`;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'finalize') {
      const { session_id } = body;
      if (!session_id) return new Response(JSON.stringify({ error: 'session_id obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const s = await sql`SELECT started_by, status FROM arrastao_sessions WHERE id = ${session_id}` as Array<{ started_by: string; status: string }>;
      if (!s.length) return new Response(JSON.stringify({ error: 'Não encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (s[0].status !== 'active') return new Response(JSON.stringify({ success: true, already: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (s[0].started_by !== username && payload.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Apenas o criador do arrastão pode finalizá-lo' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const count = await finalizeSession(sql, session_id, 'manual');
      return new Response(JSON.stringify({ success: true, transferred: count }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Manage arrastao error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
