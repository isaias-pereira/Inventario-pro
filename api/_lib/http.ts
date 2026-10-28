/**
 * Tipos e utilitários HTTP compartilhados pelas Serverless Functions da Vercel.
 * Não há dependência de runtime específico: as funções recebem (req, res) do Node.
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
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
  const body = req.body;
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
