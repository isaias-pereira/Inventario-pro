/**
 * Logger sanitizado para Serverless Functions (Vercel).
 *
 * Remove automaticamente campos sensíveis de objetos antes de logar:
 * - authorization, cookie, set-cookie
 * - password, senha, token, secret, key, apiKey, api_key
 * - email, phone, telefone, celular, cpf, cnpj
 * - creditCard, cartao, cvv
 *
 * Uso:
 *   import { log } from './_lib/logger.js';
 *   log.info('Login attempt', { username, ip });
 *   log.error('DB error', { error: err.message, code: err.code });
 *
 * Níveis: debug < info < warn < error
 * Em produção, `debug` é silenciado (NODE_ENV=production).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const SENSITIVE_KEYS = [
  // Auth / secrets
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'senha',
  'token',
  'secret',
  'key',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'jwt',
  'bearer',
  // PII
  'email',
  'phone',
  'telefone',
  'celular',
  'cpf',
  'cnpj',
  // Financial
  'creditcard',
  'cartao',
  'cvv',
  'cvc',
  // File uploads
  'file',
  'base64',
  'attachment',
];

const isProd = process.env.NODE_ENV === 'production';

function sanitize(obj: unknown, depth = 0): Record<string, unknown> | unknown[] | unknown {
  if (depth > 5) return '[max-depth]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (SENSITIVE_KEYS.includes(lk) || SENSITIVE_KEYS.some((s) => lk.includes(s))) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = sanitize(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (level === 'debug' && isProd) return;

  const entry: LogEntry = {
    level,
    message,
    context: context ? (sanitize(context) as Record<string, unknown>) : undefined,
    timestamp: new Date().toISOString(),
  };

  // No Vercel, console.log/error vão para os logs da plataforma.
  // Mantemos formato JSON para facilitar parsing (Datadog, Axiom, etc.).
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};

/** Helper para logar erros com stack trace (já sanitizado). */
export function logError(err: unknown, context?: Record<string, unknown>): void {
  const ctx = { ...context };
  if (err instanceof Error) {
    ctx.error = { name: err.name, message: err.message, stack: err.stack };
  } else {
    ctx.error = String(err);
  }
  log.error('Error', ctx);
}