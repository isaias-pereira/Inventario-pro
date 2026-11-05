/**
 * Cliente da lista de e-mails padrão das rebaixas (aba E-mail).
 *
 * Os e-mails cadastrados aqui viram atalhos no diálogo de envio da Rebaixa:
 * o marcado como "padrão" entra preenchido e o assunto/mensagem padrão salvos
 * viram o texto inicial da mensagem.
 */

import { invokeFunction } from './api';

export interface EmailPadrao {
  id: string;
  /** Nome que identifica o cadastro nos atalhos (ex.: "Comercial — Matriz"). */
  nome: string;
  email: string;
  /** E-mail padrão das rebaixas (apenas um pode ser). */
  padrao: boolean;
  /** Cadastro inativo não aparece nos atalhos. */
  ativo: boolean;
  created_by: string | null;
  created_at: string;
}

export interface EmailDefaults {
  /** Assunto padrão (aceita `{{data}}`). */
  assunto: string;
  /** Mensagem padrão (aceita `{{quantidade}}` e `{{produtos}}`). */
  mensagem: string;
}

export interface EmailListResponse {
  emails: EmailPadrao[];
  defaults: EmailDefaults;
}

export interface EmailInput {
  nome: string;
  email: string;
  padrao?: boolean;
}

const EMPTY_DEFAULTS: EmailDefaults = {
  assunto: 'Solicitação de rebaixa / perecíveis — {{data}}',
  mensagem: 'Segue a planilha de rebaixa com {{quantidade}} produto(s). Anexamos a planilha no formato .ods.',
};

/** Lê a lista de e-mails padrão e o assunto/mensagem padrão. */
export async function fetchEmails(): Promise<EmailListResponse> {
  const { data, error } = await invokeFunction<Partial<EmailListResponse>>('manage-emails', {
    body: { action: 'list' },
  });
  if (error) throw new Error(error.message);
  return {
    emails: Array.isArray(data?.emails) ? (data?.emails as EmailPadrao[]) : [],
    defaults: {
      assunto: data?.defaults?.assunto ?? EMPTY_DEFAULTS.assunto,
      mensagem: data?.defaults?.mensagem ?? EMPTY_DEFAULTS.mensagem,
    },
  };
}

/** Cadastra um e-mail padrão. */
export async function addEmail(input: EmailInput): Promise<void> {
  const { error } = await invokeFunction('manage-emails', {
    body: { action: 'add', nome: input.nome, email: input.email, padrao: input.padrao === true },
  });
  if (error) throw new Error(error.message);
}

/** Altera um cadastro (nome, e-mail, ativo ou padrão). */
export async function updateEmail(
  id: string,
  changes: Partial<EmailInput> & { ativo?: boolean },
): Promise<void> {
  const { error } = await invokeFunction('manage-emails', {
    body: { action: 'update', id, ...changes },
  });
  if (error) throw new Error(error.message);
}

/** Remove um cadastro. */
export async function removeEmail(id: string): Promise<void> {
  const { error } = await invokeFunction('manage-emails', {
    body: { action: 'remove', id },
  });
  if (error) throw new Error(error.message);
}

/** Marca um cadastro como e-mail padrão das rebaixas. */
export async function setDefaultEmail(id: string): Promise<void> {
  const { error } = await invokeFunction('manage-emails', {
    body: { action: 'setDefault', id },
  });
  if (error) throw new Error(error.message);
}

/** Salva o assunto e a mensagem padrão do envio. */
export async function saveEmailDefaults(defaults: EmailDefaults): Promise<void> {
  const { error } = await invokeFunction('manage-emails', {
    body: { action: 'setDefaults', assunto: defaults.assunto, mensagem: defaults.mensagem },
  });
  if (error) throw new Error(error.message);
}

export interface TemplateValues {
  /** Data de hoje no formato brasileiro. */
  data: string;
  /** Quantidade de produtos da lista. */
  quantidade: number;
  /** Resumo dos produtos (descrição e quantidade). */
  produtos?: string;
}

/**
 * Troca as variáveis do assunto/mensagem padrão pelos valores do envio:
 * `{{data}}`, `{{quantidade}}` e `{{produtos}}`.
 */
export function applyTemplate(text: string, values: TemplateValues): string {
  return text
    .replace(/\{\{\s*data\s*\}\}/gi, values.data)
    .replace(/\{\{\s*quantidade\s*\}\}/gi, String(values.quantidade))
    .replace(/\{\{\s*produtos\s*\}\}/gi, values.produtos ?? '');
}

/** E-mail marcado como padrão (o primeiro em caso de empate). */
export function defaultEmail(emails: EmailPadrao[]): EmailPadrao | null {
  return emails.find((email) => email.padrao && email.ativo) ?? null;
}

/** E-mails que aparecem como atalho no envio (ativos, padrão primeiro). */
export function activeEmails(emails: EmailPadrao[]): EmailPadrao[] {
  return emails.filter((email) => email.ativo);
}
