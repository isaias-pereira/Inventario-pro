import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";
import bcrypt from "npm:bcryptjs@2.4.3";

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
    const reqBody = await req.json();
    const { action, newUser } = reqBody;
    const sql = neon(sanitizeUrl(Deno.env.get('NEON_DATABASE_URL') || ''));

    // JWT auth
    const token = req.headers.get('authorization')?.replace('Bearer ', '') || '';
    const payload = await verifyJwt(token, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (!payload || payload.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acesso negado. Somente administradores.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminUsername = payload.sub;

    if (action === 'list') {
      const users = await sql`SELECT id, username, role, created_at FROM app_users ORDER BY created_at ASC`;
      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'add') {
      if (!newUser?.username || !newUser?.password) {
        return new Response(JSON.stringify({ error: 'Usuário e senha são obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const hashedPw = await bcrypt.hash(newUser.password, 10);

      try {
        await sql`INSERT INTO app_users (username, password, role) VALUES (${newUser.username}, ${hashedPw}, ${newUser.role || 'user'})`;
      } catch (e: any) {
        if (e.message?.includes('duplicate') || e.message?.includes('unique')) {
          return new Response(JSON.stringify({ error: 'Este usuário já existe' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        throw e;
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update') {
      if (!newUser?.username || !newUser?.role) {
        return new Response(JSON.stringify({ error: 'Usuário e perfil são obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (newUser.password) {
        const hashedPw = await bcrypt.hash(newUser.password, 10);
        await sql`UPDATE app_users SET role = ${newUser.role}, password = ${hashedPw} WHERE username = ${newUser.username}`;
      } else {
        await sql`UPDATE app_users SET role = ${newUser.role} WHERE username = ${newUser.username}`;
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete') {
      if (!newUser?.username) {
        return new Response(JSON.stringify({ error: 'Usuário é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (newUser.username === adminUsername) {
        return new Response(JSON.stringify({ error: 'Não é possível remover seu próprio usuário' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await sql`DELETE FROM app_users WHERE username = ${newUser.username}`;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Manage users error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
