/**
 * Envio da planilha de rebaixa por e-mail.
 *
 * O navegador (Chromium no Android) recusa anexar `.ods`/`.xlsx` na folha de
 * compartilhamento, então o arquivo é gerado no cliente e enviado ao servidor
 * em base64: o servidor anexa a planilha real em `.ods` (com fórmulas e cores) e
 * despacha pelo provedor configurado nas variáveis de ambiente.
 *
 * Cada encarregado tem a **própria** conta no servidor padrão de e-mail
 * (`email_envio`): quando ela existe, a rebaixa sai da caixa de quem montou a
 * lista. Sem conta cadastrada, vale a configuração do servidor (Resend ou SMTP
 * das env vars).
 *
 * Ações (POST):
 * - `config`: devolve `{ enabled, provider, defaultTo, remetente, contaPropria }`
 *   — o cliente usa isso para avisar quando o envio está indisponível e
 *   mostrar de qual caixa a mensagem vai sair;
 * - `send`: envia a planilha.
 *
 * Restrito a administradores e encarregados (`role === 'admin' | 'encarregado'`).
 */

import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { copyNotInTo, mailerConfig, sendMail, validateRecipients } from './_lib/mailer.js';
import { contaSmtpDoUsuario } from './_lib/email-envio.js';
import { createSql, type Sql } from './_lib/db.js';
import { ensureLojaSchema, resolveLoja } from './_lib/loja.js';

/** Papéis que podem disparar a planilha por e-mail. */
export const EMAIL_ROLES = ['admin', 'encarregado'] as const;

export function canSendRebaixaEmail(role: unknown): boolean {
  return typeof role === 'string' && (EMAIL_ROLES as readonly string[]).includes(role);
}

/** MIME oficial do OpenDocument Spreadsheet. */
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';
const CSV_MIME = 'text/csv';

/** Extensões aceitas como anexo de planilha. */
const ALLOWED_EXTENSIONS = ['.ods', '.csv'];

/**
 * Tamanho máximo do anexo decodificado.
 * O corpo da Serverless Function da Vercel aceita 4,5 MB; em base64 o anexo
 * cresce ~33%, então 2 MB de planilha cabem folgadamente no limite.
 */
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** Limite do assunto e do corpo da mensagem. */
const MAX_SUBJECT_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;

/** Assunto padrão: `Solicitação de rebaixa / perecíveis — DD/MM/AAAA`. */
export function defaultSubject(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `Solicitação de rebaixa / perecíveis — ${day}/${month}/${date.getFullYear()}`;
}

/**
 * Valida o nome do arquivo: sem caminho, só caracteres seguros e com uma das
 * extensões de planilha permitidas.
 */
export function attachmentName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > 120) return null;
  // Sem barras (nenhum caminho), sem aspas e sem caracteres de controle.
  if (!/^[\w.\- ]+$/.test(name)) return null;
  const lower = name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension))) return null;
  return name;
}

/**
 * Decodifica o anexo em base64. Devolve `null` quando o conteúdo não é
 * base64 válido ou ultrapassa o limite.
 */
export function decodeAttachment(value: unknown, maxBytes = MAX_ATTACHMENT_BYTES): Buffer | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  // 4 caracteres de base64 → 3 bytes: recusa payloads acima do limite.
  if (raw.length > Math.ceil((maxBytes / 3) + 1) * 4) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const content = Buffer.from(raw, 'base64');
  if (!content.length || content.length > maxBytes) return null;
  return content;
}

/** Número de produtos informado pelo cliente (só para a resposta e o texto padrão). */
function productCount(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.trunc(number);
}

/**
 * E-mail padrão da loja (`email_padrao.padrao`).
 *
 * Cada loja tem o seu destinatário padrão; sem cadastro, vale o
 * `REBAIXA_EMAIL_TO` do servidor.
 */
