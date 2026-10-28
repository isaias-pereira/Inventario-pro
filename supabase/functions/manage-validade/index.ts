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

const MOTIVOS_VALIDADE = ['Excesso', 'Qualidade'];

/** Motivo do rebaixa para produtos de balança (KG). Vazio ou nulo = sem motivo. */
function normalizeMotivo(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const found = MOTIVOS_VALIDADE.find((m) => m.toLowerCase() === value.trim().toLowerCase());
  return found ? { ok: true, value: found } : { ok: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return new Response(JSON.stringify({ error: 'Token obrigatório' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const payload = await verifyJwt(token, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (!payload) return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const username = payload.sub;
    const body = await req.json();
    const { action } = body;
    const sql = neon(sanitizeUrl(Deno.env.get('NEON_DATABASE_URL') || ''));

    // Ensure performance indexes (idempotent, once per cold start)
    if (!(globalThis as any).__validadeIdx) {
      try {
        await sql`CREATE INDEX IF NOT EXISTS idx_validade_status_validade ON validade_products(status, validade)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_validade_created_by ON validade_products(created_by)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_validade_created_at ON validade_products(created_at)`;
      } catch { /* ignore */ }
      (globalThis as any).__validadeIdx = true;
    }

    // Coluna do motivo (Excesso/Qualidade) usada nos produtos de balança (KG).
    const ensureMotivoColumn = async (): Promise<boolean> => {
      if (typeof (globalThis as any).__validadeMotivo === 'boolean') return (globalThis as any).__validadeMotivo;
      try {
        await sql`ALTER TABLE validade_products ADD COLUMN IF NOT EXISTS motivo VARCHAR(20)`;
        (globalThis as any).__validadeMotivo = true;
      } catch {
        try {
          const rows = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'validade_products' AND column_name = 'motivo'`;
          (globalThis as any).__validadeMotivo = rows.length > 0;
        } catch { (globalThis as any).__validadeMotivo = false; }
      }
      return (globalThis as any).__validadeMotivo;
    };

    // Auto-expire only on read actions (avoid unnecessary write on every request)
    const readActions = new Set(['list', 'list_all', 'notifications', 'consulta_periodo']);
    if (readActions.has(action)) {
      await sql`UPDATE validade_products SET status = false WHERE status = true AND validade < NOW()`;
    }

    // LIST - items expiring within 2 days
    if (action === 'list') {
      const data = await sql`
        SELECT * FROM validade_products 
        WHERE status = true AND validade <= (NOW() + INTERVAL '2 days')
        ORDER BY validade ASC`;
      return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // LIST_ALL
    if (action === 'list_all') {
      const userRole = payload.role;

      if (userRole === 'col_validade') {
        const data = await sql`SELECT * FROM validade_products WHERE status = true AND created_by = ${username} ORDER BY validade ASC`;
        return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (userRole === 'promotor') {
        const data = await sql`
          SELECT v.* FROM validade_products v
          INNER JOIN app_users u ON v.created_by = u.username
          WHERE v.status = true AND u.role = 'promotor'
          ORDER BY v.validade ASC`;
        return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (userRole === 'user' || userRole === 'encarregado' || userRole === 'enc_flv') {
        const data = await sql`
          SELECT v.* FROM validade_products v
          INNER JOIN app_users u ON v.created_by = u.username
          WHERE v.status = true AND u.role IN ('promotor', 'user', 'encarregado', 'enc_flv', 'col_validade')
          ORDER BY v.validade ASC`;
        return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // admin sees all
      const data = await sql`SELECT * FROM validade_products WHERE status = true ORDER BY validade ASC`;
      return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ADD
    if (action === 'add') {
      const { item } = body;
      if (!item || !item.ean || !item.codigo || !item.descricao || !item.validade) {
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
      const motivo = normalizeMotivo(item.motivo);
      if (!cleanEan || !cleanCodigo || !cleanDescricao || !cleanValidade) {
        return new Response(JSON.stringify({ error: 'Dados inválidos (EAN/código devem ser dígitos até 14, descrição até 500 chars, validade data válida)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!motivo.ok) {
        return new Response(JSON.stringify({ error: 'Motivo inválido (use Excesso ou Qualidade)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (await ensureMotivoColumn()) {
        await sql`INSERT INTO validade_products (ean, codigo, descricao, validade, quantidade, status, created_by, motivo)
          VALUES (${cleanEan}, ${cleanCodigo}, ${cleanDescricao}, ${cleanValidade}, ${cleanQuantidade}, true, ${username}, ${motivo.value})`;
      } else {
        await sql`INSERT INTO validade_products (ean, codigo, descricao, validade, quantidade, status, created_by)
          VALUES (${cleanEan}, ${cleanCodigo}, ${cleanDescricao}, ${cleanValidade}, ${cleanQuantidade}, true, ${username})`;
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // UPDATE (admin only)
    if (action === 'update') {
      if (payload.role !== 'admin') return new Response(JSON.stringify({ error: 'Apenas admin pode editar' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { id, validade: newValidade, quantidade: newQuantidade } = body;
      if (!id || !newValidade) return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const hasMotivo = 'motivo' in body;
      const motivo = hasMotivo ? normalizeMotivo(body.motivo) : { ok: true as const, value: null };
      if (!motivo.ok) {
        return new Response(JSON.stringify({ error: 'Motivo inválido (use Excesso ou Qualidade)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (hasMotivo && await ensureMotivoColumn()) {
        await sql`UPDATE validade_products SET validade = ${newValidade}, quantidade = COALESCE(${newQuantidade ?? null}, quantidade), motivo = ${motivo.value} WHERE id = ${id}`;
      } else if (newQuantidade !== undefined) {
        await sql`UPDATE validade_products SET validade = ${newValidade}, quantidade = ${newQuantidade} WHERE id = ${id}`;
      } else {
        await sql`UPDATE validade_products SET validade = ${newValidade} WHERE id = ${id}`;
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // REMOVE (admin only)
    if (action === 'remove') {
      if (payload.role !== 'admin') return new Response(JSON.stringify({ error: 'Apenas admin pode remover' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { id } = body;
      if (!id) return new Response(JSON.stringify({ error: 'ID obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      await sql`UPDATE validade_products SET status = false WHERE id = ${id}`;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // CONSULTA_PERIODO
    if (action === 'consulta_periodo') {
      if (payload.role !== 'admin' && payload.role !== 'encarregado') {
        return new Response(JSON.stringify({ error: 'Acesso restrito a admin e encarregado' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data_inicio, data_fim, created_by } = body;
      if (!data_inicio && !data_fim && !created_by) {
        return new Response(JSON.stringify({ error: 'Informe data ou usuário' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const startDate = data_inicio ? new Date(data_inicio).toISOString() : null;
      const endDate = data_fim ? new Date(data_fim + 'T23:59:59').toISOString() : null;

      let data;
      if (startDate && endDate && created_by) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at >= ${startDate} AND created_at <= ${endDate} AND created_by = ${created_by} ORDER BY validade ASC`;
      } else if (startDate && endDate) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at >= ${startDate} AND created_at <= ${endDate} ORDER BY validade ASC`;
      } else if (startDate && created_by) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at >= ${startDate} AND created_by = ${created_by} ORDER BY validade ASC`;
      } else if (endDate && created_by) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at <= ${endDate} AND created_by = ${created_by} ORDER BY validade ASC`;
      } else if (startDate) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at >= ${startDate} ORDER BY validade ASC`;
      } else if (endDate) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at <= ${endDate} ORDER BY validade ASC`;
      } else {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_by = ${created_by} ORDER BY validade ASC`;
      }
      return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // LIST_USERS
    if (action === 'list_users') {
      if (payload.role !== 'admin' && payload.role !== 'encarregado') {
        return new Response(JSON.stringify({ error: 'Acesso restrito' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const data = await sql`SELECT DISTINCT created_by FROM validade_products WHERE created_by IS NOT NULL ORDER BY created_by`;
      const users = data.map((r: any) => r.created_by);
      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // NOTIFICATIONS
    if (action === 'notifications') {
      const data = await sql`
        SELECT * FROM validade_products 
        WHERE status = true AND validade <= (NOW() + INTERVAL '2 days')
        ORDER BY validade ASC`;
      return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Manage validade error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
