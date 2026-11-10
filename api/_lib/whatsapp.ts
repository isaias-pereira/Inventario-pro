/**
 * Integração com a API oficial de mensagens do WhatsApp (Meta Cloud API).
 *
 * Tudo roda no servidor (Serverless Functions da Vercel): o token nunca chega
 * ao navegador. A mensagem é enviada por **template aprovado** porque os
 * alertas são iniciados pelo negócio (fora da janela de 24h de conversa).
 *
 * Variáveis de ambiente (só na Vercel):
 * - `WHATSAPP_TOKEN` (ou `WHATSAPP_ACCESS_TOKEN`): token permanente do System User;
 * - `WHATSAPP_PHONE_NUMBER_ID` (ou `WHATSAPP_PHONE_ID`): ID do número no app Meta;
 * - `WHATSAPP_RECIPIENTS`: números separados por vírgula (ex.: `5511999999999`);
 * - `WHATSAPP_TEMPLATE`: nome do template aprovado (padrão `alerta_validade_sgs`);
 * - `WHATSAPP_TEMPLATE_LANG`: idioma do template (padrão `pt_BR`);
 * - `WHATSAPP_API_VERSION`: versão do Graph API (padrão `v23.0`);
 * - `WHATSAPP_ALERT_DAYS`: dias de antecedência do alerta (padrão 4);
 * - `WHATSAPP_MAX_ITEMS`: máximo de produtos na lista da mensagem (padrão 30).
 *
 * Sem as credenciais o app continua funcionando: o endpoint responde 503 e a
 * tela da Validade avisa que a integração não está configurada.
 */

export type WhatsappEnv = Record<string, string | undefined>;

export interface WhatsappConfig {
  /** `true` só quando token, número e pelo menos um destinatário existem. */
  enabled: boolean;
  token: string | null;
  phoneNumberId: string | null;
  recipients: string[];
  templateName: string;
  templateLang: string;
  apiVersion: string;
  alertDays: number;
  maxItems: number;
}

export const DEFAULT_TEMPLATE = 'alerta_validade_sgs';
export const DEFAULT_TEMPLATE_LANG = 'pt_BR';
export const DEFAULT_API_VERSION = 'v23.0';
export const DEFAULT_ALERT_DAYS = 4;
export const DEFAULT_MAX_ITEMS = 30;

/**
 * Limite de caracteres de um parâmetro de template.
 *
 * A Meta recusa parâmetros com mais de 1024 caracteres; 900 deixa folga para
 * o sufixo "e mais N produtos" sem estourar o limite.
 */
export const MAX_PARAM_LENGTH = 900;

/** Máximo do parâmetro de resumo (bem menor que a lista). */
const MAX_SUMMARY_LENGTH = 300;

const SAO_PAULO_TZ = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.trunc(number);
  if (rounded < min) return fallback;
  return Math.min(rounded, max);
}

/**
 * Normaliza um telefone para o formato que a Meta espera: só dígitos, com
 * código do país. Números brasileiros com 10/11 dígitos (DDD + número)
 * recebem o `55` automaticamente.
 */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let digits = String(value).replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/**
 * Separa a lista de `WHATSAPP_RECIPIENTS`, normaliza e remove repetidos.
 *
 * O separador oficial é vírgula (ou ponto e vírgula / quebra de linha). Cada
 * trecho pode vir mascarado (`+55 (11) 99999-9999`); se o trecho inteiro não
 * formar um número, ele é quebrado por espaços — assim uma lista separada só
 * por espaço também funciona.
 */
export function parseRecipients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupe(value.map(normalizePhone));
  }
  if (typeof value !== 'string') return [];

  const found: Array<string | null> = [];
  for (const chunk of value.split(/[,;\r\n]+/)) {
    const whole = normalizePhone(chunk);
    if (whole) {
      found.push(whole);
      continue;
    }
    found.push(...chunk.split(/\s+/).map(normalizePhone));
  }
  return dedupe(found);
}

