import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { ApiRequest, ApiResponse } from '../../api/_lib/http';

const { createSqlMock } = vi.hoisted(() => ({
  createSqlMock: vi.fn(),
}));

vi.mock('../../api/_lib/db', () => ({ createSql: createSqlMock }));

import handler from '../../api/auth';

const HASH = bcrypt.hashSync('senha123', 8);

function fakeResponse(): { res: ApiResponse; state: { status: number; body: Record<string, unknown> | null; headers: Record<string, string> } } {
  const state = { status: 200, body: null as Record<string, unknown> | null, headers: {} as Record<string, string> };
  const res: ApiResponse = {
    status(code: number) {
      state.status = code;
      return res;
    },
    setHeader(name: string, value: string) {
      // Normalize header name to lowercase for case-insensitive access
      state.headers[name.toLowerCase()] = value;
    },
    json(payload: unknown) {
      state.body = payload as Record<string, unknown>;
    },
    end(payload?: unknown) {
      if (payload) state.body = JSON.parse(String(payload)) as Record<string, unknown>;
    },
  };
  return { res, state };
}

function fakeRequest(body: unknown): ApiRequest {
  // Garante que o turnstileToken seja enviado (o handler valida antes do rate limit)
  const withToken = typeof body === 'object' && body !== null
    ? { action: 'login', ...(body as Record<string, unknown>), turnstileToken: 'dummy-token' }
    : { action: 'login', turnstileToken: 'dummy-token' };
  return { method: 'POST', headers: {}, body: withToken };
}

beforeEach(() => {
  createSqlMock.mockReset();
  process.env.JWT_SECRET = 'segredo-de-teste';
  process.env.DB_QUERY_TIMEOUT_MS = '80';
  process.env.TURNSTILE_SECRET_KEY = ''; // Vazio = pula verificação (modo dev)
});

describe('POST /api/auth (action login)', () => {
  it('responde 503 quando o banco não responde (timeout)', async () => {
    createSqlMock.mockReturnValue(() => new Promise(() => {}));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123' }), res);

    expect(state.status).toBe(503);
    expect(String(state.body?.error)).toContain('Banco de dados indisponível');
  });

  it('responde 503 quando a conexão com o banco falha', async () => {
    createSqlMock.mockReturnValue(() => Promise.reject(new Error('ECONNREFUSED')));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123' }), res);

    expect(state.status).toBe(503);
    expect(String(state.body?.error)).toContain('Não foi possível falar com o banco');
  });

  it('informa credenciais inválidas sem quebrar o contrato', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin' },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'errada' }), res);

    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ success: false, error: 'Usuário ou senha inválidos' });
  });

  it('devolve o cookie de autenticação quando a senha confere', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin', loja: 92 },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123' }), res);

    expect(state.status).toBe(200);
    expect(state.body?.success).toBe(true);
    expect(state.headers['set-cookie']).toBeDefined();
    expect(String(state.headers['set-cookie'])).toContain('estoque_pro_token=');
  });

  it('assina a loja do usuário no token (escopo multi-loja) via cookie', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin', loja: 92 },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123' }), res);

    const cookie = String(state.headers['set-cookie']);
    expect(cookie).toContain('estoque_pro_token=');
    const token = cookie.split('estoque_pro_token=')[1].split(';')[0];
    const payload = decodeJwt(token);
    expect(Number(payload.loja)).toBe(92);
    expect(state.body?.user).toMatchObject({ username: 'isa', role: 'admin', loja: 92 });
  });

  it('usa a loja padrão quando o cadastro não tem loja', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin' },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123' }), res);

    const cookie = String(state.headers['set-cookie']);
    const token = cookie.split('estoque_pro_token=')[1].split(';')[0];
    const payload = decodeJwt(token);
    expect(Number(payload.loja)).toBe(103);
  });

  it('exige usuário e senha', async () => {
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa' }), res);

    expect(state.status).toBe(400);
  });

  it('emite token de 6 horas', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin' },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123' }), res);

    const cookie = String(state.headers['set-cookie']);
    const token = cookie.split('estoque_pro_token=')[1].split(';')[0];
    const payload = decodeJwt(token);
    const duracao = Number(payload.exp) - Number(payload.iat);
    expect(duracao).toBe(6 * 3600);
    expect(Number(state.body?.expiresAt)).toBe(Number(payload.exp));
  });

  it('ignora a opção "lembrar-me" e mantém o token de 6 horas', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin' },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123', remember: true }), res);

    const cookie = String(state.headers['set-cookie']);
    const token = cookie.split('estoque_pro_token=')[1].split(';')[0];
    const payload = decodeJwt(token);
    const duracao = Number(payload.exp) - Number(payload.iat);
    expect(duracao).toBe(6 * 3600);
    expect(Number(state.body?.expiresAt)).toBe(Number(payload.exp));
  });
});

/** Decodifica o payload de um JWT (sem validar a assinatura). */
function decodeJwt(token: string): Record<string, unknown> {
  const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(parte.padEnd(parte.length + ((4 - (parte.length % 4)) % 4), '='));
  return JSON.parse(decodeURIComponent(
    Array.from(json)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  )) as Record<string, unknown>;
}
