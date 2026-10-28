import { createSql } from './_lib/db';
import { authenticate } from './_lib/auth';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http';

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const body = await readJsonBody<Record<string, any>>(req);
    const { action } = body;
    const sql = createSql();

    if (action === 'list') {
      const data = await sql`SELECT codigo, descricao, estoque, preco FROM consulta_products ORDER BY created_at ASC`;
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
