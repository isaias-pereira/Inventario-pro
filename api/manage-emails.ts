/**
 * E-mails das rebaixas (multi-loja).
 *
 * A aba E-mail tem duas partes:
 *
 * 1. **Destinatários** (`email_padrao`): dois tipos:
 *    - **Globais** (tipo='global'): gerencia, carlos, horacio — visíveis para
 *      todos os encarregados da loja. Gerenciados SÓ pelo admin.
 *    - **Pessoais** (tipo='pessoal'): cada encarregado gerencia os seus
 *      (ex.: daniele, valeria, cassio para Isaias). Visíveis só para o dono.
 *
 *    Cada tipo tem seu próprio "padrão" (um global por loja, um pessoal por usuário).
 *
 * 2. **Conta de envio** (`email_envio`): a caixa de e-mail de cada
 *    encarregado/admin no servidor padrão (mail.comper.com.br:465). A senha
 *    fica criptografada no banco e nunca volta ao navegador. Cada um
 *    cadastra a sua; o admin vê e edita todas.
 *
 * Ações (POST):
 * - `list`: globais da loja + pessoais do usuário + assunto/mensagem padrão
 * - `add_pessoal` / `update_pessoal` / `remove_pessoal` / `setDefault_pessoal`:
 *   encarregado gerencia seus contatos pessoais
 * - `add` / `update` / `remove` / `setDefault`: admin gerencia globais
 * - `setDefaults`: admin salva assunto/mensagem padrão
 * - `my_account` / `save_account`: conta de envio do usuário logado
 * - `list_accounts` / `update_account` / `remove_account`: admin vê/edita contas de envio
 *
 * Leitura: admin e encarregado.
 * Escrita globais: admin.
 * Escrita pessoais: encarregado (próprios).
 */

import { createSql, type Sql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { ensureLojaSchema, resolveLoja } from './_lib/loja.js';
import { encryptSecret } from './_lib/email-crypto.js';
import {
  SMTP_PADRAO_HOST,
  SMTP_PADRAO_PORT,
  SMTP_PADRAO_SECURE,
  atualizarContaDeEnvio,
  contaDeEnvio,
  listarContasDeEnvio,
  removerContaDeEnvio,
  salvarContaDeEnvio,
} from './_lib/email-envio.js';
import { validateAndSend } from './_lib/errors.js';
import { emailPadraoSchema } from './_lib/validation.js';

/** Papéis que podem ler a lista de e-mails padrão. */
export const EMAIL_READ_ROLES = ['admin', 'encarregado'] as const;

/** Papéis que podem cadastrar/editar/remover e-mails GLOBAIS. */
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

/** Pode cadastrar, editar e remover e-mails GLOBAIS (só admin). */
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

/** Senha da conta de envio: 1 a 128 caracteres, sem espaços nas pontas. */
export function normalizeSenha(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const senha = value.trim();
  if (!senha || senha.length > 128) return null;
  return senha;
}

/** Remetente opcional (vazio = usa o e-mail da própria conta). */
export function normalizeRemetente(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return normalizeEmail(value);
}

/** Erro de unicidade do Postgres (23505) — e-mail já cadastrado. */
export function isUniqueViolation(error: unknown): boolean {
  const known = error as { code?: unknown; message?: unknown } | null;
  if (known?.code === '23505') return true;
  return typeof known?.message === 'string' && /duplicate|unique|already exists/i.test(known.message);
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
    loja INTEGER NOT NULL DEFAULT 103,
    -- Novas colunas (migration 20261121090000):
    tipo VARCHAR(20) NOT NULL DEFAULT 'global' CHECK (tipo IN ('global', 'pessoal')),
    usuario TEXT REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT email_padrao_email_check
      CHECK (email ~* '^[^@[:space:],;]+@[^@[:space:],;]+\\.[^@[:space:],;]+$')
  )`;

const CREATE_CONFIG_SQL = `
  CREATE TABLE IF NOT EXISTS public.email_config (
    id SMALLINT NOT NULL DEFAULT 1,
    assunto VARCHAR(200) NOT NULL,
    mensagem VARCHAR(2000) NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    loja INTEGER NOT NULL DEFAULT 103,
    PRIMARY KEY (loja)
  )`;

let schemaReady = false;

/** Tabelas e índices criados de forma idempotente (uma vez por instância). */
async function ensureSchema(sql: Sql): Promise<boolean> {
  if (schemaReady) return true;
  try {
    await sql(CREATE_TABLE_SQL);
    await sql(CREATE_CONFIG_SQL);
  } catch (error) {
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
    // Multi-loja: índices por tipo
    await sql`ALTER TABLE public.email_padrao ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
    await sql`ALTER TABLE public.email_padrao ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'global' CHECK (tipo IN ('global', 'pessoal'))`;
    await sql`ALTER TABLE public.email_padrao ADD COLUMN IF NOT EXISTS usuario TEXT REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE`;

    await sql`DROP INDEX IF EXISTS idx_email_padrao_loja_email`;
    await sql`DROP INDEX IF EXISTS idx_email_padrao_loja_unico_padrao`;

    // Globais: único por (loja, email)
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_global_unico
      ON public.email_padrao (loja, lower(email))
      WHERE tipo = 'global'`;
    // Pessoais: único por (usuario, email)
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_pessoal_unico
      ON public.email_padrao (usuario, lower(email))
      WHERE tipo = 'pessoal'`;

    // Padrão global: 1 por loja
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_global_padrao
      ON public.email_padrao (loja)
      WHERE tipo = 'global' AND padrao`;
    // Padrão pessoal: 1 por usuario
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_pessoal_padrao
      ON public.email_padrao (usuario)
      WHERE tipo = 'pessoal' AND padrao`;

    // Índices de busca
    await sql`CREATE INDEX IF NOT EXISTS idx_email_padrao_loja_tipo
      ON public.email_padrao (loja, tipo)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_padrao_usuario
      ON public.email_padrao (usuario)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_padrao_ativo
      ON public.email_padrao (ativo)`;

    // email_config
    await sql`ALTER TABLE public.email_config ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103`;
    await sql`ALTER TABLE public.email_config DROP CONSTRAINT IF EXISTS email_config_linha_unica`;
    await sql`ALTER TABLE public.email_config DROP CONSTRAINT IF EXISTS email_config_pkey`;
    await sql`ALTER TABLE public.email_config ADD PRIMARY KEY (loja)`;

  } catch {
    /* índices são otimização: seguem mesmo se falharem */
  }
  return true;
}

