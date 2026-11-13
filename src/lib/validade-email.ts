/**
 * Envio da planilha de rebaixa por e-mail (pelo servidor).
 *
 * O Chromium recusa anexar `.ods`/`.xlsx` na folha de compartilhamento, então
 * a planilha é gerada no navegador e enviada ao backend em base64: o servidor
 * anexa o arquivo `.ods` de verdade e despacha pelo provedor configurado na Vercel.
 *
 * As credenciais do provedor nunca saem do servidor — o cliente só conhece o
 * remetente/destinatário padrão devolvido pela ação `config`.
 */

import { invokeFunction } from './api';

export interface EmailConfig {
  /** `true` quando o servidor tem um provedor de e-mail configurado. */
  enabled: boolean;
  /** Provedor em uso (`resend` | `smtp`) ou `null` quando não há nenhum. */
  provider: 'resend' | 'smtp' | null;
  /** Destinatário padrão configurado no servidor. */
  defaultTo: string | null;
  /** Endereço que recebe cópia (Cc) de todos os envios. */
  copyTo: string | null;
  /** Remetente da mensagem (conta do usuário ou padrão do servidor). */
  remetente: string | null;
  /** `true` quando o envio sai da caixa cadastrada pelo próprio usuário. */
  contaPropria: boolean;
}

export interface SendRebaixaEmailInput {
  /** Destinatário (um ou mais separados por vírgula). */
  to: string;
  subject: string;
  text: string;
  /** Nome do anexo (`.ods` ou `.csv`). */
  filename: string;
  /** Bytes da planilha. */
  content: Uint8Array;
  /** Quantidade de produtos da lista (apenas para o texto padrão). */
  itens: number;
}

export interface SendRebaixaEmailResult {
  ok: boolean;
  to: string;
  /** Cópia em Cc adicionada pelo servidor (quando difere dos destinatários). */
  cc: string | null;
  filename: string;
  itens: number;
  /** Remetente usado no envio. */
  remetente: string | null;
  /** `true` quando saiu da caixa cadastrada pelo próprio usuário. */
  contaPropria: boolean;
}

/**
 * Converte os bytes da planilha em base64 (o formato aceito pelo backend).
 * Trabalha em blocos para não estourar a pilha em listas grandes.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Lê a configuração de e-mail do servidor. */
export async function fetchEmailConfig(): Promise<EmailConfig> {
  const { data, error } = await invokeFunction<EmailConfig>('send-rebaixa-email', {
    body: { action: 'config' },
  });
  if (error) throw new Error(error.message);
  return {
    enabled: Boolean(data?.enabled),
    provider: data?.provider ?? null,
    defaultTo: data?.defaultTo ?? null,
    copyTo: data?.copyTo ?? null,
    remetente: data?.remetente ?? null,
    contaPropria: Boolean(data?.contaPropria),
  };
}

/**
 * Envia a planilha por e-mail. Lança um `Error` com a mensagem do servidor
 * quando o envio é recusado.
 */
export async function sendRebaixaEmail(
  input: SendRebaixaEmailInput,
): Promise<SendRebaixaEmailResult> {
  const { data, error } = await invokeFunction<SendRebaixaEmailResult>('send-rebaixa-email', {
    body: {
      action: 'send',
      to: input.to,
      subject: input.subject,
      text: input.text,
      filename: input.filename,
      contentBase64: bytesToBase64(input.content),
      itens: input.itens,
    },
  });
  if (error) throw new Error(error.message);
  return {
    ok: Boolean(data?.ok),
    to: data?.to ?? input.to,
    cc: data?.cc ?? null,
    filename: data?.filename ?? input.filename,
    itens: data?.itens ?? input.itens,
    remetente: data?.remetente ?? null,
    contaPropria: Boolean(data?.contaPropria),
  };
}
