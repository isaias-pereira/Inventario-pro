/**
 * E-mails padrão das rebaixas.
 *
 * A aba E-mail cadastra os destinatários que recebem as rebaixas (com um
 * "padrão" que entra preenchido no envio) e guarda o assunto/mensagem padrão
 * da mensagem. O servidor usa essa lista como atalho no diálogo de envio da
 * Rebaixa e como fallback quando o cliente não informa destinatário.
 *
 * Ações (POST):
 * - `list`: devolve `{ emails, defaults }` — `defaults` traz assunto/mensagem;
 * - `add`: cadastra um e-mail padrão (`nome`, `email`, `padrao`);
 * - `update`: altera `nome`, `email`, `ativo` ou `padrao` de um cadastro;
 * - `remove`: remove um cadastro;
 * - `setDefault`: marca um cadastro como e-mail padrão das rebaixas;
 * - `setDefaults`: salva o assunto e a mensagem padrão.
 *
 * Leitura: admin e encarregado (quem envia as rebaixas).
 * Cadastro/edição/exclusão: só admin.
 */

import { createSql, type Sql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';

/** Papéis que podem ler a lista de e-mails padrão. */
export const EMAIL_READ_ROLES = ['admin', 'encarregado'] as const;

/** Papéis que podem cadastrar/editar/remover e-mails padrão. */
export const EMAIL_MANAGE_ROLES = ['admin'] as const;

/** Limites de tamanho (o banco e a Function aplicam os mesmos). */
export const MAX_NAME_LENGTH = 60;
export const MAX_EMAIL_LENGTH = 160;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 2000;

/** Texto inicial quando ainda não há assunto/mensagem padrão salvos. */
export const DEFAULT_SUBJECT = 'Solicitação de rebaixa / perecíveis — {{data}}';
export const DEFAULT_MESSAGE =
  'Segue a planilha de rebaixa com {{quantidade}} produto(s). Anexamos a planilha no formato .ods.';

/** Pode ler a lista de e-mails padrão (admin e encarregado). */
export function canReadEmails(role: unknown): boolean {
  return typeof role === 'string' && (EMAIL_READ_ROLES as readonly string[]).includes(role);
}

/** Pode cadastrar, editar e remover e-mails padrão (só admin). */
export function canManageEmails(role: unknown): boolean {
  return typeof role === 'string' && (EMAIL_MANAGE_ROLES as readonly string[]).includes(role);
}

/** Nome que identifica o cadastro nos atalhos. */
export function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

/** E-mail único (um por cadastro), já normalizado em minúsculas. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return null;
  return email;
}

/** Assunto padrão da mensagem. */
export function normalizeSubject(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const subject = value.trim();
  if (!subject || subject.length > MAX_SUBJECT_LENGTH) return null;
  return subject;
}

/** Mensagem padrão do corpo do e-mail. */
export function normalizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const message = value.trim();
  if (!message || message.length > MAX_MESSAGE_LENGTH) return null;
  return message;
}

/** Identificador numérico do cadastro. */
export function normalizeId(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(number) || !Number.isInteger(number) || number <= 0) return null;
  return number;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public.email_padrao (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(60) NOT NULL,
    email VARCHAR(160) NOT NULL,
    padrao BOOLEAN NOT NULL DEFAULT FALSE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT email_padrao_email_check
      CHECK (email ~* '^[^@[:space:],;]+@[^@[:space:],;]+\\.[^@[:space:],;]+$')
  )`;

const CREATE_CONFIG_SQL = `
  CREATE TABLE IF NOT EXISTS public.email_config (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    assunto VARCHAR(200) NOT NULL,
    mensagem VARCHAR(2000) NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT email_config_linha_unica CHECK (id = 1)
  )`;

let schemaReady = false;

/** Tabelas e índices criados de forma idempotente (uma vez por instância). */
async function ensureSchema(sql: Sql): Promise<boolean> {
  if (schemaReady) return true;
  try {
    await sql(CREATE_TABLE_SQL);
    await sql(CREATE_CONFIG_SQL);
  } catch (error) {
    // Pode já existir (corrida entre instâncias) ou faltar permissão.
    console.error('Email schema create:', error);
  }
  try {
    const rows = await sql`SELECT to_regclass('public.email_padrao') AS table_name`;
    schemaReady = Boolean(rows[0]?.table_name);
  } catch {
    schemaReady = false;
  }
  if (!schemaReady) return false;

  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_email
      ON public.email_padrao (lower(email))`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_unico_padrao
      ON public.email_padrao (padrao) WHERE padrao`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_padrao_ativo
      ON public.email_padrao (ativo)`;
  } catch {
    /* índices são otimização: seguem mesmo se falharem */
  }
  return true;
}

