import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { identifier, productInput, canManageProducts } from './validation.ts';
import { query, type BatchResult } from './gateway.ts';

interface JwtPayload { sub: string; role: string; exp: number }
async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const decode = (value: string) => atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    if (JSON.parse(decode(header)).alg !== 'HS256') return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = Uint8Array.from(decode(signature), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify('HMAC', key, sig, encoder.encode(`${header}.${body}`))) return null;
    const payload = JSON.parse(decode(body)) as JwtPayload;
    if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const productSelect = `SELECT p.ean::text, p.codigo::text, p.descricao, p.tipo,
  ARRAY(SELECT DISTINCT c::text FROM (SELECT p.codigo c UNION ALL SELECT codigo FROM public.produto_codigos WHERE produto_codigo=p.codigo) codes ORDER BY c::text) codigos,
  ARRAY(SELECT e::text FROM (SELECT p.ean e UNION SELECT ean FROM public.produto_eans WHERE produto_codigo=p.codigo) eans WHERE e IS NOT NULL ORDER BY e) eans
  FROM public.produto p`;
const codeCondition = `p.codigo=$1::bigint OR p.codigo IN (SELECT produto_codigo FROM public.produto_codigos WHERE codigo=$1::bigint)`;
const allCondition = `(${codeCondition}) OR p.ean=$1::bigint OR p.codigo IN (SELECT produto_codigo FROM public.produto_eans WHERE ean=$1::bigint)`;
async function findProduct(value: string, byCode = false) {
  const result = await query(`${productSelect} WHERE ${byCode ? codeCondition : allCondition} ORDER BY (p.ean=$1::bigint) DESC NULLS LAST LIMIT 1`, [value]);
  return result.rows[0] || null;
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido' }, 405);
  try {
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret) return reply({ error: 'Serviço indisponível' }, 503);
    const payload = await verifyJwt(req.headers.get('authorization')?.replace(/^Bearer /i, '') || '', secret);
    if (!payload) return reply({ error: 'Autenticação obrigatória' }, 401);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return reply({ error: 'Dados inválidos' }, 400); }
    if (!body || Array.isArray(body) || typeof body !== 'object') return reply({ error: 'Dados inválidos' }, 400);
    const action = body.action;
    if (action !== undefined && !['check', 'insert', 'edit_lookup', 'update'].includes(String(action))) return reply({ error: 'Ação inválida' }, 400);
    if (['insert', 'update', 'edit_lookup'].includes(String(action)) && !canManageProducts(payload.role)) return reply({ error: 'Apenas administradores podem gerenciar produtos' }, 403);
    const codigo = identifier(body.codigo);
    if (!codigo) return reply({ error: 'Código inválido (apenas dígitos, até 14)' }, 400);
    if (action === 'check') {
      const product = await findProduct(codigo, true);
      return reply({ exists: !!product, product });
    }
    if (action === 'insert' || action === 'update') {
      const input = productInput(body, action === 'update');
      if (!input) return reply({ error: 'Verifique EANs, código, descrição (até 100 caracteres) e tipo (até 10 caracteres)' }, 400);
      const { ean, descricao, tipo, eans } = input;
      const lock = { query: 'LOCK TABLE public.produto, public.produto_codigos, public.produto_eans IN SHARE ROW EXCLUSIVE MODE' };
      if (action === 'update') {
        const original = identifier(body.originalCodigo);
        if (!original) return reply({ error: 'Produto original inválido' }, 400);
        // All guards and writes run under the same table lock. A failed guard rolls back everything.
        const params = [original, codigo, ean, descricao, tipo || null, eans];
        await query<BatchResult>([
          lock,
          { query: `SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$2::bigint AND codigo<>$1::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$2::bigint AND produto_codigo<>$1::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto WHERE ean=ANY($3::bigint[]) AND codigo<>$1::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=ANY($3::bigint[]) AND produto_codigo<>$1::bigint)
            THEN 1 ELSE 0 END`, params: [original, codigo, eans] },
          { query: `INSERT INTO public.produto (codigo,ean,descricao,tipo) SELECT $2::bigint,$3::bigint,$4,$5 FROM public.produto WHERE codigo=$1::bigint AND $1::bigint<>$2::bigint`, params: params.slice(0,5) },
          { query: 'DELETE FROM public.produto_codigos WHERE codigo=$2::bigint AND produto_codigo=$1::bigint', params: [original,codigo] },
          { query: 'UPDATE public.produto_codigos SET produto_codigo=$2::bigint WHERE produto_codigo=$1::bigint', params: [original,codigo] },
          { query: 'UPDATE public.produto_eans SET produto_codigo=$2::bigint WHERE produto_codigo=$1::bigint', params: [original,codigo] },
          { query: 'DELETE FROM public.produto WHERE codigo=$1::bigint AND $1::bigint<>$2::bigint', params: [original,codigo] },
          { query: 'UPDATE public.produto SET ean=$2::bigint,descricao=$3,tipo=$4 WHERE codigo=$1::bigint', params: [codigo,ean,descricao,tipo || null] },
          { query: 'DELETE FROM public.produto_eans WHERE produto_codigo=$1::bigint', params: [codigo] },
          { query: 'INSERT INTO public.produto_eans (ean,produto_codigo) SELECT value,$1::bigint FROM unnest($2::bigint[]) value WHERE value<>$3::bigint', params: [codigo,eans,ean] },
        ], [], true);
        return reply({ success: true, action: 'updated', product: await findProduct(codigo,true) });
      }
      const existing = await findProduct(codigo,true);
      const owner = await query('SELECT codigo::text FROM public.produto WHERE ean=$1::bigint UNION SELECT produto_codigo::text FROM public.produto_eans WHERE ean=$1::bigint LIMIT 2', [ean]);
      if (existing) {
        if (owner.rows.some(row => row.codigo !== existing.codigo)) return reply({ error: 'EAN já pertence a outro produto' },409);
        await query([
          lock,
          { query: `SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM public.produto WHERE codigo=$2::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto WHERE ean=$1::bigint AND codigo<>$2::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=$1::bigint AND produto_codigo<>$2::bigint) THEN 1 ELSE 0 END`, params:[ean,existing.codigo] },
          { query: 'INSERT INTO public.produto_eans (ean,produto_codigo) SELECT $1::bigint,$2::bigint WHERE NOT EXISTS (SELECT 1 FROM public.produto WHERE ean=$1::bigint) ON CONFLICT (ean) DO NOTHING', params:[ean,existing.codigo] },
        ],[],true);
        return reply({ success:true, action:'ean_linked', alreadyLinked:owner.rows.length>0, product:await findProduct(String(existing.codigo),true) });
      }
      if (owner.rows.length > 0) {
        const main = owner.rows[0].codigo;
        await query([
          lock,
          { query:'SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint) THEN 1 ELSE 0 END',params:[codigo] },
          { query:'INSERT INTO public.produto_codigos (codigo,produto_codigo) VALUES ($1::bigint,$2::bigint)', params:[codigo,main] },
        ],[],true);
        return reply({success:true,action:'linked',product:await findProduct(String(main),true)});
      }
      await query([
        lock,
        {query:`SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint OR ean=$2::bigint)
          AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$1::bigint)
          AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=$2::bigint) THEN 1 ELSE 0 END`,params:[codigo,ean]},
        {query:'INSERT INTO public.produto (ean,codigo,descricao,tipo) VALUES ($1::bigint,$2::bigint,$3,$4)',params:[ean,codigo,descricao,tipo || null]},
      ],[],true);
      return reply({success:true,action:'created'});
    }
    const product = await findProduct(codigo);
    return reply({found:!!product,product});
  } catch (error) {
    console.error('Error querying product:', error instanceof Error ? error.message : 'Unknown error');
    const known = error as { status?: number; message?: string };
    return reply({error:known.status ? known.message : 'Erro interno do servidor'},known.status || 500);
  }
});
