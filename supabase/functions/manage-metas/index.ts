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
  try {
    const u = new URL(url);
    u.searchParams.delete('channel_binding');
    url = u.toString();
  } catch { /* keep as-is */ }
  return url;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const jwt = await verifyJwt(token, secret);
    if (!jwt) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const dbUrl = sanitizeUrl(Deno.env.get('NEON_DATABASE_URL') || '');
    const sql = neon(dbUrl);

    // Ensure table exists
    await sql`CREATE TABLE IF NOT EXISTS metas_mensais (
      id SERIAL PRIMARY KEY,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      dia INTEGER NOT NULL,
      meta NUMERIC DEFAULT 0,
      realizado NUMERIC DEFAULT 0,
      UNIQUE(ano, mes, dia)
    )`;

    const { action, ano, mes, items, realizadoItems } = await req.json();

    if (action === 'get') {
      const rows = await sql`SELECT * FROM metas_mensais WHERE ano = ${ano} AND mes = ${mes} ORDER BY dia`;
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'save_meta') {
      if (jwt.role !== 'admin') return new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const deduped = new Map<number, number>();
      for (const i of (items as { dia: number; meta: number }[])) {
        deduped.set(i.dia, i.meta);
      }

      for (const [dia, meta] of deduped.entries()) {
        await sql`INSERT INTO metas_mensais (ano, mes, dia, meta) VALUES (${ano}, ${mes}, ${dia}, ${meta}) ON CONFLICT (ano, mes, dia) DO UPDATE SET meta = ${meta}`;
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'save_realizado') {
      if (jwt.role !== 'admin') return new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      for (const item of (realizadoItems as { dia: number; venda: number }[])) {
        await sql`UPDATE metas_mensais SET realizado = ${item.venda} WHERE ano = ${ano} AND mes = ${mes} AND dia = ${item.dia}`;
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('manage-metas error:', err);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
