import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function sanitizeUrl(raw: string): string {
  let url = raw.replace(/^psql\s+/, '').replace(/^["']|["']$/g, '').trim();
  try { const u = new URL(url); u.searchParams.delete('channel_binding'); url = u.toString(); } catch { /* keep */ }
  return url;
}

async function createJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const body = btoa(JSON.stringify(payload)).replace(/=/g, '');
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${data}.${signature}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Usuário e senha são obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sql = neon(sanitizeUrl(Deno.env.get('NEON_DATABASE_URL') || ''));

    const rows = await sql`SELECT username, password, role FROM app_users WHERE username = ${username} LIMIT 1`;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Usuário ou senha inválidos' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const user = rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: 'Usuário ou senha inválidos' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const now = Math.floor(Date.now() / 1000);
    const token = await createJwt(
      { sub: user.username, role: user.role, iat: now, exp: now + 6 * 3600 },
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    return new Response(
      JSON.stringify({ success: true, user: { username: user.username, role: user.role }, token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Login error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
