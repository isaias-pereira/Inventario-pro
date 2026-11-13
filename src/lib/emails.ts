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

/* ── Conta de envio do usuário ────────────────────────────────────────── */

/**
 * Conta de e-mail de envio do usuário.
 *
 * O e-mail cadastrado aqui é o **remetente** das rebaixas enviadas pelo
 * usuário (servidor padrão com usuário/senha próprios). A senha nunca volta
 * do servidor: a tela só sabe se ela está cadastrada (`temSenha`).
 */
export interface EmailEnvioConta {
  /** E-mail do usuário no servidor de envio. */
  email: string;
  /** Servidor usado no envio. */
  host: string;
  porta: number;
  secure: boolean;
  /** Remetente da mensagem (quando difere do e-mail da conta). */
  remetente: string | null;
  /** Conta desativada não é usada no envio. */
  ativo: boolean;
  /** `true` quando há senha guardada no servidor. */
  temSenha: boolean;
}

/** Conta de envio vista pelo admin (sem a senha). */
export interface EmailEnvioContaAdmin {
  usuario: string;
  email: string;
  host: string;
  porta: number;
  secure: boolean;
  remetente: string | null;
  ativo: boolean;
}

export interface MinhaContaResponse {
  conta: EmailEnvioConta;
  servidor: { host: string; porta: number; secure: boolean };
}

export interface ContaEnvioInput {
  email: string;
  /** Senha da caixa (obrigatória na primeira vez). */
  senha?: string;
  /** Remetente da mensagem (vazio = o próprio e-mail da conta). */
  remetente?: string;
  ativo?: boolean;
}

/** Lê a conta de envio do usuário logado. */
export async function fetchMinhaConta(): Promise<MinhaContaResponse> {
  const { data, error } = await invokeFunction<Partial<MinhaContaResponse>>('manage-emails', {
    body: { action: 'my_account' },
  });
  if (error) throw new Error(error.message);
  return {
    conta: {
      email: data?.conta?.email ?? '',
      host: data?.conta?.host ?? 'mail.comper.com.br',
      porta: data?.conta?.porta ?? 465,
      secure: data?.conta?.secure !== false,
      remetente: data?.conta?.remetente ?? null,
      ativo: data?.conta?.ativo !== false,
      temSenha: Boolean(data?.conta?.temSenha),
    },
    servidor: {
      host: data?.servidor?.host ?? 'mail.comper.com.br',
      porta: data?.servidor?.porta ?? 465,
      secure: data?.servidor?.secure !== false,
    },
  };
}

/** Grava a conta de envio do usuário logado. */
export async function salvarMinhaConta(input: ContaEnvioInput): Promise<void> {
  const { error } = await invokeFunction('manage-emails', {
    body: {
      action: 'save_account',
      email: input.email,
      senha: input.senha,
      remetente: input.remetente ?? '',
      ativo: input.ativo,
    },
  });
  if (error) throw new Error(error.message);
}

/** Contas de envio da loja (admin). */
export async function fetchContasDeEnvio(): Promise<EmailEnvioContaAdmin[]> {
  const { data, error } = await invokeFunction<{ contas?: EmailEnvioContaAdmin[] }>('manage-emails', {
    body: { action: 'list_accounts' },
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data?.contas) ? data.contas : [];
}

/** Edita a conta de envio de outro usuário (admin). */
export async function salvarContaDeUsuario(
  usuario: string,
  input: Partial<ContaEnvioInput>,
): Promise<void> {
  const { error } = await invokeFunction('manage-emails', {
    body: { action: 'update_account', usuario, ...input },
  });
  if (error) throw new Error(error.message);
}

/** Remove a conta de envio de outro usuário (admin). */
export async function removerContaDeUsuario(usuario: string): Promise<void> {
  const { error } = await invokeFunction('manage-emails', {
    body: { action: 'remove_account', usuario },
  });
  if (error) throw new Error(error.message);
}
