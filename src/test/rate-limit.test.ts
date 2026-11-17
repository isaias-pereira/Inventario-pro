import { describe, expect, it } from 'vitest';

/**
 * O SDK do Vercel KV lança na primeira operação quando as variáveis de
 * ambiente não existem (foi o que derrubou o login em produção com 503).
 * Sem KV configurado, o rate limit precisa cair para a memória local em vez
 * de quebrar a requisição.
 */
describe('rate limit — fallback sem Vercel KV', () => {
  it('limita após 5 tentativas e libera depois do reset', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const { checkRateLimit, resetRateLimit } = await import('../../api/_lib/rate-limit');
    const key = `teste-${Date.now()}-${Math.random()}`;

    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key);
      expect(result.ok).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }

    const bloqueado = await checkRateLimit(key);
    expect(bloqueado.ok).toBe(false);
    expect(bloqueado.remaining).toBe(0);
    expect(Number(bloqueado.retryAfter)).toBeGreaterThan(0);

    await resetRateLimit(key);
    const liberado = await checkRateLimit(key);
    expect(liberado.ok).toBe(true);
  });
});
