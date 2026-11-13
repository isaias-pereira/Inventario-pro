/**
 * Conta de e-mail de envio do usuário.
 *
 * Cada encarregado (e o admin) tem a **própria** conta do servidor padrão
 * (mail.comper.com.br, TLS na 465): o e-mail cadastrado é o remetente das
 * rebaixas que ele envia. O servidor (host/porta) é o mesmo para todos — o
 * que muda é o par usuário/senha de cada um.
 *
 * A senha fica criptografada no banco (`api/_lib/email-crypto.ts`) e nunca
 * volta para o navegador. Os destinatários das rebaixas continuam por loja,
 * na tabela `email_padrao` (mantida em `api/manage-emails.ts`).
 */

import type { Sql } from './db.js';
import { decryptSecret } from './email-crypto.js';

/** Servidor padrão de envio da empresa. */
export const SMTP_PADRAO_HOST = 'mail.comper.com.br';
export const SMTP_PADRAO_PORT = 465;
export const SMTP_PADRAO_SECURE = true;

/** Conta de envio vista pela tela (nunca traz a senha). */
export interface EmailEnvioConta {
  /** E-mail do usuário no servidor de envio. */
  email: string;
  host: string;
  porta: number;
  secure: boolean;
  /** Remetente da mensagem (quando difere do e-mail da conta). */
  remetente: string | null;
  ativo: boolean;
  /** `true` quando há senha guardada. */
  temSenha: boolean;
}

/** Linha da tabela `email_envio` (a senha vem criptografada). */
export interface EmailEnvioRow {
  usuario: string;
  loja: number;
  email: string;
  senha: string;
  host: string;
  porta: number;
  secure: boolean;
  remetente: string | null;
  ativo: boolean;
}

/** Conta pronta para o transporte SMTP (com a senha decriptografada). */
export interface ContaSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public.email_envio (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL
      REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE,
    loja INTEGER NOT NULL DEFAULT 103
      REFERENCES public.lojas(codigo) ON UPDATE CASCADE ON DELETE RESTRICT,
    email VARCHAR(160) NOT NULL,
    senha TEXT NOT NULL,
    host VARCHAR(120) NOT NULL DEFAULT 'mail.comper.com.br',
    porta INTEGER NOT NULL DEFAULT 465,
    secure BOOLEAN NOT NULL DEFAULT TRUE,
    remetente VARCHAR(160),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT email_envio_unico UNIQUE (loja, usuario)
  )`;

let schemaReady = false;

/** Tabela e índices criados de forma idempotente (uma vez por instância). */
export async function ensureEmailEnvioSchema(sql: Sql): Promise<void> {
  if (schemaReady) return;
  try {
    await sql(CREATE_TABLE_SQL);
    await sql`CREATE INDEX IF NOT EXISTS idx_email_envio_loja ON public.email_envio (loja)`;
    schemaReady = true;
  } catch (error) {
    console.error('Email envio schema:', error);
  }
}

/** Conta de envio de um usuário (sem a senha), ou `null` quando ele não tem. */
export async function contaDeEnvio(
  sql: Sql,
  usuario: string,
  loja: number,
): Promise<EmailEnvioConta | null> {
  await ensureEmailEnvioSchema(sql);
  const rows = await sql`
    SELECT usuario, email, host, porta, secure, remetente, ativo, (senha IS NOT NULL) AS tem_senha
      FROM public.email_envio
     WHERE usuario = ${usuario} AND loja = ${loja}
     LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    email: String(row.email),
    host: String(row.host ?? SMTP_PADRAO_HOST),
    porta: Number(row.porta ?? SMTP_PADRAO_PORT),
    secure: row.secure !== false,
    remetente: row.remetente ? String(row.remetente) : null,
    ativo: row.ativo !== false,
    temSenha: Boolean(row.tem_senha),
  };
}

/** Contas de envio da loja (visão do admin). */
export async function listarContasDeEnvio(sql: Sql, loja: number): Promise<EmailEnvioRow[]> {
  await ensureEmailEnvioSchema(sql);
  const rows = await sql`
    SELECT usuario, loja, email, host, porta, secure, remetente, ativo
      FROM public.email_envio
     WHERE loja = ${loja}
     ORDER BY usuario`;
  return rows.map((row) => ({
    usuario: String(row.usuario),
    loja: Number(row.loja),
    email: String(row.email),
    senha: '',
    host: String(row.host ?? SMTP_PADRAO_HOST),
    porta: Number(row.porta ?? SMTP_PADRAO_PORT),
    secure: row.secure !== false,
    remetente: row.remetente ? String(row.remetente) : null,
    ativo: row.ativo !== false,
  }));
}