async function defaultEmailDaLoja(sql: Sql, loja: number): Promise<string | null> {
  try {
    const rows = await sql`
      SELECT email
        FROM public.email_padrao
       WHERE loja = ${loja} AND padrao = TRUE AND ativo = TRUE
       LIMIT 1`;
    const email = rows[0]?.email ? String(rows[0].email).trim() : '';
    return email || null;
  } catch (error) {
    console.error('E-mail padrão da loja:', error);
    return null;
  }
}

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    if (!canSendRebaixaEmail(payload.role)) {
      sendJson(res, { error: 'Apenas admin e encarregado podem enviar a planilha por e-mail' }, 403);
      return;
    }

    const body = await readJsonBody<Record<string, unknown>>(req);
    const action = body.action;
    const config = mailerConfig();
    const sql = createSql();
    await ensureLojaSchema(sql);
    // O destinatário padrão é o da loja do usuário.
    const loja = await resolveLoja(sql, payload);
    const defaultDaLoja = await defaultEmailDaLoja(sql, loja);

    // Conta de envio do próprio usuário (prioridade sobre o servidor).
    const conta = await contaSmtpDoUsuario(sql, String(payload.sub ?? ''), loja);
    const remetente = conta?.from ?? config.from ?? null;

    // Configuração: o cliente usa para saber se o envio está disponível.
    if (action === 'config') {
      sendJson(res, {
        enabled: Boolean(conta) || Boolean(config.provider),
        provider: conta ? 'smtp' : config.provider,
        defaultTo: defaultDaLoja ?? config.defaultTo,
        copyTo: config.copyTo ?? null,
        remetente,
        contaPropria: Boolean(conta),
        loja,
      });
      return;
    }

    if (action !== 'send') {
      sendJson(res, { error: 'Ação inválida' }, 400);
      return;
    }

    if (!conta && !config.provider) {
      sendJson(res, { error: 'O envio de e-mail não está configurado no servidor' }, 503);
      return;
    }

    // Destinatário: usa o informado ou, na falta, o padrão da loja e depois
    // o padrão do servidor.
    const copyTo = config.copyTo ?? null;
    const rawTo = typeof body.to === 'string' && body.to.trim()
      ? body.to
      : (defaultDaLoja ?? config.defaultTo ?? copyTo ?? '');
    const recipients = validateRecipients(rawTo);
    if (!recipients) {
      sendJson(res, { error: 'Destinatário inválido' }, 400);
      return;
    }
    const to = recipients.join(', ');
    // Cópia fixa: quem configurou recebe uma cópia de todas as rebaixas.
    const cc = copyNotInTo(copyTo, recipients);

    const filename = attachmentName(body.filename);
    if (!filename) {
      sendJson(res, { error: 'Arquivo inválido: use uma planilha .ods ou .csv' }, 400);
      return;
    }

    const content = decodeAttachment(body.contentBase64);
    if (!content) {
      sendJson(res, { error: 'Conteúdo do anexo inválido' }, 400);
      return;
    }

    const subject = (typeof body.subject === 'string' ? body.subject : '').trim()
      || defaultSubject();
    if (subject.length > MAX_SUBJECT_LENGTH) {
      sendJson(res, { error: 'Assunto muito longo' }, 400);
      return;
    }

    const itens = productCount(body.itens);
    const text = (typeof body.text === 'string' ? body.text : '').trim()
      || `Segue a planilha de rebaixa com ${itens} produto(s)`;
    if (text.length > MAX_TEXT_LENGTH) {
      sendJson(res, { error: 'Mensagem muito longa' }, 400);
      return;
    }

    await sendMail({
      to,
      cc: cc ?? undefined,
      subject,
      text,
      attachment: {
        filename,
        contentType: filename.toLowerCase().endsWith('.csv') ? CSV_MIME : ODS_MIME,
        content: new Uint8Array(content),
      },
    }, conta);

    sendJson(res, {
      ok: true,
      to,
      cc: cc ?? null,
      filename,
      itens,
      remetente: remetente ?? null,
      contaPropria: Boolean(conta),
    });
  } catch (error) {
    console.error('Send rebaixa email error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    sendJson(res, { error: message }, 500);
  }
};

export default handler;
