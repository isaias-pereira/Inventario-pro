/**
 * Tipos e utilitários HTTP compartilhados pelas Serverless Functions da Vercel.
 * Não há dependência de runtime específico: as funções recebem (req, res) do Node.
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://inventario-pro-one.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true', // necessário para cookies
};

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  /** Cookies parseados (preenchido por `parseCookies`). */
  cookies?: Record<string, string>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(payload: unknown): void;
  end(payload?: unknown): void;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

export function sendJson(res: ApiResponse, payload: unknown, status = 200): void {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(corsHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}

export function sendOptions(res: ApiResponse): void {
  for (const [key, value] of Object.entries(corsHeaders)) res.setHeader(key, value);
  res.status(204).end();
}

/** Lê o corpo JSON da requisição (a Vercel já o parseia quando content-type é JSON). */
export async function readJsonBody<T = Record<string, unknown>>(req: ApiRequest): Promise<T> {
  let body: unknown;
  try {
    // O getter `req.body` do runtime da Vercel lança se o corpo não for JSON válido.
    body = req.body;
  } catch {
    return {} as T;
  }
  if (body == null || body === '') return {} as T;
  if (typeof body === 'string') {
    try { return JSON.parse(body) as T; } catch { return {} as T; }
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString('utf8')) as T; } catch { return {} as T; }
  }
  return body as T;
}

/** Extrai o token do cabeçalho Authorization: Bearer <token>. */
export function bearerToken(req: ApiRequest): string | null {
  const raw = req.headers?.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(String(value).trim());
  return match ? match[1] : String(value).trim() || null;
}

/** Extrai o token do cookie `estoque_pro_token`. */
export function cookieToken(req: ApiRequest): string | null {
  return req.cookies?.['estoque_pro_token'] ?? null;
}

/** Obtém o token da requisição: prioriza cookie (HttpOnly), cai para Bearer. */
export function getToken(req: ApiRequest): string | null {
  return cookieToken(req) ?? bearerToken(req);
}

/** Parseia o header `Cookie` em objeto. */
export function parseCookies(req: ApiRequest): Record<string, string> {
  const raw = req.headers?.cookie;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return {};
  const cookies: Record<string, string> = {};
  for (const part of String(value).split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) cookies[name] = rest.join('=');
  }
  return cookies;
}

/** Define um cookie HttpOnly, Secure, SameSite=Lax no response. */
export function setAuthCookie(
  res: ApiResponse,
  token: string,
  options: { maxAge?: number; path?: string } = {}
): void {
  const maxAge = options.maxAge ?? 6 * 60 * 60; // 6h (igual SESSION_TTL_SECONDS)
  const path = options.path ?? '/';
  const cookie = `estoque_pro_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=${maxAge}`;
  res.setHeader('Set-Cookie', cookie);
}

/** Remove o cookie de autenticação (logout). */
export function clearAuthCookie(res: ApiResponse, path = '/'): void {
  const cookie = `estoque_pro_token=; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=0`;
  res.setHeader('Set-Cookie', cookie);
}

/** Bloqueia requisições que não sejam POST. */
export function requirePost(req: ApiRequest, res: ApiResponse): boolean {
  if (req.method === 'OPTIONS') {
    sendOptions(res);
    return false;
  }
  if (req.method && req.method !== 'POST') {
    sendJson(res, { error: 'Método não permitido' }, 405);
    return false;
  }
  return true;
}