function dedupe(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** Mostra só o começo e o fim do número (para a tela e os logs). */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  const start = phone.slice(0, 4);
  const end = phone.slice(-4);
  return `${start}${'*'.repeat(Math.max(0, phone.length - 8))}${end}`;
}

/** Lê a configuração da integração do ambiente. */
export function whatsappConfig(env: WhatsappEnv = process.env): WhatsappConfig {
  const token = firstNonEmpty(env.WHATSAPP_TOKEN, env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = firstNonEmpty(env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_PHONE_ID);
  const recipients = parseRecipients(env.WHATSAPP_RECIPIENTS);
  const templateName = firstNonEmpty(env.WHATSAPP_TEMPLATE) ?? DEFAULT_TEMPLATE;
  const templateLang = firstNonEmpty(env.WHATSAPP_TEMPLATE_LANG) ?? DEFAULT_TEMPLATE_LANG;
  const rawVersion = firstNonEmpty(env.WHATSAPP_API_VERSION) ?? DEFAULT_API_VERSION;
  const apiVersion = rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`;

  return {
    enabled: Boolean(token && phoneNumberId && recipients.length > 0),
    token,
    phoneNumberId,
    recipients,
    templateName,
    templateLang,
    apiVersion,
    alertDays: positiveInt(env.WHATSAPP_ALERT_DAYS, DEFAULT_ALERT_DAYS, 0, 30),
    maxItems: positiveInt(env.WHATSAPP_MAX_ITEMS, DEFAULT_MAX_ITEMS, 1, 100),
  };
}

// ── Datas no fuso de Brasília ──────────────────────────────────────────
// A Vercel roda em UTC: o dia e a hora precisam ser calculados em
// America/Sao_Paulo para o alerta não "virar o dia" mais cedo.

export interface SaoPauloParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

export function saoPauloParts(date: Date = new Date()): SaoPauloParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Alguns ICU devolvem "24" para meia-noite.
    hour: read('hour') % 24,
  };
}

/** Dia civil em Brasília como `YYYY-MM-DD` (usado na idempotência). */
export function saoPauloDay(date: Date = new Date()): string {
  const { year, month, day } = saoPauloParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function saoPauloDayNumber(date: Date): number {
  const { year, month, day } = saoPauloParts(date);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** Diferença em dias de calendário (Brasília) entre a validade e hoje. */
export function daysUntilSaoPaulo(validade: Date | string, now: Date = new Date()): number | null {
  const target = validade instanceof Date ? validade : new Date(validade);
  if (Number.isNaN(target.getTime())) return null;
  return saoPauloDayNumber(target) - saoPauloDayNumber(now);
}

/** Data `dd/mm/aaaa` no fuso de Brasília. */
export function formatDateSaoPaulo(validade: Date | string): string {
  const target = validade instanceof Date ? validade : new Date(validade);
  if (Number.isNaN(target.getTime())) return '—';
  const { year, month, day } = saoPauloParts(target);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

// ── Resumo e lista ─────────────────────────────────────────────────────

export interface ValidadeSourceRow {
  descricao?: unknown;
  quantidade?: unknown;
  validade?: unknown;
  status?: unknown;
  motivo?: unknown;
}

export type DigestStatus = 'vencido' | 'hoje' | 'proximo';

export interface DigestItem {
  descricao: string;
  quantidade: number;
  validade: string;
  daysUntil: number;
  status: DigestStatus;
}

export interface ValidadeDigest {
  total: number;
  vencidos: number;
  hoje: number;
  proximos: number;
  alertDays: number;
  summary: string;
  list: string;
  items: DigestItem[];
  /** Quantos produtos ficaram de fora da lista (por espaço ou limite). */
  truncated: number;
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function statusText(item: DigestItem): string {
  if (item.status === 'vencido') return 'vencido';
  if (item.status === 'hoje') return 'vence hoje';
  return `vence em ${item.daysUntil}d`;
}

/**
 * Monta o resumo e a lista enviados no template.
 *
 * Regras:
 * - só entram itens ativos (`status !== false`), sem motivo (KG) e com
 *   validade até `alertDays` dias à frente — inclusive os já vencidos;
 * - a lista é uma única linha separada por ` • `, porque a Meta recusa
 *   parâmetros de template com quebras de linha;
 * - a lista respeita `maxItems` e o limite de caracteres do parâmetro.
 */
export function buildValidadeDigest(
  rows: ValidadeSourceRow[],
  alertDays: number = DEFAULT_ALERT_DAYS,
  now: Date = new Date(),
  maxItems: number = DEFAULT_MAX_ITEMS,
): ValidadeDigest {
  const dias = Number.isFinite(alertDays)
    ? Math.max(0, Math.trunc(alertDays))
    : DEFAULT_ALERT_DAYS;
  const limiteItens = Number.isFinite(maxItems)
    ? Math.max(1, Math.trunc(maxItems))
    : DEFAULT_MAX_ITEMS;
  const items: DigestItem[] = [];

  for (const row of rows) {
    if (row.status === false) continue;
    if (cleanText(row.motivo)) continue;

    const validade = row.validade instanceof Date ? row.validade : new Date(String(row.validade ?? ''));
    if (Number.isNaN(validade.getTime())) continue;

    const daysUntil = daysUntilSaoPaulo(validade, now);
    if (daysUntil === null || daysUntil > dias) continue;

    const quantidade = Number(row.quantidade);
    items.push({
      descricao: cleanText(row.descricao) || 'Produto sem descrição',
      quantidade: Number.isFinite(quantidade) ? Math.max(0, Math.round(quantidade)) : 0,
      validade: validade.toISOString(),
      daysUntil,
      status: daysUntil < 0 ? 'vencido' : daysUntil === 0 ? 'hoje' : 'proximo',
    });
  }

  items.sort((a, b) => a.daysUntil - b.daysUntil || a.descricao.localeCompare(b.descricao, 'pt-BR'));

  const vencidos = items.filter((item) => item.status === 'vencido').length;
  const hoje = items.filter((item) => item.status === 'hoje').length;
  const proximos = items.filter((item) => item.status === 'proximo').length;

  const parts: string[] = [];
  if (vencidos > 0) parts.push(plural(vencidos, 'vencido', 'vencidos'));
  if (hoje > 0) parts.push(plural(hoje, 'vence hoje', 'vencem hoje'));
  if (proximos > 0) {
    parts.push(
      `${plural(proximos, 'vence', 'vencem')} em até ${dias} ${dias === 1 ? 'dia' : 'dias'}`,
    );
  }

  const summary = items.length === 0
    ? `Nenhum produto vence nos próximos ${dias} ${dias === 1 ? 'dia' : 'dias'}.`
    : `${parts.join(' · ')} — ${plural(items.length, 'produto', 'produtos')} no total.`;

  let list = '';
  let included = 0;
  for (const item of items) {
    if (included >= limiteItens) break;
    const text = `${item.descricao} — ${item.quantidade} un — ${statusText(item)} (${formatDateSaoPaulo(item.validade)})`;
    const chunk = `${included > 0 ? ' • ' : ''}${text}`;
    if (list.length + chunk.length > MAX_PARAM_LENGTH) break;
    list += chunk;
    included += 1;
  }

  const restantes = items.length - included;
  if (restantes > 0) {
    const suffix = ` • e mais ${plural(restantes, 'produto', 'produtos')}`;
    if (list.length + suffix.length <= MAX_PARAM_LENGTH) list += suffix;
  }

  return {
    total: items.length,
    vencidos,
    hoje,
    proximos,
    alertDays: dias,
    summary: sanitizeParam(summary, MAX_SUMMARY_LENGTH),
    list: sanitizeParam(list, MAX_PARAM_LENGTH),
    items,
    truncated: restantes,
  };
}

/**
 * Garante o formato aceito pela Meta: uma linha só, sem tabs e sem espaços
 * repetidos. Corta com reticências quando passa do limite.
 */
export function sanitizeParam(value: string, maxLength = MAX_PARAM_LENGTH): string {
  const clean = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

// ── Envio pela Meta ────────────────────────────────────────────────────

export interface TemplateMessageInput {
  to: string;
  summary: string;
  list: string;
}

export interface WhatsappTemplatePayload {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components: Array<{
      type: 'body';
      parameters: Array<{ type: 'text'; text: string }>;
    }>;
  };
}

/** Corpo exato do POST para `/{version}/{phone-number-id}/messages`. */
export function buildTemplatePayload(
  input: TemplateMessageInput,
  config: Pick<WhatsappConfig, 'templateName' | 'templateLang'>,
): WhatsappTemplatePayload {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'template',
    template: {
      name: config.templateName,
      language: { code: config.templateLang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: sanitizeParam(input.summary, MAX_SUMMARY_LENGTH) },
            { type: 'text', text: sanitizeParam(input.list, MAX_PARAM_LENGTH) },
          ],
        },
      ],
    },
  };
}

export class WhatsappError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'WhatsappError';
    this.status = status;
  }
}

export interface SendResult {
  to: string;
  ok: boolean;
  messageId?: string;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 15000;

/** Envia o template para um número. Lança `WhatsappError` em caso de falha. */
export async function sendWhatsappTemplate(
  input: TemplateMessageInput,
  config: WhatsappConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  if (!config.token || !config.phoneNumberId) {
    throw new WhatsappError('Integração do WhatsApp não configurada no servidor', 503);
  }

  const url = `https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTemplatePayload(input, config)),
      signal: controller?.signal,
    });

    const raw = await response.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = raw ? JSON.parse(raw) as Record<string, unknown> : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const error = data?.error as { message?: unknown; error_user_msg?: unknown } | undefined;
      const message = cleanText(error?.error_user_msg ?? error?.message)
        || `A Meta recusou a mensagem (HTTP ${response.status})`;
      throw new WhatsappError(message, 502);
    }

    const messages = data?.messages as Array<{ id?: unknown }> | undefined;
    const messageId = messages?.[0]?.id;
    return {
      to: input.to,
      ok: true,
      messageId: typeof messageId === 'string' ? messageId : undefined,
    };
  } catch (error) {
    if (error instanceof WhatsappError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new WhatsappError(
      aborted ? 'Tempo esgotado ao falar com a Meta' : 'Falha de rede ao falar com a Meta',
      aborted ? 504 : 502,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Envia para todos os destinatários. Uma falha em um número não impede os
 * demais; o resultado traz o motivo de cada erro.
 */
export async function sendWhatsappToRecipients(
  recipients: string[],
  digest: Pick<ValidadeDigest, 'summary' | 'list'>,
  config: WhatsappConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ results: SendResult[]; enviados: number; falhas: number }> {
  const results: SendResult[] = [];
  for (const to of recipients) {
    try {
      results.push(await sendWhatsappTemplate(
        { to, summary: digest.summary, list: digest.list },
        config,
        fetchImpl,
      ));
    } catch (error) {
      results.push({
        to,
        ok: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }
  const enviados = results.filter((result) => result.ok).length;
  return { results, enviados, falhas: results.length - enviados };
}

/**
 * Descobre o slot (`manha`/`tarde`) pelo cabeçalho `x-vercel-cron-schedule`.
 *
 * A Vercel agenda em UTC; o horário é convertido para Brasília (UTC-3). Sem o
 * cabeçalho, cai na hora atual de Brasília.
 */
export function slotFromSchedule(schedule: unknown, spHour: number): 'manha' | 'tarde' {
  if (typeof schedule === 'string') {
    const match = /^\S+\s+(\d{1,2})\s+/.exec(schedule.trim());
    if (match) {
      const hourUtc = Number(match[1]);
      if (Number.isFinite(hourUtc) && hourUtc >= 0 && hourUtc <= 23) {
        const hourSp = (hourUtc + 21) % 24;
        return hourSp < 12 ? 'manha' : 'tarde';
      }
    }
  }
  return spHour < 12 ? 'manha' : 'tarde';
}
