import { createSql, type Sql } from './_lib/db';
import { authenticate } from './_lib/auth';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http';

const MOTIVOS_VALIDADE = ['Excesso', 'Qualidade'];

/** Motivo do rebaixa para produtos de balança (KG). Vazio ou nulo = sem motivo. */
function normalizeMotivo(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const found = MOTIVOS_VALIDADE.find((m) => m.toLowerCase() === value.trim().toLowerCase());
  return found ? { ok: true, value: found } : { ok: false };
}

function isDigits14(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const clean = String(value).trim();
  return /^\d{1,14}$/.test(clean) ? clean : null;
}

let schemaReady = false;

/** Índices e coluna `motivo` criados de forma idempotente (uma vez por instância). */
async function ensureSchema(sql: Sql): Promise<boolean> {
  if (schemaReady) return true;
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_validade_status_validade ON validade_products(status, validade)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_validade_created_by ON validade_products(created_by)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_validade_created_at ON validade_products(created_at)`;
  } catch {
    /* índices são otimização: seguem mesmo se falharem */
  }
  try {
    await sql`ALTER TABLE validade_products ADD COLUMN IF NOT EXISTS motivo VARCHAR(20)`;
    schemaReady = true;
  } catch {
    const rows = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'validade_products' AND column_name = 'motivo'`;
    schemaReady = rows.length > 0;
  }
  return schemaReady;
}

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const username = payload.sub;
    const body = await readJsonBody<Record<string, any>>(req);
    const action = body.action;
    const sql = createSql();

    // Coluna do motivo (Excesso/Qualidade) usada nos produtos de balança (KG).
    const hasMotivoColumn = await ensureSchema(sql);

    // Auto-expire only on read actions (avoid unnecessary write on every request)
    const readActions = new Set(['list', 'list_all', 'notifications', 'consulta_periodo']);
    if (readActions.has(action)) {
      await sql`UPDATE validade_products SET status = false WHERE status = true AND validade < NOW() AND motivo IS NULL`;
    }

    // LIST - items expiring within 2 days
    if (action === 'list') {
      const data = await sql`
        SELECT * FROM validade_products
        WHERE status = true AND validade <= (NOW() + INTERVAL '2 days')
        ORDER BY validade ASC`;
      sendJson(res, { items: data });
      return;
    }

    // LIST_ALL
    if (action === 'list_all') {
      const userRole = payload.role;

      if (userRole === 'col_validade') {
        const data = await sql`SELECT * FROM validade_products WHERE status = true AND created_by = ${username} ORDER BY validade ASC`;
        sendJson(res, { items: data });
        return;
      }

      if (userRole === 'promotor') {
        const data = await sql`
          SELECT v.* FROM validade_products v
          INNER JOIN app_users u ON v.created_by = u.username
          WHERE v.status = true AND u.role = 'promotor'
          ORDER BY v.validade ASC`;
        sendJson(res, { items: data });
        return;
      }

      if (userRole === 'user' || userRole === 'encarregado' || userRole === 'enc_flv') {
        const data = await sql`
          SELECT v.* FROM validade_products v
          INNER JOIN app_users u ON v.created_by = u.username
          WHERE v.status = true AND u.role IN ('promotor', 'user', 'encarregado', 'enc_flv', 'col_validade')
          ORDER BY v.validade ASC`;
        sendJson(res, { items: data });
        return;
      }

      // admin sees all
      const data = await sql`SELECT * FROM validade_products WHERE status = true ORDER BY validade ASC`;
      sendJson(res, { items: data });
      return;
    }

    // ADD
    if (action === 'add') {
      const { item } = body;
      if (!item || !item.ean || !item.codigo || !item.descricao || !item.validade) {
        sendJson(res, { error: 'Dados incompletos' }, 400);
        return;
      }
      const cleanEan = isDigits14(item.ean);
      const cleanCodigo = isDigits14(item.codigo);
      const cleanDescricao = typeof item.descricao === 'string' && item.descricao.trim().length > 0 && item.descricao.length <= 500
        ? item.descricao.trim() : null;
      const validadeMs = typeof item.validade === 'string' ? Date.parse(item.validade) : NaN;
      const cleanValidade = !isNaN(validadeMs) ? new Date(validadeMs).toISOString() : null;
      const qtyNum = Number(item.quantidade);
      const cleanQuantidade = Number.isInteger(qtyNum) && qtyNum > 0 && qtyNum <= 100000 ? qtyNum : 1;
      const motivo = normalizeMotivo(item.motivo);
      if (!cleanEan || !cleanCodigo || !cleanDescricao || !cleanValidade) {
        sendJson(res, { error: 'Dados inválidos (EAN/código devem ser dígitos até 14, descrição até 500 chars, validade data válida)' }, 400);
        return;
      }
      if (!motivo.ok) {
        sendJson(res, { error: 'Motivo inválido (use Excesso ou Qualidade)' }, 400);
        return;
      }

      if (hasMotivoColumn) {
        await sql`INSERT INTO validade_products (ean, codigo, descricao, validade, quantidade, status, created_by, motivo)
          VALUES (${cleanEan}, ${cleanCodigo}, ${cleanDescricao}, ${cleanValidade}, ${cleanQuantidade}, true, ${username}, ${motivo.value})`;
      } else {
        await sql`INSERT INTO validade_products (ean, codigo, descricao, validade, quantidade, status, created_by)
          VALUES (${cleanEan}, ${cleanCodigo}, ${cleanDescricao}, ${cleanValidade}, ${cleanQuantidade}, true, ${username})`;
      }
      sendJson(res, { success: true });
      return;
    }

    // UPDATE (admin only)
    if (action === 'update') {
      if (payload.role !== 'admin') {
        sendJson(res, { error: 'Apenas admin pode editar' }, 403);
        return;
      }
      const { id, validade: newValidade, quantidade: newQuantidade } = body;
      if (!id || !newValidade) {
        sendJson(res, { error: 'Dados incompletos' }, 400);
        return;
      }

      const hasMotivo = 'motivo' in body;
      const motivo = hasMotivo ? normalizeMotivo(body.motivo) : { ok: true as const, value: null };
      if (!motivo.ok) {
        sendJson(res, { error: 'Motivo inválido (use Excesso ou Qualidade)' }, 400);
        return;
      }

      if (hasMotivo && hasMotivoColumn) {
        await sql`UPDATE validade_products SET validade = ${newValidade}, quantidade = COALESCE(${newQuantidade ?? null}, quantidade), motivo = ${motivo.value} WHERE id = ${id}`;
      } else if (newQuantidade !== undefined) {
        await sql`UPDATE validade_products SET validade = ${newValidade}, quantidade = ${newQuantidade} WHERE id = ${id}`;
      } else {
        await sql`UPDATE validade_products SET validade = ${newValidade} WHERE id = ${id}`;
      }
      sendJson(res, { success: true });
      return;
    }

    // REMOVE (admin only)
    if (action === 'remove') {
      if (payload.role !== 'admin') {
        sendJson(res, { error: 'Apenas admin pode remover' }, 403);
        return;
      }
      const { id } = body;
      if (!id) {
        sendJson(res, { error: 'ID obrigatório' }, 400);
        return;
      }
      await sql`UPDATE validade_products SET status = false WHERE id = ${id}`;
      sendJson(res, { success: true });
      return;
    }

    // CONSULTA_PERIODO
    if (action === 'consulta_periodo') {
      if (payload.role !== 'admin' && payload.role !== 'encarregado') {
        sendJson(res, { error: 'Acesso restrito a admin e encarregado' }, 403);
        return;
      }
      const { data_inicio, data_fim, created_by } = body;
      if (!data_inicio && !data_fim && !created_by) {
        sendJson(res, { error: 'Informe data ou usuário' }, 400);
        return;
      }

      const startDate = data_inicio ? new Date(data_inicio).toISOString() : null;
      const endDate = data_fim ? new Date(data_fim + 'T23:59:59').toISOString() : null;

      let data;
      if (startDate && endDate && created_by) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at >= ${startDate} AND created_at <= ${endDate} AND created_by = ${created_by} ORDER BY validade ASC`;
      } else if (startDate && endDate) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at >= ${startDate} AND created_at <= ${endDate} ORDER BY validade ASC`;
      } else if (startDate && created_by) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at >= ${startDate} AND created_by = ${created_by} ORDER BY validade ASC`;
      } else if (endDate && created_by) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at <= ${endDate} AND created_by = ${created_by} ORDER BY validade ASC`;
      } else if (startDate) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at >= ${startDate} ORDER BY validade ASC`;
      } else if (endDate) {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_at <= ${endDate} ORDER BY validade ASC`;
      } else {
        data = await sql`SELECT * FROM validade_products WHERE status = true AND created_by = ${created_by} ORDER BY validade ASC`;
      }
      sendJson(res, { items: data });
      return;
    }

    // LIST_USERS
    if (action === 'list_users') {
      if (payload.role !== 'admin' && payload.role !== 'encarregado') {
        sendJson(res, { error: 'Acesso restrito' }, 403);
        return;
      }
      const data = await sql`SELECT DISTINCT created_by FROM validade_products WHERE created_by IS NOT NULL ORDER BY created_by`;
      const users = data.map((row: any) => row.created_by);
      sendJson(res, { users });
      return;
    }

    // NOTIFICATIONS
    if (action === 'notifications') {
      const data = await sql`
        SELECT * FROM validade_products
        WHERE status = true AND validade <= (NOW() + INTERVAL '2 days')
        ORDER BY validade ASC`;
      sendJson(res, { items: data });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('Manage validade error:', error);
    sendJson(res, { error: 'Erro interno do servidor' }, 500);
  }
};

export default handler;
