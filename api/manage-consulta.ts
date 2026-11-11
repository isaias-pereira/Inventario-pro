/**
 * Base de Consulta (multi-loja).
 *
 * A base de consulta guarda o estoque/preço **da loja** que importou a
 * planilha. O catálogo de produtos (código, descrição, seção) continua
 * compartilhado — vem do `query-product`.
 *
 * A importação (`replace`) substitui apenas a base da loja atual: as bases
 * das outras lojas não são tocadas.
 */

import { createSql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { SECAO_COLUNAS, secaoJoinTexto } from './_lib/categoria.js';
import { ensureLojaSchema, resolveLoja } from './_lib/loja.js';

/**
 * Limite de produtos por importação.
 *
 * O corpo de uma Function da Vercel aceita 4,5 MB; sem teto, uma planilha
 * grande estoura o limite e a importação inteira é perdida.
 */
export const MAX_CONSULTA_PRODUCTS = 5000;

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const body = await readJsonBody<Record<string, any>>(req);
    const { action } = body;
    const sql = createSql();
    await ensureLojaSchema(sql);
    // Coluna da loja (multi-loja) — criada de forma idempotente.
    try {
      await sql`ALTER TABLE consulta_products ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
      await sql`CREATE INDEX IF NOT EXISTS idx_consulta_products_loja_codigo ON consulta_products(loja, codigo)`;
    } catch {
      /* a migration oficial cria a coluna; aqui é só uma rede de segurança */
    }
    const loja = await resolveLoja(sql, payload);

    if (action === 'list') {
      // A seção do catálogo vem junto para o card da Consulta mostrar a
      // classificação sem uma segunda consulta ao produto.
      const data = await sql(
        `SELECT cp.codigo, cp.descricao, cp.estoque, cp.preco, ${SECAO_COLUNAS}
           FROM consulta_products cp ${secaoJoinTexto('cp')}
          WHERE cp.loja = $1
          ORDER BY cp.created_at ASC`,
        [loja],
      );
      sendJson(res, { items: data });
      return;
    }

    if (action === 'replace') {
      if (payload.role !== 'admin') {
        sendJson(res, { error: 'Acesso restrito a administradores' }, 403);
        return;
      }
      const { products } = body;
      if (!Array.isArray(products) || products.length === 0) {
        sendJson(res, { error: 'Lista de produtos é obrigatória' }, 400);
        return;
      }
      if (products.length > MAX_CONSULTA_PRODUCTS) {
        sendJson(res, { error: `A planilha tem ${products.length} produtos; o limite é ${MAX_CONSULTA_PRODUCTS}.` }, 413);
        return;
      }

      // Só a base da loja atual é substituída — as outras lojas ficam intactas.
      await sql`DELETE FROM consulta_products WHERE loja = ${loja}`;

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
          INSERT INTO consulta_products (codigo, descricao, estoque, preco, loja)
          SELECT codigo, descricao, estoque, preco, ${loja}
          FROM json_to_recordset(${JSON.stringify(batch)}::json)
          AS x(codigo text, descricao text, estoque numeric, preco numeric)`;
      }

      sendJson(res, { success: true, count: products.length });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('Manage consulta error:', error);
    sendJson(res, { error: 'Erro interno do servidor' }, 500);
  }
};

export default handler;
