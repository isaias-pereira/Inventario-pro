import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { ApiRequest } from '../../api/_lib/http';

const { createSqlMock } = vi.hoisted(() => ({
  createSqlMock: vi.fn(),
}));

vi.mock('../../api/_lib/db', () => ({ createSql: createSqlMock }));

import handler from '../../api/auth-login';

const HASH = bcrypt.hashSync('senha123', 8);

function fakeResponse() {
  const state = { status: 200, body: null as Record<string, unknown> | null };
  const res = {
    status(code: number) {
      state.status = code;
      return res;
    },
    setHeader() {},
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
  return { method: 'POST', headers: {}, body };
}

beforeEach(() => {
  createSqlMock.mockReset();
  process.env.JWT_SECRET = 'segredo-de-teste';
  process.env.DB_QUERY_TIMEOUT_MS = '80';
});

describe('POST /api/auth-login', () => {
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

  it('devolve o token quando a senha confere', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin' },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123' }), res);

    expect(state.status).toBe(200);
    expect(state.body?.success).toBe(true);
    expect(String(state.body?.token).split('.')).toHaveLength(3);
  });

  it('exige usuário e senha', async () => {
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa' }), res);

    expect(state.status).toBe(400);
  });

  it('emite token de 6 horas sem "Lembrar-me"', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin' },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123' }), res);

    const payload = decodeJwt(String(state.body?.token));
    const duracao = Number(payload.exp) - Number(payload.iat);
    expect(duracao).toBe(6 * 3600);
    expect(Number(state.body?.expiresAt)).toBe(Number(payload.exp));
  });

  it('emite token de 7 dias com "Lembrar-me"', async () => {
    createSqlMock.mockReturnValue(() => Promise.resolve([
      { username: 'isa', password: HASH, role: 'admin' },
    ]));
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ username: 'isa', password: 'senha123', remember: true }), res);

    const payload = decodeJwt(String(state.body?.token));
    const duracao = Number(payload.exp) - Number(payload.iat);
    expect(duracao).toBe(7 * 24 * 3600);
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
