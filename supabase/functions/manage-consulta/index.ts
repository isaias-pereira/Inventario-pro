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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const payload = await verifyJwt(token, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (!payload) return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json();
    const { action } = body;
    const sql = neon(sanitizeUrl(Deno.env.get('NEON_DATABASE_URL') || ''));

    if (action === 'list') {
      const data = await sql`SELECT codigo, descricao, estoque, preco FROM consulta_products ORDER BY created_at ASC`;
      return new Response(JSON.stringify({ items: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'replace') {
      if (payload.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Acesso restrito a administradores' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { products } = body;
      if (!Array.isArray(products) || products.length === 0) {
        return new Response(JSON.stringify({ error: 'Lista de produtos é obrigatória' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await sql`DELETE FROM consulta_products`;

      // Bulk insert via json_to_recordset (1 round-trip per batch instead of N)
      const batchSize = 500;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize).map((p: any) => ({
          codigo: String(p.codigo),
          descricao: String(p.descricao),
          estoque: Number(p.estoque) || 0,
          preco: Number(p.preco) || 0,
        }));
        await sql`
          INSERT INTO consulta_products (codigo, descricao, estoque, preco)
          SELECT codigo, descricao, estoque, preco
          FROM json_to_recordset(${JSON.stringify(batch)}::json)
          AS x(codigo text, descricao text, estoque numeric, preco numeric)`;
      }

      return new Response(JSON.stringify({ success: true, count: products.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Manage consulta error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
