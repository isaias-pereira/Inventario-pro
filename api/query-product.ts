import { createSql, type BatchResult, type Statement } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { identifier, productInput, canCreateProducts, canManageProducts } from './_lib/product-validation.js';
import { buildProductUpdateQueries } from './_lib/product-update.js';
import { packagingInput } from './_lib/packaging-validation.js';

const productSelect = `SELECT p.ean::text, p.codigo::text, p.descricao, p.tipo,
  p.categoria_codigo::text categoria_codigo, c.secao,
  ARRAY(SELECT DISTINCT c2::text FROM (SELECT p.codigo c2 UNION ALL SELECT codigo FROM public.produto_codigos WHERE produto_codigo=p.codigo) codes ORDER BY c2::text) codigos,
  ARRAY(SELECT e::text FROM (SELECT p.ean e UNION SELECT ean FROM public.produto_eans WHERE produto_codigo=p.codigo) eans WHERE e IS NOT NULL ORDER BY e) eans,
  COALESCE((SELECT json_agg(json_build_object(
    'ean_fechado', pe.ean_fechado::text,
    'tipo_embalagem', pe.tipo_embalagem,
    'quantidade_fechada', pe.quantidade_fechada::float8,
    'descricao', pe.descricao
  ) ORDER BY pe.tipo_embalagem, pe.ean_fechado)
    FROM public.produto_embalagens pe WHERE pe.produto_codigo=p.codigo), '[]'::json) embalagens
  FROM public.produto p LEFT JOIN public.categoria c ON c.codigo = p.categoria_codigo`;
const codeCondition = `p.codigo=$1::bigint OR p.codigo IN (SELECT produto_codigo FROM public.produto_codigos WHERE codigo=$1::bigint)`;
const allCondition = `(${codeCondition}) OR p.ean=$1::bigint OR p.codigo IN (SELECT produto_codigo FROM public.produto_eans WHERE ean=$1::bigint) OR p.codigo IN (SELECT produto_codigo FROM public.produto_embalagens WHERE ean_fechado=$1::bigint)`;

interface PackagingRow {
  ean_fechado: string;
  tipo_embalagem: string;
  quantidade_fechada: number;
  descricao: string | null;
}

/** Anexa a embalagem que corresponde exatamente ao código lido. */
function attachPackaging(product: Record<string, unknown> | null, scanned: string) {
  if (!product) return null;
  const embalagens = Array.isArray(product.embalagens) ? (product.embalagens as PackagingRow[]) : [];
  const embalagem = embalagens.find((row) => String(row.ean_fechado) === scanned) ?? null;
  return { ...product, embalagem };
}

// Custo (numeric 12,4) por código, incluindo códigos alternativos (produto_codigos).
// O registro mestre vence o alternativo quando o mesmo código existe nos dois.
const custoSelect = `
  SELECT DISTINCT ON (codigo) codigo, custo FROM (
    SELECT p.codigo::text AS codigo, p."Custo"::float8 AS custo, 1 AS prioridade
      FROM public.produto p
     WHERE p.codigo = ANY($1::bigint[])
    UNION ALL
    SELECT pc.codigo::text AS codigo, p."Custo"::float8 AS custo, 2 AS prioridade
      FROM public.produto_codigos pc
      JOIN public.produto p ON p.codigo = pc.produto_codigo
     WHERE pc.codigo = ANY($1::bigint[])
  ) origem
  ORDER BY codigo, prioridade`;

