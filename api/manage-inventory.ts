/**
 * Inventário (multi-loja).
 *
 * Cada loja tem a sua própria contagem: os lotes, os itens contados e a
 * auditoria pertencem à loja do usuário (o escopo vem do token).
 *
 * O número do lote é único **por loja** — a loja 83 abre o lote 1 sem
 * conflito com o lote 1 da loja 103.
 *
 * O inventário é **por usuário**: cada login tem o seu lote aberto e só
 * enxerga os seus lotes (os que ele criou). Antes o lote era único por loja
 * e os itens contados por um login apareciam no inventário de outro.
 */

import { createSql, type Sql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { SECAO_COLUNAS, secaoJoinTexto } from './_lib/categoria.js';
import { ensureLojaSchema, resolveLoja } from './_lib/loja.js';

let schemaEnsured = false;

async function ensureSchema(sql: Sql) {
  if (schemaEnsured) return;
  await sql`CREATE TABLE IF NOT EXISTS inventory_lotes (
    id SERIAL PRIMARY KEY,
    numero INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finalized_at TIMESTAMPTZ,
    nome TEXT,
    loja INTEGER NOT NULL DEFAULT 103
  )`;
  await sql`ALTER TABLE shared_inventory ADD COLUMN IF NOT EXISTS lote_numero INTEGER`;
  await sql`ALTER TABLE shared_inventory ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
  await sql`ALTER TABLE inventory_lotes ADD COLUMN IF NOT EXISTS nome TEXT`;
  await sql`ALTER TABLE inventory_lotes ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
  await sql`CREATE TABLE IF NOT EXISTS inventory_lote_audit (
    id SERIAL PRIMARY KEY,
    lote_numero INTEGER NOT NULL,
    action TEXT NOT NULL,
    username TEXT,
    role TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    loja INTEGER NOT NULL DEFAULT 103
  )`;
  await sql`ALTER TABLE inventory_lote_audit ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
  await sql`CREATE INDEX IF NOT EXISTS inventory_lote_audit_lote_idx ON inventory_lote_audit(lote_numero)`;
  await sql`CREATE INDEX IF NOT EXISTS inventory_lote_audit_created_idx ON inventory_lote_audit(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shared_inventory_lote_updated ON shared_inventory(lote_numero, updated_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shared_inventory_codigo_lote ON shared_inventory(codigo, lote_numero)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inventory_lotes_status ON inventory_lotes(status, numero DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inventory_lote_audit_loja_lote ON inventory_lote_audit(loja, lote_numero)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shared_inventory_loja_lote ON shared_inventory(loja, lote_numero)`;

  // O código deixa de ser único no mundo todo: uma linha por loja/lote/produto.
  try {
    await sql`ALTER TABLE shared_inventory DROP CONSTRAINT IF EXISTS shared_inventory_codigo_key`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_inventory_loja_codigo_lote ON shared_inventory(loja, codigo, lote_numero)`;
  } catch {
    /* a migration oficial é a que garante o índice; aqui é só uma rede de segurança */
  }

  // O número do lote passa a ser único por loja (a constraint global
  // `inventory_lotes_numero_key` é removida — a migration faz o mesmo).
  try {
    await sql`ALTER TABLE inventory_lotes DROP CONSTRAINT IF EXISTS inventory_lotes_numero_key`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS inventory_lotes_loja_numero_key ON inventory_lotes(loja, numero)`;
  } catch {
    /* a migration oficial é a que garante o índice; aqui é só uma rede de segurança */
  }

  // Um lote aberto por (loja, usuário): cada login tem a sua própria contagem.
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_lotes_aberto_usuario ON inventory_lotes(loja, created_by) WHERE status = 'aberto' AND created_by IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_inventory_lotes_loja_dono ON inventory_lotes(loja, created_by, status, numero DESC)`;
  } catch {
    /* a migration oficial é a que garante o índice; aqui é só uma rede de segurança */
  }

  // One-time adoption: if there are legacy items without lote_numero, create Lote #1 and assign them
  const orphans = await sql`SELECT COUNT(*)::int AS c FROM shared_inventory WHERE lote_numero IS NULL`;
  if (Number(orphans[0].c) > 0) {
    const existing = await sql`SELECT numero FROM inventory_lotes ORDER BY numero ASC LIMIT 1`;
    let target: number;
    if (existing.length === 0) {
      await sql`INSERT INTO inventory_lotes (numero, status, created_by, loja) VALUES (1, 'aberto', 'system', 103)`;
      target = 1;
    } else {
      target = Number(existing[0].numero);
    }
    await sql`UPDATE shared_inventory SET lote_numero = ${target} WHERE lote_numero IS NULL`;
  }

  schemaEnsured = true;
}

/** Lote aberto do usuário (um por login). */
async function getOpenLote(sql: Sql, loja: number, usuario: string): Promise<number | null> {
  const open = await sql`
    SELECT numero FROM inventory_lotes
     WHERE loja = ${loja} AND status = 'aberto' AND created_by = ${usuario}
     ORDER BY numero DESC LIMIT 1`;
  return open.length > 0 ? Number(open[0].numero) : null;
}

async function getOrCreateOpenLote(sql: Sql, username: string, loja: number): Promise<number> {
  const existing = await getOpenLote(sql, loja, username);
  if (existing != null) return existing;
  // Race-safe: o número do lote é único por loja. Se outro login abrir um
  // lote ao mesmo tempo, o INSERT é ignorado e a próxima tentativa recalcula
  // o próximo número.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const maxRow = await sql`SELECT COALESCE(MAX(numero), 0) AS max FROM inventory_lotes WHERE loja = ${loja}`;
    const next = Number(maxRow[0].max) + 1;
    await sql`INSERT INTO inventory_lotes (numero, status, created_by, loja) VALUES (${next}, 'aberto', ${username}, ${loja}) ON CONFLICT (loja, numero) DO NOTHING`;
    const after = await getOpenLote(sql, loja, username);
    if (after != null) return after;
  }
  throw new Error('Não foi possível abrir o lote de inventário');
}

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const body = await readJsonBody<Record<string, any>>(req);
    const { action, item, codigo, quantidade, lote_numero } = body;

    const username = payload.sub;
    const isAdmin = payload.role === 'admin';
    const sql = createSql();
    await ensureSchema(sql);
    await ensureLojaSchema(sql);
    // Escopo multi-loja: tudo abaixo pertence à loja do token.
    const loja = await resolveLoja(sql, payload);

    // O inventário é operado por admin e encarregado. As ações destrutivas
    // (`update`, `remove`, `clear`) continuam exclusivas do admin, mais abaixo.
    if (payload.role !== 'admin' && payload.role !== 'encarregado') {
      sendJson(res, { error: 'Acesso restrito a admin e encarregado' }, 403);
      return;
    }

    // LIST current open lote items (does NOT create a lote — only created on first add)
    // O lote é do próprio login: os itens contados por outro usuário não aparecem.
    if (action === 'list') {
      const lote = await getOpenLote(sql, loja, username);
      if (lote == null) {
        sendJson(res, { items: [], lote_numero: null });
        return;
      }
      const data = await sql(
        `SELECT i.*, ${SECAO_COLUNAS}
           FROM shared_inventory i ${secaoJoinTexto('i')}
          WHERE i.loja = $1 AND i.lote_numero = $2
          ORDER BY i.updated_at ASC`,
        [loja, lote],
      );
      const info = await sql`SELECT nome FROM inventory_lotes WHERE loja = ${loja} AND numero = ${lote} LIMIT 1`;
      sendJson(res, { items: data, lote_numero: lote, lote_nome: info[0]?.nome ?? null });
      return;
    }

    // LIST finalized + suspended lotes (history) — só os lotes do próprio login.
    if (action === 'list_lotes') {
      const data = await sql`SELECT numero, nome, status, created_by, created_at, finalized_at FROM inventory_lotes WHERE loja = ${loja} AND created_by = ${username} AND status IN ('finalizado','suspenso') ORDER BY numero DESC`;
      sendJson(res, { lotes: data });
      return;
    }

    // SUSPEND current open lote (keeps items in DB, no open lote afterwards)
    if (action === 'suspend') {
      const open = await sql`SELECT numero FROM inventory_lotes WHERE loja = ${loja} AND status = 'aberto' AND created_by = ${username} ORDER BY numero DESC LIMIT 1`;
      if (open.length === 0) {
        sendJson(res, { success: true, suspended: null });
        return;
      }
      const num = Number(open[0].numero);
      const items = await sql`SELECT id FROM shared_inventory WHERE loja = ${loja} AND lote_numero = ${num} LIMIT 1`;
      if (items.length === 0) {
        sendJson(res, { error: 'Lote vazio. Conte ao menos um item antes de suspender.' }, 400);
        return;
      }
      await sql`UPDATE inventory_lotes SET status = 'suspenso' WHERE loja = ${loja} AND numero = ${num}`;
      await sql`INSERT INTO inventory_lote_audit (lote_numero, action, username, role, details, loja) VALUES (${num}, 'suspend', ${username}, ${payload.role}, ${JSON.stringify({ trigger: 'manual' })}, ${loja})`;
      sendJson(res, { success: true, suspended: num });
      return;
    }

    // RESUME a suspended lote: auto-suspends any currently open lote of the
    // same user (if has items), then reopens target
    if (action === 'resume') {
      if (!lote_numero) {
        sendJson(res, { error: 'lote_numero obrigatório' }, 400);
        return;
      }
      const target = await sql`SELECT numero, status FROM inventory_lotes WHERE loja = ${loja} AND numero = ${lote_numero} AND created_by = ${username} LIMIT 1`;
      if (target.length === 0) {
        sendJson(res, { error: 'Lote não encontrado' }, 404);
        return;
      }
      if (target[0].status === 'finalizado') {
        sendJson(res, { error: 'Lote finalizado não pode ser reaberto' }, 400);
        return;
      }

      // suspend any currently open lote of this user (different from target) that has items; drop empty open lotes
      const open = await sql`SELECT numero FROM inventory_lotes WHERE loja = ${loja} AND status = 'aberto' AND created_by = ${username} AND numero <> ${lote_numero}`;
      for (const row of open) {
        const n = Number(row.numero);
        const has = await sql`SELECT id FROM shared_inventory WHERE loja = ${loja} AND lote_numero = ${n} LIMIT 1`;
        if (has.length === 0) {
          await sql`DELETE FROM inventory_lotes WHERE loja = ${loja} AND numero = ${n}`;
        } else {
          await sql`UPDATE inventory_lotes SET status = 'suspenso' WHERE loja = ${loja} AND numero = ${n}`;
          await sql`INSERT INTO inventory_lote_audit (lote_numero, action, username, role, details, loja) VALUES (${n}, 'suspend', ${username}, ${payload.role}, ${JSON.stringify({ trigger: 'auto_on_resume', resumed_lote: Number(lote_numero) })}, ${loja})`;
        }
      }
      await sql`UPDATE inventory_lotes SET status = 'aberto' WHERE loja = ${loja} AND numero = ${lote_numero}`;
      await sql`INSERT INTO inventory_lote_audit (lote_numero, action, username, role, details, loja) VALUES (${lote_numero}, 'resume', ${username}, ${payload.role}, ${JSON.stringify({ previous_status: target[0].status })}, ${loja})`;
      sendJson(res, { success: true, resumed: Number(lote_numero) });
      return;
    }

    // LIST audit log entries (optional filter by lote) — só dos lotes do login.
    if (action === 'list_audit') {
      const data = lote_numero
        ? await sql`SELECT id, lote_numero, action, username, role, details, created_at FROM inventory_lote_audit WHERE loja = ${loja} AND lote_numero = ${lote_numero} AND lote_numero IN (SELECT numero FROM inventory_lotes WHERE loja = ${loja} AND created_by = ${username}) ORDER BY created_at DESC LIMIT 500`
        : await sql`SELECT id, lote_numero, action, username, role, details, created_at FROM inventory_lote_audit WHERE loja = ${loja} AND lote_numero IN (SELECT numero FROM inventory_lotes WHERE loja = ${loja} AND created_by = ${username}) ORDER BY created_at DESC LIMIT 500`;
      sendJson(res, { audit: data });
      return;
    }

    // GET specific lote items (read-only) — só os lotes do próprio login.
    if (action === 'get_lote') {
      if (!lote_numero) {
        sendJson(res, { error: 'lote_numero obrigatório' }, 400);
        return;
      }
      const loteInfo = await sql`SELECT numero, nome, status, created_by, created_at, finalized_at FROM inventory_lotes WHERE loja = ${loja} AND numero = ${lote_numero} AND created_by = ${username} LIMIT 1`;
      if (loteInfo.length === 0) {
        sendJson(res, { error: 'Lote não encontrado' }, 404);
        return;
      }
      const data = await sql(
        `SELECT i.*, ${SECAO_COLUNAS}
           FROM shared_inventory i ${secaoJoinTexto('i')}
          WHERE i.loja = $1 AND i.lote_numero = $2
          ORDER BY i.updated_at ASC`,
        [loja, lote_numero],
      );
      sendJson(res, { items: data, lote: loteInfo[0] || null });
      return;
    }

    // RENAME - define/update the name of a lote (defaults to current open lote)
    if (action === 'rename') {
      const raw: string = typeof body.nome === 'string' ? body.nome.trim() : '';
      if (raw.length < 1 || raw.length > 60) {
        sendJson(res, { error: 'Nome deve ter entre 1 e 60 caracteres' }, 400);
        return;
      }
      // Remove caracteres de controle do nome do lote (sem regex de faixas de
      // controle, para manter o lint enxuto).
      const nome = Array.from(raw)
        .filter((ch) => {
          const code = ch.charCodeAt(0);
          return code >= 32 && code !== 127;
        })
        .join('');
      const target = lote_numero ?? await getOpenLote(sql, loja, username);
      if (target == null) {
        sendJson(res, { error: 'Nenhum lote aberto' }, 400);
        return;
      }
      // Só o dono do lote renomeia.
      const alvo = await sql`SELECT numero FROM inventory_lotes WHERE loja = ${loja} AND numero = ${target} AND created_by = ${username} LIMIT 1`;
      if (alvo.length === 0) {
        sendJson(res, { error: 'Lote não encontrado' }, 404);
        return;
      }
      await sql`UPDATE inventory_lotes SET nome = ${nome} WHERE loja = ${loja} AND numero = ${target}`;
      await sql`INSERT INTO inventory_lote_audit (lote_numero, action, username, role, details, loja) VALUES (${target}, 'rename', ${username}, ${payload.role}, ${JSON.stringify({ nome })}, ${loja})`;
      sendJson(res, { success: true, lote_numero: target, nome });
      return;
    }

    // ADD - always into current open lote
    if (action === 'add') {
      if (!item || quantidade === undefined || quantidade === null) {
        sendJson(res, { error: 'Dados do item são obrigatórios' }, 400);
        return;
      }
      const lote = await getOrCreateOpenLote(sql, username, loja);
      const existing = await sql`SELECT id, quantidade FROM shared_inventory WHERE loja = ${loja} AND codigo = ${item.codigo} AND lote_numero = ${lote} LIMIT 1`;

      if (existing.length > 0) {
        const newQty = Number(existing[0].quantidade) + quantidade;
        await sql`UPDATE shared_inventory SET quantidade = ${newQty}, updated_at = NOW() WHERE id = ${existing[0].id}`;
      } else {
        await sql`INSERT INTO shared_inventory (ean, codigo, descricao, quantidade, created_by, updated_at, lote_numero, loja) VALUES (${item.ean}, ${item.codigo}, ${item.descricao}, ${quantidade}, ${username}, NOW(), ${lote}, ${loja})`;
      }

      sendJson(res, { success: true, lote_numero: lote });
      return;
    }

    // FINALIZE current open lote (do próprio login)
    if (action === 'finalize') {
      const open = await sql`SELECT numero FROM inventory_lotes WHERE loja = ${loja} AND status = 'aberto' AND created_by = ${username} ORDER BY numero DESC LIMIT 1`;
      if (open.length === 0) {
        // Nothing to finalize — treat as no-op success so UI doesn't break
        sendJson(res, { success: true, finalized: null, message: 'Nenhum lote aberto' });
        return;
      }
      const num = Number(open[0].numero);
      const items = await sql`SELECT id FROM shared_inventory WHERE loja = ${loja} AND lote_numero = ${num} LIMIT 1`;
      if (items.length === 0) {
        sendJson(res, { error: 'Lote vazio. Conte ao menos um item antes de finalizar.' }, 400);
        return;
      }
      await sql`UPDATE inventory_lotes SET status = 'finalizado', finalized_at = NOW() WHERE loja = ${loja} AND numero = ${num}`;
      sendJson(res, { success: true, finalized: num });
      return;
    }

    // ADMIN-ONLY actions
    if (!isAdmin) {
      sendJson(res, { error: 'Acesso negado. Somente administradores.' }, 403);
      return;
    }

    if (action === 'update') {
      if (!codigo || quantidade === undefined) {
        sendJson(res, { error: 'Código e quantidade são obrigatórios' }, 400);
        return;
      }
      // Só o lote aberto do próprio login pode ser alterado.
      const lote = await getOpenLote(sql, loja, username);
      if (lote == null) {
        sendJson(res, { error: 'Nenhum lote aberto' }, 400);
        return;
      }
      await sql`UPDATE shared_inventory SET quantidade = ${quantidade}, updated_at = NOW() WHERE loja = ${loja} AND codigo = ${codigo} AND lote_numero = ${lote}`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'remove') {
      if (!codigo) {
        sendJson(res, { error: 'Código é obrigatório' }, 400);
        return;
      }
      const lote = await getOpenLote(sql, loja, username);
      if (lote == null) {
        sendJson(res, { error: 'Nenhum lote aberto' }, 400);
        return;
      }
      await sql`DELETE FROM shared_inventory WHERE loja = ${loja} AND codigo = ${codigo} AND lote_numero = ${lote}`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'clear') {
      const lote = await getOpenLote(sql, loja, username);
      if (lote == null) {
        sendJson(res, { error: 'Nenhum lote aberto' }, 400);
        return;
      }
      await sql`DELETE FROM shared_inventory WHERE loja = ${loja} AND lote_numero = ${lote}`;
      sendJson(res, { success: true });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('Manage inventory error:', error);
    sendJson(res, { error: 'Erro interno do servidor' }, 500);
  }
};

export default handler;
