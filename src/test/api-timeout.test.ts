import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  invokeFunction,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('invokeFunction — falhas de rede', () => {
  it('devolve erro de conexão quando o fetch falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const { data, error } = await invokeFunction('auth-login', {
      body: { username: 'a', password: 'b' },
    });

    expect(data).toBeNull();
    expect(error?.name).toBe('FunctionsFetchError');
    expect(error?.message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('não trava quando a rede engole a requisição (timeout)', async () => {
    // Promessa que nunca resolve: é o que acontece quando um firewall
    // corporativo engole a requisição (a tela ficava em "carregando").
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const { data, error } = await invokeFunction('auth-login', {
      body: { username: 'a', password: 'b' },
      timeoutMs: 60,
    });

    expect(data).toBeNull();
    expect(error?.name).toBe('FunctionsTimeoutError');
    expect(error?.message).toBe(TIMEOUT_ERROR_MESSAGE);
  });

  it('respeita o timeout mesmo quando o fetch ignora o abort', async () => {
    // Fetch "encravado" que não reage ao sinal: só a corrida com o timer
    // consegue liberar a tela.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const inicio = Date.now();
    const { error } = await invokeFunction('manage-validade', {
      body: { action: 'list' },
      timeoutMs: 60,
    });

    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(error?.name).toBe('FunctionsTimeoutError');
  });

  it('mantém a mensagem do servidor quando a resposta é um erro HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'Banco de dados indisponível no momento.' }),
    })));

    const { error } = await invokeFunction('auth-login', {
      body: { username: 'a', password: 'b' },
    });

    expect(error?.message).toBe('Banco de dados indisponível no momento.');
    expect(error?.context?.status).toBe(503);
  });

  it('envia o token da sessão quando existe', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('estoque_pro_token', 'token-de-teste');

    await invokeFunction('manage-validade', { body: { action: 'list' } });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-de-teste');

    localStorage.removeItem('estoque_pro_token');
  });
});