/**
 * SELECT para LIST: globais da loja + pessoais do usuário.
 * Ordena: padrão primeiro, depois por nome.
 */
const LIST_SQL = `
  SELECT id::text, nome, email, padrao, ativo, tipo, usuario, created_by, created_at
    FROM public.email_padrao
   WHERE (tipo = 'global' AND loja = $1)
      OR (tipo = 'pessoal' AND usuario = $2)
   ORDER BY tipo DESC, padrao DESC, lower(nome) ASC`;

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
    await ensureLojaSchema(sql);
    const loja = await resolveLoja(sql, payload);
    const usuario = String(payload.sub ?? '');
    const isAdmin = payload.role === 'admin';
    const isEncarregado = payload.role === 'encarregado';

    // LIST — globais da loja + pessoais do usuário + assunto/mensagem padrão.
    if (action === 'list') {
      const emails = await sql(LIST_SQL, [loja, usuario]);
      const config = await sql`
        SELECT assunto, mensagem FROM public.email_config WHERE loja = ${loja}`;
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

    // ── Conta de envio do usuário logado ────────────────────────────
    if (action === 'my_account') {
      const conta = await contaDeEnvio(sql, usuario, loja);
      sendJson(res, {
        conta: conta ?? {
          email: '',
          host: SMTP_PADRAO_HOST,
          porta: SMTP_PADRAO_PORT,
          secure: SMTP_PADRAO_SECURE,
          remetente: null,
          ativo: true,
          temSenha: false,
        },
        servidor: {
          host: SMTP_PADRAO_HOST,
          porta: SMTP_PADRAO_PORT,
          secure: SMTP_PADRAO_SECURE,
        },
      });
      return;
    }

    if (action === 'save_account') {
      if (!usuario) {
        sendJson(res, { error: 'Usuário inválido' }, 400);
        return;
      }
      const email = normalizeEmail(body.email);
      if (!email) {
        sendJson(res, { error: 'E-mail inválido' }, 400);
        return;
      }
      const atual = await contaDeEnvio(sql, usuario, loja);
      const senha = normalizeSenha(body.senha);
      if (!senha && !atual?.temSenha) {
        sendJson(res, { error: 'Informe a senha da conta de e-mail' }, 400);
        return;
      }
      const remetente = normalizeRemetente(body.remetente);
      if (remetente === undefined) {
        sendJson(res, { error: 'Remetente inválido' }, 400);
        return;
      }
      const ativo = body.ativo === undefined ? true : body.ativo === true;

      try {
        if (senha) {
          await salvarContaDeEnvio(sql, {
            usuario,
            loja,
            email,
            senhaCriptografada: encryptSecret(senha),
            host: atual?.host ?? SMTP_PADRAO_HOST,
            porta: atual?.porta ?? SMTP_PADRAO_PORT,
            secure: atual?.secure ?? SMTP_PADRAO_SECURE,
            remetente: remetente ?? atual?.remetente ?? null,
            ativo,
            updatedBy: usuario,
          });
        } else {
          await atualizarContaDeEnvio(sql, {
            usuario,
            loja,
            email,
            remetente: remetente ?? atual?.remetente ?? null,
            ativo,
            updatedBy: usuario,
          });
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          sendJson(res, { error: 'Já existe uma conta de e-mail para este usuário' }, 400);
          return;
        }
        throw error;
      }

      sendJson(res, { success: true });
      return;
    }

    // ── Gestão das contas de envio (admin) ────────────────────────────
    if (action === 'list_accounts') {
      if (!isAdmin) {
        sendJson(res, { error: 'Apenas administradores podem ver as contas de e-mail' }, 403);
        return;
      }
      const contas = await listarContasDeEnvio(sql, loja);
      sendJson(res, { contas });
      return;
    }

    if (action === 'update_account') {
      if (!isAdmin) {
        sendJson(res, { error: 'Apenas administradores podem editar as contas de e-mail' }, 403);
        return;
      }
      const usuarioAlvo = String(body.usuario ?? '').trim();
      if (!usuarioAlvo) {
        sendJson(res, { error: 'Usuário obrigatório' }, 400);
        return;
      }
      const alvo = await sql`
        SELECT username, loja FROM public.app_users WHERE username = ${usuarioAlvo} LIMIT 1`;
      if (!alvo.length || Number(alvo[0].loja) !== loja) {
        sendJson(res, { error: 'Usuário não encontrado nesta loja' }, 404);
        return;
      }
      const atual = await contaDeEnvio(sql, usuarioAlvo, loja);
      const email = body.email === undefined ? atual?.email : normalizeEmail(body.email);
      if (!email) {
        sendJson(res, { error: 'E-mail inválido' }, 400);
        return;
      }
      const senha = body.senha === undefined ? null : normalizeSenha(body.senha);
      if (body.senha !== undefined && !senha) {
        sendJson(res, { error: 'Senha inválida' }, 400);
        return;
      }
      const remetente = body.remetente === undefined
        ? (atual?.remetente ?? null)
        : normalizeRemetente(body.remetente);
      if (remetente === undefined) {
        sendJson(res, { error: 'Remetente inválido' }, 400);
        return;
      }
      const ativo = body.ativo === undefined ? (atual?.ativo ?? true) : body.ativo === true;

      if (senha) {
        await salvarContaDeEnvio(sql, {
          usuario: usuarioAlvo,
          loja,
          email,
          senhaCriptografada: encryptSecret(senha),
          host: atual?.host ?? SMTP_PADRAO_HOST,
          porta: atual?.porta ?? SMTP_PADRAO_PORT,
          secure: atual?.secure ?? SMTP_PADRAO_SECURE,
          remetente,
          ativo,
          updatedBy: String(payload.sub ?? ''),
        });
      } else if (atual?.temSenha) {
        await atualizarContaDeEnvio(sql, {
          usuario: usuarioAlvo,
          loja,
          email,
          remetente,
          ativo,
          updatedBy: String(payload.sub ?? ''),
        });
      } else {
        sendJson(res, { error: 'Informe a senha da conta de e-mail' }, 400);
        return;
      }

      sendJson(res, { success: true });
      return;
    }

    if (action === 'remove_account') {
      if (!isAdmin) {
        sendJson(res, { error: 'Apenas administradores podem remover contas de e-mail' }, 403);
        return;
      }
      const usuarioAlvo = String(body.usuario ?? '').trim();
      if (!usuarioAlvo) {
        sendJson(res, { error: 'Usuário obrigatório' }, 400);
        return;
      }
      await removerContaDeEnvio(sql, usuarioAlvo, loja);
      sendJson(res, { success: true });
      return;
    }

    // ================================================================
    // CONTACTOS PESSOAIS (encarregado gerencia os seus)
    // ================================================================

    if (action === 'add_pessoal') {
      if (!isEncarregado && !isAdmin) {
        sendJson(res, { error: 'Apenas encarregados podem adicionar contatos pessoais' }, 403);
        return;
      }
      const input = validateAndSend(res, emailPadraoSchema, { ...body, action: 'add_pessoal', tipo: 'pessoal' });
      if (!input) return;

      const { nome, email, padrao } = input;
      try {
        if (padrao) {
          await sql`
            UPDATE public.email_padrao
               SET padrao = FALSE, updated_at = now()
             WHERE tipo = 'pessoal' AND usuario = ${usuario} AND padrao`;
        }
        await sql`
          INSERT INTO public.email_padrao (nome, email, padrao, ativo, tipo, usuario, loja, created_by)
          VALUES (${nome}, ${email}, ${padrao}, TRUE, 'pessoal', ${usuario}, ${loja}, ${usuario})`;
      } catch (error) {
        if (isUniqueViolation(error)) {
          sendJson(res, { error: 'Este e-mail já está cadastrado nos seus contatos pessoais' }, 400);
          return;
        }
        throw error;
      }
      sendJson(res, { success: true });
      return;
    }

    if (action === 'update_pessoal') {
      if (!isEncarregado && !isAdmin) {
        sendJson(res, { error: 'Apenas encarregados podem editar contatos pessoais' }, 403);
        return;
      }
      const id = normalizeId(body.id);
      if (!id) {
        sendJson(res, { error: 'Cadastro inválido' }, 400);
        return;
      }

      const current = await sql(
        'SELECT id::text, nome, email, padrao, ativo, tipo, usuario FROM public.email_padrao WHERE id = $1::bigint',
        [id],
      );
      if (!current.length) {
        sendJson(res, { error: 'Cadastro não encontrado' }, 404);
        return;
      }
      const row = current[0];
      if (row.tipo !== 'pessoal') {
        sendJson(res, { error: 'Use a ação "update" para contatos globais (admin)' }, 400);
        return;
      }
      if (!isAdmin && row.usuario !== usuario) {
        sendJson(res, { error: 'Este contato pertence a outro usuário' }, 403);
        return;
      }

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
          await sql`
            UPDATE public.email_padrao
               SET padrao = FALSE, updated_at = now()
             WHERE tipo = 'pessoal' AND usuario = ${usuario} AND padrao`;
        }
        await sql`
          UPDATE public.email_padrao
             SET nome = ${nome}, email = ${email}, ativo = ${ativo}, padrao = ${padrao}, updated_at = now()
           WHERE id = ${id}::bigint`;
      } catch (error) {
        if (isUniqueViolation(error)) {
          sendJson(res, { error: 'Este e-mail já está cadastrado nos seus contatos pessoais' }, 400);
          return;
        }
        throw error;
      }

      sendJson(res, { success: true });
      return;
    }

    if (action === 'remove_pessoal') {
      if (!isEncarregado && !isAdmin) {
        sendJson(res, { error: 'Apenas encarregados podem remover contatos pessoais' }, 403);
        return;
      }
      const id = normalizeId(body.id);
      if (!id) {
        sendJson(res, { error: 'Cadastro inválido' }, 400);
        return;
      }
      const row = await sql(
        'SELECT id::text, tipo, usuario FROM public.email_padrao WHERE id = $1::bigint',
        [id],
      );
      if (!row.length) {
        sendJson(res, { error: 'Cadastro não encontrado' }, 404);
        return;
      }
      if (row[0].tipo !== 'pessoal') {
        sendJson(res, { error: 'Use a ação "remove" para contatos globais (admin)' }, 400);
        return;
      }
      if (!isAdmin && row[0].usuario !== usuario) {
        sendJson(res, { error: 'Este contato pertence a outro usuário' }, 403);
        return;
      }
      await sql`DELETE FROM public.email_padrao WHERE id = ${id}::bigint`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'setDefault_pessoal') {
      if (!isEncarregado && !isAdmin) {
        sendJson(res, { error: 'Apenas encarregados podem definir padrão pessoal' }, 403);
        return;
      }
      const id = normalizeId(body.id);
      if (!id) {
        sendJson(res, { error: 'Cadastro inválido' }, 400);
        return;
      }
      const exists = await sql`
        SELECT id::text, tipo, usuario FROM public.email_padrao WHERE id = ${id}::bigint`;
      if (!exists.length) {
        sendJson(res, { error: 'Cadastro não encontrado' }, 404);
        return;
      }
      if (exists[0].tipo !== 'pessoal') {
        sendJson(res, { error: 'Use "setDefault" para contatos globais (admin)' }, 400);
        return;
      }
      if (!isAdmin && exists[0].usuario !== usuario) {
        sendJson(res, { error: 'Este contato pertence a outro usuário' }, 403);
        return;
      }
      await sql`
        UPDATE public.email_padrao
           SET padrao = FALSE, updated_at = now()
         WHERE tipo = 'pessoal' AND usuario = ${usuario} AND padrao`;
      await sql`
        UPDATE public.email_padrao
           SET padrao = TRUE, ativo = TRUE, updated_at = now()
         WHERE id = ${id}::bigint`;
      sendJson(res, { success: true });
      return;
    }

    // ================================================================
    // CONTACTOS GLOBAIS (admin)
    // ================================================================

    if (!isAdmin) {
      sendJson(res, { error: 'Apenas administradores podem alterar os contatos globais' }, 403);
      return;
    }

    if (action === 'add') {
      const input = validateAndSend(res, emailPadraoSchema, { ...body, action: 'add', tipo: 'global' });
      if (!input) return;

      const { nome, email, padrao } = input;
      try {
        if (padrao) {
          await sql`
            UPDATE public.email_padrao
               SET padrao = FALSE, updated_at = now()
             WHERE tipo = 'global' AND loja = ${loja} AND padrao`;
        }
        await sql`
          INSERT INTO public.email_padrao (nome, email, padrao, ativo, tipo, loja, created_by)
          VALUES (${nome}, ${email}, ${padrao}, TRUE, 'global', ${loja}, ${usuario})`;
      } catch (error) {
        if (isUniqueViolation(error)) {
          sendJson(res, { error: 'Este e-mail já está cadastrado como global' }, 400);
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
        'SELECT id::text, nome, email, padrao, ativo, tipo FROM public.email_padrao WHERE id = $1::bigint AND loja = $2',
        [id, loja],
      );
      if (!current.length) {
        sendJson(res, { error: 'Cadastro não encontrado' }, 404);
        return;
      }
      const row = current[0];
      if (row.tipo !== 'global') {
        sendJson(res, { error: 'Use "update_pessoal" para contatos pessoais' }, 400);
        return;
      }
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
          await sql`
            UPDATE public.email_padrao
               SET padrao = FALSE, updated_at = now()
             WHERE tipo = 'global' AND loja = ${loja} AND padrao`;
        }
        await sql`
          UPDATE public.email_padrao
             SET nome = ${nome}, email = ${email}, ativo = ${ativo}, padrao = ${padrao}, updated_at = now()
           WHERE id = ${id}::bigint AND loja = ${loja}`;
      } catch (error) {
        if (isUniqueViolation(error)) {
          sendJson(res, { error: 'Este e-mail já está cadastrado como global' }, 400);
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
      const row = await sql(
        'SELECT id::text, tipo FROM public.email_padrao WHERE id = $1::bigint AND loja = $2',
        [id, loja],
      );
      if (!row.length) {
        sendJson(res, { error: 'Cadastro não encontrado' }, 404);
        return;
      }
      if (row[0].tipo !== 'global') {
        sendJson(res, { error: 'Use "remove_pessoal" para contatos pessoais' }, 400);
        return;
      }
      await sql`DELETE FROM public.email_padrao WHERE id = ${id}::bigint AND loja = ${loja}`;
      sendJson(res, { success: true });
      return;
    }

    if (action === 'setDefault') {
      const id = normalizeId(body.id);
      if (!id) {
        sendJson(res, { error: 'Cadastro inválido' }, 400);
        return;
      }
      const exists = await sql`
        SELECT id::text, tipo FROM public.email_padrao WHERE id = ${id}::bigint AND loja = ${loja}`;
      if (!exists.length) {
        sendJson(res, { error: 'Cadastro não encontrado' }, 404);
        return;
      }
      if (exists[0].tipo !== 'global') {
        sendJson(res, { error: 'Use "setDefault_pessoal" para contatos pessoais' }, 400);
        return;
      }
      await sql`
        UPDATE public.email_padrao
           SET padrao = FALSE, updated_at = now()
         WHERE tipo = 'global' AND loja = ${loja} AND padrao`;
      await sql`
        UPDATE public.email_padrao
           SET padrao = TRUE, ativo = TRUE, updated_at = now()
         WHERE id = ${id}::bigint AND loja = ${loja}`;
      sendJson(res, { success: true });
      return;
    }

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
            query: `INSERT INTO public.email_config (id, loja, assunto, mensagem, updated_by, updated_at)
                    VALUES (1, $1, $2, $3, $4, now())
                    ON CONFLICT (loja)
                    DO UPDATE SET assunto = EXCLUDED.assunto,
                                  mensagem = EXCLUDED.mensagem,
                                  updated_by = EXCLUDED.updated_by,
                                  updated_at = now()`,
            params: [loja, assunto, mensagem, usuario],
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