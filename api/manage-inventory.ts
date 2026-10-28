import { createSql, type Sql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';

let schemaEnsured = false;

async function ensureSchema(sql: Sql) {
  if (schemaEnsured) return;
  await sql`CREATE TABLE IF NOT EXISTS inventory_lotes (
    id SERIAL PRIMARY KEY,
    numero INTEGER UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finalized_at TIMESTAMPTZ
  )`;
  await sql`ALTER TABLE shared_inventory ADD COLUMN IF NOT EXISTS lote_numero INTEGER`;
  await sql`ALTER TABLE inventory_lotes ADD COLUMN IF NOT EXISTS nome TEXT`;
  await sql`CREATE TABLE IF NOT EXISTS inventory_lote_audit (
    id SERIAL PRIMARY KEY,
    lote_numero INTEGER NOT NULL,
    action TEXT NOT NULL,
    username TEXT,
    role TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS inventory_lote_audit_lote_idx ON inventory_lote_audit(lote_numero)`;
  await sql`CREATE INDEX IF NOT EXISTS inventory_lote_audit_created_idx ON inventory_lote_audit(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shared_inventory_lote_updated ON shared_inventory(lote_numero, updated_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shared_inventory_codigo_lote ON shared_inventory(codigo, lote_numero)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inventory_lotes_status ON inventory_lotes(status, numero DESC)`;

  // One-time adoption: if there are legacy items without lote_numero, create Lote #1 and assign them
  const orphans = await sql`SELECT COUNT(*)::int AS c FROM shared_inventory WHERE lote_numero IS NULL`;
  if (Number(orphans[0].c) > 0) {
    const existing = await sql`SELECT numero FROM inventory_lotes ORDER BY numero ASC LIMIT 1`;
    let target: number;
    if (existing.length === 0) {
      await sql`INSERT INTO inventory_lotes (numero, status, created_by) VALUES (1, 'aberto', 'system')`;
      target = 1;
    } else {
      target = Number(existing[0].numero);
    }
    await sql`UPDATE shared_inventory SET lote_numero = ${target} WHERE lote_numero IS NULL`;
  }

  schemaEnsured = true;
}

async function getOpenLote(sql: Sql): Promise<number | null> {
  const open = await sql`SELECT numero FROM inventory_lotes WHERE status = 'aberto' ORDER BY numero DESC LIMIT 1`;
  return open.length > 0 ? Number(open[0].numero) : null;
}

async function getOrCreateOpenLote(sql: Sql, username: string): Promise<number> {
  const existing = await getOpenLote(sql);
  if (existing != null) return existing;
  // Race-safe: compute next number and insert with ON CONFLICT to avoid duplicates
  const maxRow = await sql`SELECT COALESCE(MAX(numero), 0) AS max FROM inventory_lotes`;
  const next = Number(maxRow[0].max) + 1;
  await sql`INSERT INTO inventory_lotes (numero, status, created_by) VALUES (${next}, 'aberto', ${username}) ON CONFLICT (numero) DO NOTHING`;
  // Re-read the actual open lote (could be ours or a concurrent one)
  const after = await getOpenLote(sql);
  return after ?? next;
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

    // LIST current open lote items (does NOT create a lote — only created on first add)
    if (action === 'list') {
      const lote = await getOpenLote(sql);
      if (lote == null) {
        sendJson(res, { items: [], lote_numero: null });
        return;
      }
      const data = await sql`SELECT * FROM shared_inventory WHERE lote_numero = ${lote} ORDER BY updated_at ASC`;
      const info = await sql`SELECT nome FROM inventory_lotes WHERE numero = ${lote} LIMIT 1`;
      sendJson(res, { items: data, lote_numero: lote, lote_nome: info[0]?.nome ?? null });
      return;
    }

    // LIST finalized + suspended lotes (history)
    if (action === 'list_lotes') {
      const data = await sql`SELECT numero, nome, status, created_by, created_at, finalized_at FROM inventory_lotes WHERE status IN ('finalizado','suspenso') ORDER BY numero DESC`;
      sendJson(res, { lotes: data });
      return;
    }

    // SUSPEND current open lote (keeps items in DB, no open lote afterwards)
    if (action === 'suspend') {
      const open = await sql`SELECT numero FROM inventory_lotes WHERE status = 'aberto' ORDER BY numero DESC LIMIT 1`;
      if (open.length === 0) {
        sendJson(res, { success: true, suspended: null });
        return;
      }
      const num = Number(open[0].numero);
      const items = await sql`SELECT id FROM shared_inventory WHERE lote_numero = ${num} LIMIT 1`;
      if (items.length === 0) {
        sendJson(res, { error: 'Lote vazio. Conte ao menos um item antes de suspender.' }, 400);
        return;
      }
      await sql`UPDATE inventory_lotes SET status = 'suspenso' WHERE numero = ${num}`;
      await sql`INSERT INTO inventory_lote_audit (lote_numero, action, username, role, details) VALUES (${num}, 'suspend', ${username}, ${payload.role}, ${JSON.stringify({ trigger: 'manual' })})`;
      sendJson(res, { success: true, suspended: num });
      return;
    }

    // RESUME a suspended lote: auto-suspends any currently open lote (if has items), then reopens target
    if (action === 'resume') {
      if (!lote_numero) {
        sendJson(res, { error: 'lote_numero obrigatório' }, 400);
        return;
      }
      const target = await sql`SELECT numero, status FROM inventory_lotes WHERE numero = ${lote_numero} LIMIT 1`;
      if (target.length === 0) {
        sendJson(res, { error: 'Lote não encontrado' }, 404);
        return;
      }
      if (target[0].status === 'finalizado') {
        sendJson(res, { error: 'Lote finalizado não pode ser reaberto' }, 400);
        return;
      }

      // suspend any currently open lote (different from target) that has items; drop empty open lotes
      const open = await sql`SELECT numero FROM inventory_lotes WHERE status = 'aberto' AND numero <> ${lote_numero}`;
      for (const row of open) {
        const n = Number(row.numero);
        const has = await sql`SELECT id FROM shared_inventory WHERE lote_numero = ${n} LIMIT 1`;
        if (has.length === 0) {
          await sql`DELETE FROM inventory_lotes WHERE numero = ${n}`;
        } else {
          await sql`UPDATE inventory_lotes SET status = 'suspenso' WHERE numero = ${n}`;
          await sql`INSERT INTO inventory_lote_audit (lote_numero, action, username, role, details) VALUES (${n}, 'suspend', ${username}, ${payload.role}, ${JSON.stringify({ trigger: 'auto_on_resume', resumed_lote: Number(lote_numero) })})`;
        }
      }
      await sql`UPDATE inventory_lotes SET status = 'aberto' WHERE numero = ${lote_numero}`;
      await sql`INSERT INTO inventory_lote_audit (lote_numero, action, username, role, details) VALUES (${lote_numero}, 'resume', ${username}, ${payload.role}, ${JSON.stringify({ previous_status: target[0].status })})`;
      sendJson(res, { success: true, resumed: Number(lote_numero) });
      return;
    }

    // LIST audit log entries (optional filter by lote)
    if (action === 'list_audit') {
      const data = lote_numero
        ? await sql`SELECT id, lote_numero, action, username, role, details, created_at FROM inventory_lote_audit WHERE lote_numero = ${lote_numero} ORDER BY created_at DESC LIMIT 500`
        : await sql`SELECT id, lote_numero, action, username, role, details, created_at FROM inventory_lote_audit ORDER BY created_at DESC LIMIT 500`;
      sendJson(res, { audit: data });
      return;
    }

    // GET specific lote items (read-only)
    if (action === 'get_lote') {
      if (!lote_numero) {
        sendJson(res, { error: 'lote_numero obrigatório' }, 400);
        return;
      }
      const data = await sql`SELECT * FROM shared_inventory WHERE lote_numero = ${lote_numero} ORDER BY updated_at ASC`;
      const loteInfo = await sql`SELECT numero, nome, status, created_by, created_at, finalized_at FROM inventory_lotes WHERE numero = ${lote_numero} LIMIT 1`;
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
      const target = lote_numero ?? await getOpenLote(sql);
      if (target == null) {
        sendJson(res, { error: 'Nenhum lote aberto' }, 400);
        return;
      }
      await sql`UPDATE inventory_lotes SET nome = ${nome} WHERE numero = ${target}`;
      await sql`INSERT INTO inventory_lote_audit (lote_numero, action, username, role, details) VALUES (${target}, 'rename', ${username}, ${payload.role}, ${JSON.stringify({ nome })})`;
      sendJson(res, { success: true, lote_numero: target, nome });
      return;
    }

    // ADD - always into current open lote
    if (action === 'add') {
      if (!item || quantidade === undefined || quantidade === null) {
        sendJson(res, { error: 'Dados do item são obrigatórios' }, 400);
        return;
      }
      const lote = await getOrCreateOpenLote(sql, username);
      const existing = await sql`SELECT id, quantidade FROM shared_inventory WHERE codigo = ${item.codigo} AND lote_numero = ${lote} LIMIT 1`;

      if (existing.length > 0) {
        const newQty = Number(existing[0].quantidade) + quantidade;
        await sql`UPDATE shared_inventory SET quantidade = ${newQty}, updated_at = NOW() WHERE id = ${existing[0].id}`;
      } else {
        await sql`INSERT INTO shared_inventory (ean, codigo, descricao, quantidade, created_by, updated_at, lote_numero) VALUES (${item.ean}, ${item.codigo}, ${item.descricao}, ${quantidade}, ${username}, NOW(), ${lote})`;
      }

      sendJson(res, { success: true, lote_numero: lote });
      return;
    }

    // FINALIZE current open lote
    if (action === 'finalize') {
      const open = await sql`SELECT numero FROM inventory_lotes WHERE status = 'aberto' ORDER BY numero DESC LIMIT 1`;
      if (open.length === 0) {
        // Nothing to finalize — treat as no-op success so UI doesn't break
        sendJson(res, { success: true, finalized: null, message: 'Nenhum lote aberto' });
        return;
      }
      const num = Number(open[0].numero);
      const items = await sql`SELECT id FROM shared_inventory WHERE lote_numero = ${num} LIMIT 1`;
      if (items.length === 0) {
        sendJson(res, { error: 'Lote vazio. Conte ao menos um item antes de finalizar.' }, 400);
        return;
      }
      await sql`UPDATE inventory_lotes SET status = 'finalizado', finalized_at = NOW() WHERE numero = ${num}`;
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
      const lote = await getOrCreateOpenLote(sql, username);
      await sql`UPDATE shared_inventory SET quantidade = ${quantidade}, updated_at = NOW() WHERE codigo = ${codigo} AND lote_numero = ${lote}`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'remove') {
      if (!codigo) {
        sendJson(res, { error: 'Código é obrigatório' }, 400);
        return;
      }
      const lote = await getOrCreateOpenLote(sql, username);
      await sql`DELETE FROM shared_inventory WHERE codigo = ${codigo} AND lote_numero = ${lote}`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'clear') {
      const lote = await getOrCreateOpenLote(sql, username);
      await sql`DELETE FROM shared_inventory WHERE lote_numero = ${lote}`;
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
