/**
 * Envio de e-mail pela Serverless Function.
 *
 * As credenciais ficam só no servidor (variáveis de ambiente da Vercel).
 * São aceitos dois provedores, escolhidos pela configuração:
 *
 * - **Resend** (API HTTP): defina `RESEND_API_KEY` e `REBAIXA_EMAIL_FROM`
 *   (o remetente precisa estar num domínio verificado);
 * - **SMTP** genérico: defina `SMTP_HOST` (e `SMTP_USER`/`SMTP_PASS`,
 *   `SMTP_PORT`, `SMTP_SECURE`).
 *
 * Em ambos os casos, `REBAIXA_EMAIL_TO` define o destinatário padrão e
 * `REBAIXA_EMAIL_COPY` define quem recebe cópia (Cc) de todos os envios.
 */

import { createTransport } from 'nodemailer';

export type MailProvider = 'resend' | 'smtp';

/**
 * Cópia fixa de todas as rebaixas.
 *
 * O encarregado usa esse endereço para guardar uma cópia de cada planilha
 * enviada (no Thunderbird). É o padrão quando `REBAIXA_EMAIL_COPY` não existe.
 */
export const DEFAULT_COPY_TO = 'isaiassilva@comper.com.br';

export interface MailConfig {
  /** Provedor configurado; `null` quando o envio está indisponível. */
  provider: MailProvider | null;
  /** Remetente padrão (`REBAIXA_EMAIL_FROM`). */
  from: string | null;
  /** Destinatário padrão (`REBAIXA_EMAIL_TO`). */
  defaultTo: string | null;
  /** Cópia em Cc de todos os envios (`REBAIXA_EMAIL_COPY`). */
  copyTo?: string | null;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

export interface MailMessage {
  /** Um ou mais destinatários separados por vírgula. */
  to: string;
  /** Cópia em Cc (um ou mais separados por vírgula). */
  cc?: string;
  subject: string;
  text: string;
  attachment?: MailAttachment;
}

export type MailEnv = Record<string, string | undefined>;

/** Lê a configuração de e-mail do ambiente. */
export function mailerConfig(env: MailEnv = process.env): MailConfig {
  const resendKey = (env.RESEND_API_KEY ?? '').trim();
  const smtpHost = (env.SMTP_HOST ?? '').trim();
  const from = (env.REBAIXA_EMAIL_FROM ?? env.SMTP_FROM ?? '').trim() || null;
  const defaultTo = (env.REBAIXA_EMAIL_TO ?? '').trim() || null;
  const copyTo = (env.REBAIXA_EMAIL_COPY ?? '').trim() || DEFAULT_COPY_TO;

  if (resendKey) return { provider: 'resend', from, defaultTo, copyTo };
  if (smtpHost) return { provider: 'smtp', from, defaultTo, copyTo };
  return { provider: null, from, defaultTo, copyTo };
}

/**
 * Valida e normaliza os destinatários.
 * Aceita `nome@dominio.com`, `Nome <nome@dominio.com>` e listas separadas por
 * vírgula ou ponto e vírgula. Devolve `null` quando algo está inválido.
 */
export function validateRecipients(value: unknown): string[] | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parts = raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const email = (part.match(/<([^>]+)>/)?.[1] ?? part).trim();
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return null;
  }
  return parts;
}

/** Extrai o endereço puro de `nome@dominio.com` ou `Nome <nome@dominio.com>`. */
export function addressOf(value: string): string {
  return (value.match(/<([^>]+)>/)?.[1] ?? value).trim().toLowerCase();
}

/**
 * Endereços de cópia que ainda não estão na lista de destinatários.
 * Devolve `null` quando não sobra ninguém para receber a cópia.
 */
export function copyNotInTo(copy: string | null | undefined, recipients: string[]): string | null {
  if (!copy) return null;
  const seen = new Set(recipients.map(addressOf));
  const unique: string[] = [];
  for (const part of copy.split(/[,;]/).map((item) => item.trim()).filter(Boolean)) {
    const address = addressOf(part);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    unique.push(part);
  }
  return unique.length ? unique.join(', ') : null;
}

/** Monta o corpo da requisição da Resend (com o anexo em base64). */
export function buildResendPayload(message: MailMessage, config: MailConfig): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    from: config.from ?? '',
    to: message.to
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean),
    subject: message.subject,
    text: message.text,
  };
  if (message.cc) {
    payload.cc = message.cc
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (message.attachment) {
    payload.attachments = [
      {
        filename: message.attachment.filename,
        content: Buffer.from(message.attachment.content).toString('base64'),
      },
    ];
  }
  return payload;
}

/** Envia pelo Resend (API HTTP — não precisa de dependência extra). */
export async function sendViaResend(
  message: MailMessage,
  config: MailConfig,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | undefined = process.env.RESEND_API_KEY,
): Promise<void> {
  if (!apiKey || !apiKey.trim()) throw new Error('RESEND_API_KEY não configurado');
  if (!config.from) throw new Error('REBAIXA_EMAIL_FROM não configurado');

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildResendPayload(message, config)),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw new Error(
      `O provedor de e-mail recusou o envio (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    );
  }
}

/** Envia por SMTP genérico (nodemailer). */
export async function sendViaSmtp(message: MailMessage, config: MailConfig): Promise<void> {
  const host = (process.env.SMTP_HOST ?? '').trim();
  if (!host) throw new Error('SMTP_HOST não configurado');

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    (process.env.SMTP_SECURE ?? '').trim().toLowerCase() === 'true' || port === 465;
  const user = (process.env.SMTP_USER ?? '').trim() || undefined;
  const pass = process.env.SMTP_PASS || undefined;
  const from = config.from ?? user;
  if (!from) throw new Error('REBAIXA_EMAIL_FROM não configurado');

  const transporter = createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    // Prazos curtos: se o servidor de e-mail não responder, a Function falha
    // com uma mensagem clara em vez de ficar pendurada.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  await transporter.sendMail({
    from,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    text: message.text,
    attachments: message.attachment
      ? [
          {
            filename: message.attachment.filename,
            content: Buffer.from(message.attachment.content),
            contentType: message.attachment.contentType,
          },
        ]
      : undefined,
  });
}

/** Envia a mensagem usando o provedor configurado no servidor. */
export async function sendMail(message: MailMessage): Promise<void> {
  const config = mailerConfig();
  if (!config.provider) {
    throw new Error('O envio de e-mail não está configurado no servidor (RESEND_API_KEY ou SMTP_HOST)');
  }
  if (config.provider === 'resend') {
    await sendViaResend(message, config);
    return;
  }
  await sendViaSmtp(message, config);
}