const MAX_CODIGOS = 1000;

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const body = await readJsonBody<Record<string, unknown>>(req);
    const action = body.action;
    if (action !== undefined && !['check', 'insert', 'edit_lookup', 'update', 'costs', 'add_packaging', 'remove_packaging', 'categorias', 'set_categoria'].includes(String(action))) {
      sendJson(res, { error: 'Ação inválida' }, 400);
      return;
    }
    if (['update', 'edit_lookup', 'remove_packaging', 'set_categoria'].includes(String(action)) && !canManageProducts(payload.role)) {
      sendJson(res, { error: 'Apenas administradores podem gerenciar produtos' }, 403);
      return;
    }
    if (['insert', 'add_packaging'].includes(String(action)) && !canCreateProducts(payload.role)) {
      sendJson(res, { error: 'Apenas admin e encarregado podem cadastrar produtos' }, 403);
      return;
    }

    const sql = createSql();

    // CATEGORIAS — taxonomia de seções usada nos filtros e no cadastro.
    if (action === 'categorias') {
      const rows = await sql('SELECT codigo::text, secao FROM public.categoria ORDER BY codigo');
      const categorias = rows.map((row) => ({ codigo: String(row.codigo), secao: String(row.secao ?? '') }));
      sendJson(res, { categorias });
      return;
    }

    // CUSTOS — custo (PMZ) de vários códigos em uma consulta (usado na planilha de rebaixa)
    if (action === 'costs') {
      const raw = Array.isArray(body.codigos) ? body.codigos : [];
      if (raw.length === 0 || raw.length > MAX_CODIGOS) {
        sendJson(res, { error: `Informe de 1 a ${MAX_CODIGOS} códigos` }, 400);
        return;
      }
      const codigos = raw.map(identifier);
      if (codigos.some((value) => value === null)) {
        sendJson(res, { error: 'Código inválido (apenas dígitos, até 14)' }, 400);
        return;
      }
      const rows = await sql(custoSelect, [codigos]);
      const costs: Record<string, number> = {};
      for (const row of rows) {
        const value = Number(row.custo);
        if (Number.isFinite(value)) costs[String(row.codigo)] = value;
      }
      sendJson(res, { costs });
      return;
    }

    const findProduct = async (value: string, byCode = false) => {
      const rows = await sql(
        `${productSelect} WHERE ${byCode ? codeCondition : allCondition} ORDER BY (p.ean=$1::bigint) DESC NULLS LAST LIMIT 1`,
        [value],
      );
      return rows[0] ?? null;
    };

    /** Confere se a seção existe na taxonomia (a FK do banco também protege). */
    const resolveCategoria = async (codigo: string | null) => {
      if (codigo === null) return { ok: true as const, valor: null };
      const rows = await sql('SELECT codigo::text FROM public.categoria WHERE codigo=$1::bigint', [codigo]);
      if (rows.length === 0) return { ok: false as const, valor: null };
      return { ok: true as const, valor: codigo };
    };

    // SET_CATEGORIA — classifica (ou desclassifica) um produto já cadastrado.
    // Usado pela revisão por IA e pela correção manual do admin.
    if (action === 'set_categoria') {
      const codigo = identifier(body.codigo);
      if (!codigo) {
        sendJson(res, { error: 'Código inválido (apenas dígitos, até 14)' }, 400);
        return;
      }
      const product = await findProduct(codigo, true);
      if (!product) {
        sendJson(res, { error: 'Produto não encontrado' }, 404);
        return;
      }
      const master = String(product.codigo);
      const raw = body.categoriaCodigo === '' || body.categoriaCodigo === null ? null : identifier(body.categoriaCodigo);
      if (body.categoriaCodigo !== '' && body.categoriaCodigo !== null && body.categoriaCodigo !== undefined && !raw) {
        sendJson(res, { error: 'Seção inválida' }, 400);
        return;
      }
      const categoria = await resolveCategoria(raw);
      if (!categoria.ok) {
        sendJson(res, { error: 'Seção inexistente na taxonomia' }, 400);
        return;
      }
      await sql('UPDATE public.produto SET categoria_codigo=$2::bigint WHERE codigo=$1::bigint', [master, categoria.valor]);
      sendJson(res, { success: true, action: 'categoria_set', product: await findProduct(master, true) });
      return;
    }

    // EMBALAGENS FECHADAS — caixa (CX), fardo (FD) ou saco (SC) vinculado a um produto.
    if (action === 'add_packaging' || action === 'remove_packaging') {
      const lock = {
        query:
          'LOCK TABLE public.produto, public.produto_codigos, public.produto_eans, public.produto_embalagens IN SHARE ROW EXCLUSIVE MODE',
      };

      if (action === 'remove_packaging') {
        const eanFechado = identifier(body.eanFechado);
        if (!eanFechado) {
          sendJson(res, { error: 'EAN fechado inválido (apenas dígitos, até 14)' }, 400);
          return;
        }
        const removed = await sql(
          'DELETE FROM public.produto_embalagens WHERE ean_fechado=$1::bigint RETURNING id',
          [eanFechado],
        );
        if (removed.length === 0) {
          sendJson(res, { error: 'Embalagem não encontrada' }, 404);
          return;
        }
        sendJson(res, { success: true, action: 'packaging_removed' });
        return;
      }

      const productEan = identifier(body.ean);
      const input = packagingInput(body);
      if (!productEan) {
        sendJson(res, { error: 'Informe o EAN do produto que receberá a embalagem' }, 400);
        return;
      }
      if (!input) {
        sendJson(
          res,
          { error: 'Verifique o EAN fechado, o tipo (CX/FD/SC) e a quantidade (maior que zero)' },
          400,
        );
        return;
      }

      const product = await findProduct(productEan);
      if (!product) {
        sendJson(res, { error: 'Produto não encontrado para o EAN informado' }, 404);
        return;
      }
      const master = String(product.codigo);

      await sql(
        [
          lock,
          { query: `SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto WHERE ean=$2::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$2::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=$2::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_embalagens WHERE ean_fechado=$2::bigint)
            THEN 1 ELSE 0 END`, params: [master, input.eanFechado] },
          {
            query: `INSERT INTO public.produto_embalagens
              (ean_fechado, produto_codigo, tipo_embalagem, quantidade_fechada, descricao)
              VALUES ($1::bigint,$2::bigint,$3,$4::numeric,$5)`,
            params: [input.eanFechado, master, input.tipo, input.quantidadeFechada, input.descricao || null],
          },
        ],
        [],
        true,
      );

      sendJson(res, {
        success: true,
        action: 'packaging_added',
        product: await findProduct(master, true),
      });
      return;
    }

    const codigo = identifier(body.codigo);
    if (!codigo) {
      sendJson(res, { error: 'Código inválido (apenas dígitos, até 14)' }, 400);
      return;
    }

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
      const { ean, descricao, tipo, eans, categoriaCodigo, categoriaInformada } = input;

      // A seção só é validada quando o formulário a informou.
      let categoriaValor: string | null = null;
      if (categoriaInformada) {
        const categoria = await resolveCategoria(categoriaCodigo);
        if (!categoria.ok) {
          sendJson(res, { error: 'Seção inexistente na taxonomia' }, 400);
          return;
        }
        categoriaValor = categoria.valor;
      }

      const lock = {
        query:
          'LOCK TABLE public.produto, public.produto_codigos, public.produto_eans, public.produto_embalagens IN SHARE ROW EXCLUSIVE MODE',
      };

      if (action === 'update') {
        const original = identifier(body.originalCodigo);
        if (!original) {
          sendJson(res, { error: 'Produto original inválido' }, 400);
          return;
        }
        // All guards and writes run under the same table lock. A failed guard rolls back everything.
        const queries = buildProductUpdateQueries({
          original,
          codigo,
          ean,
          descricao,
          tipo,
          eans,
          categoriaCodigo: categoriaValor,
          categoriaInformada,
        });
        const result = (await sql(queries, [], true)) as BatchResult;
        void result;
        sendJson(res, { success: true, action: 'updated', product: await findProduct(codigo, true) });
        return;
      }

      const existing = await findProduct(codigo, true);
      const owner = await sql(
        `SELECT codigo::text FROM public.produto WHERE ean=$1::bigint
         UNION SELECT produto_codigo::text FROM public.produto_eans WHERE ean=$1::bigint
         UNION SELECT produto_codigo::text FROM public.produto_embalagens WHERE ean_fechado=$1::bigint
         LIMIT 2`,
        [ean],
      );

      if (existing) {
        // O código digitado pode ser um código alternativo (produto_codigos).
        // O vínculo do EAN precisa usar o código mestre do produto encontrado.
        const master = String(existing.codigo);
        if (owner.some((row) => row.codigo !== master)) {
          sendJson(res, { error: 'EAN já pertence a outro produto' }, 409);
          return;
        }
        const queries: Statement[] = [
          lock,
          { query: `SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$2::bigint AND codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$2::bigint AND produto_codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto WHERE ean=ANY($3::bigint[]) AND codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=ANY($3::bigint[]) AND produto_codigo<>$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto_embalagens WHERE ean_fechado=ANY($3::bigint[]))
              THEN 1 ELSE 0 END`, params: [master, ean, eans] },
          { query: 'INSERT INTO public.produto_eans (ean,produto_codigo) VALUES ($1::bigint,$2::bigint) ON CONFLICT (ean) DO NOTHING', params: [ean, master] },
        ];
        // Seção escolhida no cadastro: o produto existente passa a usá-la.
        if (categoriaInformada) {
          queries.push({ query: 'UPDATE public.produto SET categoria_codigo=$2::bigint WHERE codigo=$1::bigint', params: [master, categoriaValor] });
        }
        await sql(queries, [], true);
        sendJson(res, { success: true, action: 'ean_linked', alreadyLinked: owner.length > 0, product: await findProduct(master, true) });
        return;
      }

      if (owner.length > 0) {
        const main = owner[0].codigo;
        const queries: Statement[] = [
          lock,
          { query: `SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint)
              AND NOT EXISTS (SELECT 1 FROM public.produto_embalagens WHERE ean_fechado=$1::bigint)
              THEN 1 ELSE 0 END`, params: [codigo] },
          { query: 'INSERT INTO public.produto_codigos (codigo,produto_codigo) VALUES ($1::bigint,$2::bigint)', params: [codigo, main] },
        ];
        if (categoriaInformada) {
          queries.push({ query: 'UPDATE public.produto SET categoria_codigo=$2::bigint WHERE codigo=$1::bigint', params: [main, categoriaValor] });
        }
        await sql(queries, [], true);
        sendJson(res, { success: true, action: 'linked', product: await findProduct(String(main), true) });
        return;
      }

      await sql(
        [
          lock,
          { query: `SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint OR ean=$2::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$1::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=$2::bigint)
            AND NOT EXISTS (SELECT 1 FROM public.produto_embalagens WHERE ean_fechado=$1::bigint OR ean_fechado=$2::bigint)
            THEN 1 ELSE 0 END`, params: [codigo, ean] },
          { query: 'INSERT INTO public.produto (ean,codigo,descricao,tipo,categoria_codigo) VALUES ($1::bigint,$2::bigint,$3,$4,$5::bigint)', params: [ean, codigo, descricao, tipo || null, categoriaInformada ? categoriaValor : null] },
        ],
        [],
        true,
      );
      sendJson(res, { success: true, action: 'created' });
      return;
    }

    const product = await findProduct(codigo);
    sendJson(res, { found: !!product, product: attachPackaging(product, codigo) });
  } catch (error) {
    console.error('Error querying product:', error instanceof Error ? error.message : 'Unknown error');
    const known = error as { status?: number; message?: string };
    sendJson(res, { error: known.status ? known.message : 'Erro interno do servidor' }, known.status || 500);
  }
};

export default handler;
