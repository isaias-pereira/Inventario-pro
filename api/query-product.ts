import { createSql, type BatchResult } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { identifier, productInput, canManageProducts } from './_lib/product-validation.js';

const productSelect = `SELECT p.ean::text, p.codigo::text, p.descricao, p.tipo,
  ARRAY(SELECT DISTINCT c::text FROM (SELECT p.codigo c UNION ALL SELECT codigo FROM public.produto_codigos WHERE produto_codigo=p.codigo) codes ORDER BY c::text) codigos,
  ARRAY(SELECT e::text FROM (SELECT p.ean e UNION SELECT ean FROM public.produto_eans WHERE produto_codigo=p.codigo) eans WHERE e IS NOT NULL ORDER BY e) eans
  FROM public.produto p`;
const codeCondition = `p.codigo=$1::bigint OR p.codigo IN (SELECT produto_codigo FROM public.produto_codigos WHERE codigo=$1::bigint)`;
const allCondition = `(${codeCondition}) OR p.ean=$1::bigint OR p.codigo IN (SELECT produto_codigo FROM public.produto_eans WHERE ean=$1::bigint)`;

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const body = await readJsonBody<Record<string, unknown>>(req);
    const action = body.action;
    if (action !== undefined && !['check', 'insert', 'edit_lookup', 'update'].includes(String(action))) {
      sendJson(res, { error: 'Ação inválida' }, 400);
      return;
    }
    if (['insert', 'update', 'edit_lookup'].includes(String(action)) && !canManageProducts(payload.role)) {
      sendJson(res, { error: 'Apenas administradores podem gerenciar produtos' }, 403);
      return;
    }

    const codigo = identifier(body.codigo);
    if (!codigo) {
      sendJson(res, { error: 'Código inválido (apenas dígitos, até 14)' }, 400);
      return;
    }

    const sql = createSql();
    const findProduct = async (value: string, byCode = false) => {
      const rows = await sql(
        `${productSelect} WHERE ${byCode ? codeCondition : allCondition} ORDER BY (p.ean=$1::bigint) DESC NULLS LAST LIMIT 1`,
        [value],
      );
      return rows[0] ?? null;
    };

    if (action === 'check') {
      const product = await findProduct(codigo, true);
      sendJson(res, { exists: !!product, product });
      return;
    }

    if (action === 'insert' || action === 'update') {
      const input = productInput(body, action === 'update');
      if (!input) {
        sendJson(res, { error: 'Verifique EANs, código, descrição (até 100 caracteres) e tipo (até 10 caracteres)' }, 400);
        return;
      }
      const { ean, descricao, tipo, eans } = input;
      const lock = { query: 'LOCK TABLE public.produto, public.produto_codigos, public.produto_eans IN SHARE ROW EXCLUSIVE MODE' };

      if (action === 'update') {
        const original = identifier(body.originalCodigo);
        if (!original) {
          sendJson(res, { error: 'Produto original inválido' }, 400);
          return;
        }
        // All guards and writes run under the same table lock. A failed guard rolls back everything.
        const params = [original, codigo, ean, descricao, tipo || null, eans];
        const result = (await sql(
          [
            lock,
            { query: `SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$2::bigint AND codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$2::bigint AND produto_codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto WHERE ean=ANY($3::bigint[]) AND codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=ANY($3::bigint[]) AND produto_codigo<>$1::bigint)
              THEN 1 ELSE 0 END`, params: [original, codigo, eans] },
            { query: `INSERT INTO public.produto (codigo,ean,descricao,tipo) SELECT $2::bigint,$3::bigint,$4,$5 FROM public.produto WHERE codigo=$1::bigint AND $1::bigint<>$2::bigint`, params: params.slice(0, 5) },
            { query: 'DELETE FROM public.produto_codigos WHERE codigo=$2::bigint AND produto_codigo=$1::bigint', params: [original, codigo] },
            { query: 'UPDATE public.produto_codigos SET produto_codigo=$2::bigint WHERE codigo=$1::bigint', params: [original, codigo] },
            { query: 'DELETE FROM public.produto_eans WHERE produto_codigo=$2::bigint AND produto_codigo<>$1::bigint', params: [original, codigo] },
            { query: 'UPDATE public.produto_eans SET produto_codigo=$2::bigint WHERE ean=ANY($3::bigint[])', params: [original, codigo, eans] },
            { query: 'DELETE FROM public.produto WHERE codigo=$2::bigint AND codigo<>$1::bigint', params: [original, codigo] },
            { query: 'UPDATE public.produto SET ean=$2::bigint,descricao=$3,tipo=$4 WHERE codigo=$1::bigint', params: [original, codigo, ean, descricao, tipo || null] },
            { query: 'DELETE FROM public.produto_eans WHERE produto_codigo=$1::bigint', params: [codigo] },
            { query: 'INSERT INTO public.produto_eans (ean,produto_codigo) SELECT value,$1::bigint FROM unnest($2::bigint[]) value WHERE value<>$3::bigint', params: [codigo, eans, ean] },
          ],
          [],
          true,
        )) as BatchResult;
        void result;
        sendJson(res, { success: true, action: 'updated', product: await findProduct(codigo, true) });
        return;
      }

      const existing = await findProduct(codigo, true);
      const owner = await sql(
        'SELECT codigo::text FROM public.produto WHERE ean=$1::bigint UNION SELECT produto_codigo::text FROM public.produto_eans WHERE ean=$1::bigint LIMIT 2',
        [ean],
      );

      if (existing) {
        if (owner.some((row) => row.codigo !== existing.codigo)) {
          sendJson(res, { error: 'EAN já pertence a outro produto' }, 409);
          return;
        }
        await sql(
          [
            lock,
            { query: `SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$2::bigint AND codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$2::bigint AND produto_codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto WHERE ean=ANY($3::bigint[]) AND codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=ANY($3::bigint[]) AND produto_codigo<>$1::bigint)
              THEN 1 ELSE 0 END`, params: [codigo, ean, eans] },
            { query: 'INSERT INTO public.produto_eans (ean,produto_codigo) VALUES ($1::bigint,$2::bigint) ON CONFLICT (ean) DO NOTHING', params: [ean, codigo] },
          ],
          [],
          true,
        );
        sendJson(res, { success: true, action: 'ean_linked', alreadyLinked: owner.length > 0, product: await findProduct(String(existing.codigo), true) });
        return;
      }

      if (owner.length > 0) {
        const main = owner[0].codigo;
        await sql(
          [
            lock,
            { query: 'SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint) THEN 1 ELSE 0 END', params: [codigo] },
            { query: 'INSERT INTO public.produto_codigos (codigo,produto_codigo) VALUES ($1::bigint,$2::bigint)', params: [codigo, main] },
          ],
          [],
          true,
        );
        sendJson(res, { success: true, action: 'linked', product: await findProduct(String(main), true) });
        return;
      }

      await sql(
        [
          lock,
          { query: `SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint OR ean=$2::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$1::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=$2::bigint) THEN 1 ELSE 0 END`, params: [codigo, ean] },
          { query: 'INSERT INTO public.produto (ean,codigo,descricao,tipo) VALUES ($1::bigint,$2::bigint,$3,$4)', params: [ean, codigo, descricao, tipo || null] },
        ],
        [],
        true,
      );
      sendJson(res, { success: true, action: 'created' });
      return;
    }

    const product = await findProduct(codigo);
    sendJson(res, { found: !!product, product });
  } catch (error) {
    console.error('Error querying product:', error instanceof Error ? error.message : 'Unknown error');
    const known = error as { status?: number; message?: string };
    sendJson(res, { error: known.status ? known.message : 'Erro interno do servidor' }, known.status || 500);
  }
};

export default handler;