/** Grava (ou atualiza) a conta de envio de um usuário, com a senha. */
export async function salvarContaDeEnvio(
  sql: Sql,
  dados: {
    usuario: string;
    loja: number;
    email: string;
    senhaCriptografada: string;
    host?: string;
    porta?: number;
    secure?: boolean;
    remetente?: string | null;
    ativo?: boolean;
    updatedBy?: string | null;
  },
): Promise<void> {
  await ensureEmailEnvioSchema(sql);
  const host = dados.host ?? SMTP_PADRAO_HOST;
  const porta = dados.porta ?? SMTP_PADRAO_PORT;
  const secure = dados.secure ?? SMTP_PADRAO_SECURE;
  await sql`
    INSERT INTO public.email_envio
      (usuario, loja, email, senha, host, porta, secure, remetente, ativo, updated_by, updated_at)
    VALUES (
      ${dados.usuario}, ${dados.loja}, ${dados.email}, ${dados.senhaCriptografada},
      ${host}, ${porta}, ${secure}, ${dados.remetente ?? null}, ${dados.ativo ?? true},
      ${dados.updatedBy ?? null}, now()
    )
    ON CONFLICT (loja, usuario) DO UPDATE SET
      email = EXCLUDED.email,
      senha = EXCLUDED.senha,
      host = EXCLUDED.host,
      porta = EXCLUDED.porta,
      secure = EXCLUDED.secure,
      remetente = EXCLUDED.remetente,
      ativo = EXCLUDED.ativo,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()`;
}

/**
 * Atualiza os dados da conta de envio **sem** mexer na senha.
 *
 * Usado quando o encarregado só troca o e-mail ou desativa a conta: a senha
 * guardada continua valendo.
 */
export async function atualizarContaDeEnvio(
  sql: Sql,
  dados: {
    usuario: string;
    loja: number;
    email: string;
    remetente?: string | null;
    ativo?: boolean;
    updatedBy?: string | null;
  },
): Promise<void> {
  await ensureEmailEnvioSchema(sql);
  await sql`
    UPDATE public.email_envio
       SET email = ${dados.email},
           remetente = ${dados.remetente ?? null},
           ativo = ${dados.ativo ?? true},
           updated_by = ${dados.updatedBy ?? null},
           updated_at = now()
     WHERE usuario = ${dados.usuario} AND loja = ${dados.loja}`;
}

/** Remove a conta de envio de um usuário. */
export async function removerContaDeEnvio(sql: Sql, usuario: string, loja: number): Promise<void> {
  await ensureEmailEnvioSchema(sql);
  await sql`DELETE FROM public.email_envio WHERE usuario = ${usuario} AND loja = ${loja}`;
}

/**
 * Conta de envio pronta para o transporte SMTP.
 *
 * Devolve `null` quando o usuário não tem conta, quando ela está inativa ou
 * quando a senha guardada não pode ser lida (chave trocada).
 */
export async function contaSmtpDoUsuario(
  sql: Sql,
  usuario: string,
  loja: number,
): Promise<ContaSmtp | null> {
  await ensureEmailEnvioSchema(sql);
  const rows = await sql`
    SELECT email, senha, host, porta, secure, remetente, ativo
      FROM public.email_envio
     WHERE usuario = ${usuario} AND loja = ${loja}
     LIMIT 1`;
  const row = rows[0];
  if (!row || row.ativo === false) return null;
  try {
    const pass = decryptSecret(String(row.senha));
    if (!pass) return null;
    return {
      host: String(row.host ?? SMTP_PADRAO_HOST),
      port: Number(row.porta ?? SMTP_PADRAO_PORT),
      secure: row.secure !== false,
      user: String(row.email),
      pass,
      from: row.remetente ? String(row.remetente) : String(row.email),
    };
  } catch (error) {
    console.error('Senha do e-mail de envio ilegível:', error);
    return null;
  }
}
