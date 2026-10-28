import { createSql } from './_lib/db';
import { authenticate } from './_lib/auth';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http';

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const jwt = authenticate(req, res);
    if (!jwt) return;

    const sql = createSql();

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

    const { action, ano, mes, items, realizadoItems } = await readJsonBody<{
      action?: string;
      ano?: number;
      mes?: number;
      items?: { dia: number; meta: number }[];
      realizadoItems?: { dia: number; venda: number }[];
    }>(req);

    if (action === 'get') {
      const rows = await sql`SELECT * FROM metas_mensais WHERE ano = ${ano} AND mes = ${mes} ORDER BY dia`;
      sendJson(res, { data: rows });
      return;
    }

    if (action === 'save_meta') {
      if (jwt.role !== 'admin') {
        sendJson(res, { error: 'Sem permissão' }, 403);
        return;
      }

      const deduped = new Map<number, number>();
      for (const i of items ?? []) {
        deduped.set(i.dia, i.meta);
      }

      for (const [dia, meta] of deduped.entries()) {
        await sql`INSERT INTO metas_mensais (ano, mes, dia, meta) VALUES (${ano}, ${mes}, ${dia}, ${meta}) ON CONFLICT (ano, mes, dia) DO UPDATE SET meta = ${meta}`;
      }

      sendJson(res, { success: true });
      return;
    }

    if (action === 'save_realizado') {
      if (jwt.role !== 'admin') {
        sendJson(res, { error: 'Sem permissão' }, 403);
        return;
      }

      for (const item of realizadoItems ?? []) {
        await sql`UPDATE metas_mensais SET realizado = ${item.venda} WHERE ano = ${ano} AND mes = ${mes} AND dia = ${item.dia}`;
      }

      sendJson(res, { success: true });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('manage-metas error:', error);
    sendJson(res, { error: 'Erro interno do servidor' }, 500);
  }
};

export default handler;