/** E-mails padrão: o marcado como padrão vem primeiro. */
const LIST_SQL = `
  SELECT id::text, nome, email, padrao, ativo, created_by, created_at
    FROM public.email_padrao
   ORDER BY padrao DESC, lower(nome) ASC`;

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    if (!canReadEmails(payload.role)) {
      sendJson(res, { error: 'Acesso restrito a admin e encarregado' }, 403);
      return;
    }

    const body = await readJsonBody<Record<string, unknown>>(req);
    const action = body.action;
    const sql = createSql();

    const ready = await ensureSchema(sql);
    if (!ready) {
      sendJson(res, { error: 'A tabela de e-mails padrão não está disponível' }, 503);
      return;
    }

    // LIST — e-mails padrão + assunto/mensagem padrão.
    if (action === 'list') {
      const emails = await sql(LIST_SQL);
      const config = await sql`
        SELECT assunto, mensagem FROM public.email_config WHERE id = 1`;
      const row = config[0];
      sendJson(res, {
        emails,
        defaults: {
          assunto: row?.assunto ?? DEFAULT_SUBJECT,
          mensagem: row?.mensagem ?? DEFAULT_MESSAGE,
        },
      });
      return;
    }

    // A partir daqui só o admin mexe na lista.
    if (!canManageEmails(payload.role)) {
      sendJson(res, { error: 'Apenas administradores podem alterar os e-mails padrão' }, 403);
      return;
    }

    if (action === 'add') {
      const nome = normalizeName(body.nome);
      if (!nome) {
        sendJson(res, { error: `Identificação inválida (até ${MAX_NAME_LENGTH} caracteres)` }, 400);
        return;
      }
      const email = normalizeEmail(body.email);
      if (!email) {
        sendJson(res, { error: 'E-mail inválido' }, 400);
        return;
      }
      const padrao = body.padrao === true;

      try {
        if (padrao) {
          await sql(
            [
              { query: 'UPDATE public.email_padrao SET padrao = FALSE, updated_at = now() WHERE padrao' },
              {
                query: `INSERT INTO public.email_padrao (nome, email, padrao, ativo, created_by)
                        VALUES ($1, $2, TRUE, TRUE, $3)`,
                params: [nome, email, payload.sub ?? null],
              },
            ],
            [],
            true,
          );
        } else {
          await sql(
            `INSERT INTO public.email_padrao (nome, email, padrao, ativo, created_by)
             VALUES ($1, $2, FALSE, TRUE, $3)`,
            [nome, email, payload.sub ?? null],
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (/duplicate|unique/i.test(message)) {
          sendJson(res, { error: 'Este e-mail já está cadastrado' }, 400);
          return;
        }
        throw error;
      }

      sendJson(res, { success: true });
      return;
    }

    if (action === 'update') {
      const id = normalizeId(body.id);
      if (!id) {
        sendJson(res, { error: 'Cadastro inválido' }, 400);
        return;
      }

      const current = await sql(
        'SELECT id::text, nome, email, padrao, ativo FROM public.email_padrao WHERE id = $1::bigint',
        [id],
      );
      if (!current.length) {
        sendJson(res, { error: 'Cadastro não encontrado' }, 404);
        return;
      }
      const row = current[0];

      const nome = body.nome === undefined ? row.nome : normalizeName(body.nome);
      if (!nome) {
        sendJson(res, { error: `Identificação inválida (até ${MAX_NAME_LENGTH} caracteres)` }, 400);
        return;
      }
      const email = body.email === undefined ? row.email : normalizeEmail(body.email);
      if (!email) {
        sendJson(res, { error: 'E-mail inválido' }, 400);
        return;
      }
      const ativo = body.ativo === undefined ? Boolean(row.ativo) : body.ativo === true;
      const padrao = body.padrao === undefined ? Boolean(row.padrao) : body.padrao === true;

      try {
        if (padrao && !row.padrao) {
          await sql(
            [
              { query: 'UPDATE public.email_padrao SET padrao = FALSE, updated_at = now() WHERE padrao' },
              {
                query: `UPDATE public.email_padrao
                           SET nome = $1, email = $2, ativo = $3, padrao = TRUE, updated_at = now()
                         WHERE id = $4::bigint`,
                params: [nome, email, ativo, id],
              },
            ],
            [],
            true,
          );
        } else {
          await sql(
            `UPDATE public.email_padrao
                SET nome = $1, email = $2, ativo = $3, padrao = $4, updated_at = now()
              WHERE id = $5::bigint`,
            [nome, email, ativo, padrao, id],
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (/duplicate|unique/i.test(message)) {
          sendJson(res, { error: 'Este e-mail já está cadastrado' }, 400);
          return;
        }
        throw error;
      }

      sendJson(res, { success: true });
      return;
    }

    if (action === 'remove') {
      const id = normalizeId(body.id);
      if (!id) {
        sendJson(res, { error: 'Cadastro inválido' }, 400);
        return;
      }
      await sql`DELETE FROM public.email_padrao WHERE id = ${id}::bigint`;
      sendJson(res, { success: true });
      return;
    }

    // Marca um cadastro como e-mail padrão (um só pode ser padrão).
    if (action === 'setDefault') {
      const id = normalizeId(body.id);
      if (!id) {
        sendJson(res, { error: 'Cadastro inválido' }, 400);
        return;
      }
      const exists = await sql`SELECT id::text FROM public.email_padrao WHERE id = ${id}::bigint`;
      if (!exists.length) {
        sendJson(res, { error: 'Cadastro não encontrado' }, 404);
        return;
      }
      await sql(
        [
          { query: 'UPDATE public.email_padrao SET padrao = FALSE, updated_at = now() WHERE padrao' },
          {
            query: 'UPDATE public.email_padrao SET padrao = TRUE, ativo = TRUE, updated_at = now() WHERE id = $1::bigint',
            params: [id],
          },
        ],
        [],
        true,
      );
      sendJson(res, { success: true });
      return;
    }

    // Assunto e mensagem padrão do envio.
    if (action === 'setDefaults') {
      const assunto = normalizeSubject(body.assunto);
      if (!assunto) {
        sendJson(res, { error: `Assunto inválido (até ${MAX_SUBJECT_LENGTH} caracteres)` }, 400);
        return;
      }
      const mensagem = normalizeMessage(body.mensagem);
      if (!mensagem) {
        sendJson(res, { error: `Mensagem inválida (até ${MAX_MESSAGE_LENGTH} caracteres)` }, 400);
        return;
      }
      await sql(
        [
          {
            query: `INSERT INTO public.email_config (id, assunto, mensagem, updated_by, updated_at)
                    VALUES (1, $1, $2, $3, now())
                    ON CONFLICT (id)
                    DO UPDATE SET assunto = EXCLUDED.assunto,
                                  mensagem = EXCLUDED.mensagem,
                                  updated_by = EXCLUDED.updated_by,
                                  updated_at = now()`,
            params: [assunto, mensagem, payload.sub ?? null],
          },
        ],
        [],
        true,
      );
      sendJson(res, { success: true });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('Manage emails error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    sendJson(res, { error: message }, 500);
  }
};

export default handler;
