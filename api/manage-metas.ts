/**
 * Metas mensais (multi-loja).
 *
 * Meta e realizado são definidos por loja: a loja 103 tem as suas metas do
 * mês, a loja 92 tem as dela — o mesmo (ano, mes, dia) pode existir nas duas.
 */

import { createSql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { ensureLojaSchema, resolveLoja } from './_lib/loja.js';

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const jwt = authenticate(req, res);
    if (!jwt) return;

    const sql = createSql();
    await ensureLojaSchema(sql);

    // Ensure table exists
    await sql`CREATE TABLE IF NOT EXISTS metas_mensais (
      id SERIAL PRIMARY KEY,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      dia INTEGER NOT NULL,
      meta NUMERIC DEFAULT 0,
      realizado NUMERIC DEFAULT 0,
      loja INTEGER NOT NULL DEFAULT 103
    )`;

    // A unicidade passa a ser por loja: (ano, mes, dia) pode repetir em lojas
    // diferentes. A constraint global é removida (a migration faz o mesmo).
    try {
      await sql`ALTER TABLE metas_mensais ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
      await sql`ALTER TABLE metas_mensais DROP CONSTRAINT IF EXISTS metas_mensais_ano_mes_dia_key`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS metas_mensais_loja_ano_mes_dia_key ON metas_mensais(loja, ano, mes, dia)`;
    } catch {
      /* a migration oficial é a que garante o índice; aqui é só uma rede de segurança */
    }

    const loja = await resolveLoja(sql, jwt);

    const { action, ano, mes, items, realizadoItems } = await readJsonBody<{
      action?: string;
      ano?: number;
      mes?: number;
      items?: { dia: number; meta: number }[];
      realizadoItems?: { dia: number; venda: number }[];
    }>(req);

    if (action === 'get') {
      const rows = await sql`SELECT * FROM metas_mensais WHERE loja = ${loja} AND ano = ${ano} AND mes = ${mes} ORDER BY dia`;
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
        await sql`INSERT INTO metas_mensais (ano, mes, dia, meta, loja) VALUES (${ano}, ${mes}, ${dia}, ${meta}, ${loja}) ON CONFLICT (loja, ano, mes, dia) DO UPDATE SET meta = ${meta}`;
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
        await sql`UPDATE metas_mensais SET realizado = ${item.venda} WHERE loja = ${loja} AND ano = ${ano} AND mes = ${mes} AND dia = ${item.dia}`;
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
