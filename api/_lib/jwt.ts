import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string;
  role: string;
  exp: number;
  iat?: number;
}

/**
 * Base64 "clássico" sem padding (igual ao usado antes nas Edge Functions),
 * para que o navegador continue decodificando o payload com atob().
 */
function base64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/=+$/g, '');
}

/** Base64url sem padding (usado apenas na assinatura). */
function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = base64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  try {
    if (!secret) return null;
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8')) as JwtPayload;
    if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
