/**
 * Rate limiting simples para Serverless Functions (Vercel).
 *
 * Usa @vercel/kv quando disponível (produção) e cai para Map em memória
 * (desenvolvimento / preview sem KV). O Map não persiste entre invocações
 * frias, mas já impede brute-force dentro da mesma instância quente.
 *
 * Chave sugerida: `login:${ip}:${username}` ou `api:${ip}:${endpoint}`.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5; // 5 tentativas por janela

interface KvClient {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<void>;
  del: (key: string) => Promise<void>;
}

let kv: KvClient | null = null;
let kvResolved = false;

async function getKv(): Promise<KvClient | null> {
  if (kvResolved) return kv;
  kvResolved = true;

  // Sem as variáveis do KV o SDK lança na primeira operação (não no import):
  // checa antes para o fallback em memória assumir sem derrubar o login.
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    kv = null;
    return null;
  }

  try {
    const mod = await import('@vercel/kv');
    // @vercel/kv exports `kv` with get/set/del methods
    kv = mod.kv as unknown as KvClient;
    return kv;
  } catch {
    kv = null;
    return null;
  }
}

/** Armazenamento em memória (fallback quando não há KV). */
const memoryStore = new Map<string, number[]>();

function now(): number {
  return Date.now();
}

function prune(tsList: number[]): number[] {
  const cutoff = now() - WINDOW_MS;
  return tsList.filter((ts) => ts > cutoff);
}

export interface RateLimitResult {
  ok: boolean;
  /** Segundos até a próxima tentativa permitida (quando `ok === false`). */
  retryAfter?: number;
  /** Tentativas restantes na janela atual. */
  remaining: number;
}

/**
 * Verifica e consome uma tentativa do rate limit.
 *
 * @param key Chave única (ex.: `login:192.168.1.1:joao`).
 * @returns `{ ok, retryAfter?, remaining }`.
 */
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const client = await getKv();
  const cutoff = now() - WINDOW_MS;

  if (client) {
    try {
      // --- Vercel KV (persistente cross-instâncias) ---
      const raw = await client.get(`ratelimit:${key}`);
      let attempts: number[] = raw ? JSON.parse(raw) : [];
      attempts = attempts.filter((ts) => ts > cutoff);

      if (attempts.length >= MAX_ATTEMPTS) {
        const oldest = attempts[0];
        return {
          ok: false,
          retryAfter: Math.ceil((oldest + WINDOW_MS - now()) / 1000),
          remaining: 0,
        };
      }

      attempts.push(now());
      await client.set(`ratelimit:${key}`, JSON.stringify(attempts), { ex: Math.ceil(WINDOW_MS / 1000) + 60 });
      return { ok: true, remaining: MAX_ATTEMPTS - attempts.length };
    } catch {
      // KV indisponível no runtime: cai para a memória local.
    }
  }

  // --- Memória local (fallback) ---
  const attempts = prune(memoryStore.get(key) ?? []);
  if (attempts.length >= MAX_ATTEMPTS) {
    const oldest = attempts[0];
    return {
      ok: false,
      retryAfter: Math.ceil((oldest + WINDOW_MS - now()) / 1000),
      remaining: 0,
    };
  }
  attempts.push(now());
  memoryStore.set(key, attempts);
  return { ok: true, remaining: MAX_ATTEMPTS - attempts.length };
}

/** Reseta o contador de uma chave (útil para testes ou após login bem-sucedido). */
export async function resetRateLimit(key: string): Promise<void> {
  const client = await getKv();
  if (client) {
    try {
      await client.del(`ratelimit:${key}`);
      return;
    } catch {
      // KV indisponível: limpa a memória local e segue.
    }
  }
  memoryStore.delete(key);
}