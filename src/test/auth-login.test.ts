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
});
