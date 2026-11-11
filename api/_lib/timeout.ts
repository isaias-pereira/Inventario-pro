/**
 * Timeout para consultas ao banco.
 *
 * A Vercel derruba a Function depois de `maxDuration`; sem um limite menor, uma
 * consulta travada deixa o usuário olhando um "carregando" infinito. Com o
 * timeout, a API responde 503 com uma mensagem clara e o app consegue mostrar
 * o motivo (inclusive quando o banco está inacessível a partir da rede).
 */

/** Erro de tempo esgotado em uma operação do servidor. */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Tempo padrão de uma consulta ao banco (ms). */
export const DEFAULT_DB_TIMEOUT_MS = 10_000;

/**
 * Tempo de espera do banco. Pode ser ajustado por `DB_QUERY_TIMEOUT_MS`
 * (útil em testes e para redes lentas).
 */
export function dbTimeoutMs(): number {
  const raw = Number(process.env.DB_QUERY_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  return DEFAULT_DB_TIMEOUT_MS;
}

/**
 * Espera a promise com um limite de tempo. A promise original continua em
 * segundo plano (o driver do Neon não permite cancelar a query), mas a
 * resposta para o cliente não depende dela.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Tempo esgotado ao consultar o banco de dados',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
