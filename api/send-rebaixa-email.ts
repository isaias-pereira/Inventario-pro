/**
 * Envio da planilha de rebaixa por e-mail.
 *
 * O navegador (Chromium no Android) recusa anexar `.ods`/`.xlsx` na folha de
 * compartilhamento, então o arquivo é gerado no cliente e enviado ao servidor
 * em base64: o servidor anexa a planilha real em `.ods` (com fórmulas e cores) e
 * despacha pelo provedor configurado nas variáveis de ambiente.
 *
 * Ações (POST):
 * - `config`: devolve `{ enabled, provider, defaultTo }` — o cliente usa isso
 *   para avisar quando o envio está indisponível e preencher o destinatário;
 * - `send`: envia a planilha.
 *
 * Restrito a administradores (`role === 'admin'`).
 */

import { authenticate } from './_lib/auth.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { mailerConfig, sendMail, validateRecipients } from './_lib/mailer.js';

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

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    if (payload.role !== 'admin') {
      sendJson(res, { error: 'Apenas administradores podem enviar a planilha por e-mail' }, 403);
      return;
    }

    const body = await readJsonBody<Record<string, unknown>>(req);
    const action = body.action;
    const config = mailerConfig();

    // Configuração: o cliente usa para saber se o envio está disponível.
    if (action === 'config') {
      sendJson(res, {
        enabled: Boolean(config.provider),
        provider: config.provider,
        defaultTo: config.defaultTo,
      });
      return;
    }

    if (action !== 'send') {
      sendJson(res, { error: 'Ação inválida' }, 400);
      return;
    }

    if (!config.provider) {
      sendJson(res, { error: 'O envio de e-mail não está configurado no servidor' }, 503);
      return;
    }

    // Destinatário: usa o informado ou, na falta, o padrão do servidor.
    const rawTo = typeof body.to === 'string' && body.to.trim()
      ? body.to
      : (config.defaultTo ?? '');
    const recipients = validateRecipients(rawTo);
    if (!recipients) {
      sendJson(res, { error: 'Destinatário inválido' }, 400);
      return;
    }
    const to = recipients.join(', ');

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
      subject,
      text,
      attachment: {
        filename,
        contentType: filename.toLowerCase().endsWith('.csv') ? CSV_MIME : ODS_MIME,
        content: new Uint8Array(content),
      },
    });

    sendJson(res, { ok: true, to, filename, itens });
  } catch (error) {
    console.error('Send rebaixa email error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    sendJson(res, { error: message }, 500);
  }
};

export default handler;
