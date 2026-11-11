/**
 * Regra de negócio: produto de KG (balança) **não entra** na Validade nem no
 * Arrastão.
 *
 * A regra é aplicada em duas camadas:
 * - na tela, quando o código digitado é de um produto de KG (mensagem clara);
 * - no servidor, que consulta o tipo no catálogo e recusa o registro (400).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest } from '../../api/_lib/http';
import type { Sql } from '../../api/_lib/db';

const { authenticateMock, createSqlMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  createSqlMock: vi.fn(),
}));

vi.mock('../../api/_lib/auth', () => ({
  authenticate: authenticateMock,
  jwtSecret: vi.fn(() => 'segredo-de-teste'),
}));

vi.mock('../../api/_lib/db', () => ({ createSql: createSqlMock }));

import manageValidade from '../../api/manage-validade';
import manageArrastao from '../../api/manage-arrastao';
import {
  codigoEhKg,
  isTipoKg as isTipoKgServidor,
  MSG_KG_ARRASTAO as MSG_SERVIDOR_ARRASTAO,
  MSG_KG_VALIDADE as MSG_SERVIDOR_VALIDADE,
} from '../../api/_lib/produto-tipo';
import {
  isTipoKg as isTipoKgTela,
  MSG_KG_ARRASTAO as MSG_TELA_ARRASTAO,
  MSG_KG_VALIDADE as MSG_TELA_VALIDADE,
} from '../lib/produto-tipo';

interface Chamada {
  text: string;
  params: unknown[];
}

/** Respostas padrão do mock (schema, contagens, etc.). */
function responderPadrao(text: string): unknown[] {
  if (text.includes('to_regclass')) return [{ table_name: 'tabela' }];
  if (text.includes('COUNT(*)::int AS c')) return [{ c: 0 }];
  if (text.includes('information_schema.columns')) return [{ column_name: 'loja' }];
  return [];
}

function instalarSql(responder: (text: string) => unknown[] = responderPadrao) {
  const chamadas: Chamada[] = [];
  const sql = vi.fn(async (query: unknown, ...rest: unknown[]) => {
    if (
      Array.isArray(query)
      && query.length > 0
      && typeof query[0] === 'object'
      && query[0] !== null
      && 'query' in (query[0] as object)
    ) {
      for (const item of query as Array<{ query: string; params?: unknown[] }>) {
        chamadas.push({ text: item.query, params: item.params ?? [] });
      }
      return [];
    }
    const text = typeof query === 'string'
      ? query
      : (Array.isArray(query) ? query.join(' ') : '');
    const params = Array.isArray(query)
      ? rest
      : (Array.isArray(rest[0]) ? (rest[0] as unknown[]) : rest);
    chamadas.push({ text, params });
    return responder(text);
  });
  createSqlMock.mockReturnValue(sql);
  return { sql, chamadas };
}

function chamadasCom(chamadas: Chamada[], trecho: string): Chamada[] {
  return chamadas.filter((chamada) => chamada.text.includes(trecho));
}

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
      state.body = typeof payload === 'string'
        ? JSON.parse(payload) as Record<string, unknown>
        : payload as Record<string, unknown>;
    },
  };
  return { res, state };
}

function request(body: Record<string, unknown>): ApiRequest {
  return { method: 'POST', headers: {}, body };
}

/** Mock do catálogo: o tipo do produto é o informado. */
function catalogo(tipo: string | null) {
  return (text: string): unknown[] => {
    if (text.includes('FROM public.produto p')) {
      return tipo === null ? [] : [{ tipo }];
    }
    if (text.includes('FROM arrastao_sessions')) {
      return [{ status: 'active', participants: ['isa'] }];
    }
    return responderPadrao(text);
  };
}

beforeEach(() => {
  authenticateMock.mockReset();
  createSqlMock.mockReset();
  authenticateMock.mockReturnValue({ sub: 'isa', role: 'admin', loja: 103, exp: 9999999999 });
});

describe('tipo do produto — KG', () => {
  it('reconhece o tipo KG (maiúsculo, minúsculo ou com espaço)', () => {
    expect(isTipoKgServidor('KG')).toBe(true);
    expect(isTipoKgServidor('kg')).toBe(true);
    expect(isTipoKgServidor(' KG ')).toBe(true);
    expect(isTipoKgServidor('UN')).toBe(false);
    expect(isTipoKgServidor(null)).toBe(false);
    expect(isTipoKgServidor(undefined)).toBe(false);
  });

  it('usa a mesma mensagem na tela e no servidor', () => {
    expect(MSG_TELA_VALIDADE).toBe(MSG_SERVIDOR_VALIDADE);
    expect(MSG_TELA_ARRASTAO).toBe(MSG_SERVIDOR_ARRASTAO);
    expect(MSG_TELA_VALIDADE).toContain('KG');
    expect(MSG_TELA_VALIDADE.toLowerCase()).toContain('validade');
    expect(MSG_TELA_ARRASTAO.toLowerCase()).toContain('arrastão');
  });
});

describe('codigoEhKg — consulta do catálogo', () => {
  it('devolve true para um produto de balança', async () => {
    const { sql } = instalarSql(catalogo('KG'));
    expect(await codigoEhKg(sql as unknown as Sql, '123')).toBe(true);
  });

  it('devolve false para um produto de unidade', async () => {
    const { sql } = instalarSql(catalogo('UN'));
    expect(await codigoEhKg(sql as unknown as Sql, '123')).toBe(false);
  });

  it('devolve false quando o produto não está no catálogo', async () => {
    const { sql } = instalarSql(catalogo(null));
    expect(await codigoEhKg(sql as unknown as Sql, '123')).toBe(false);
  });

  it('ignora código inválido', async () => {
    const { sql, chamadas } = instalarSql(catalogo('KG'));
    expect(await codigoEhKg(sql as unknown as Sql, 'abc')).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});

describe('Validade — recusa produto de KG', () => {
  it('bloqueia a gravação e explica o motivo', async () => {
    const { chamadas } = instalarSql(catalogo('KG'));
    const { res, state } = fakeResponse();

    await manageValidade(request({
      action: 'add',
      item: { ean: '7891000315507', codigo: '123', descricao: 'CARNE', validade: '2026-12-31T00:00:00.000Z' },
    }), res);

    expect(state.status).toBe(400);
    expect(state.body?.error).toBe(MSG_SERVIDOR_VALIDADE);
    expect(chamadasCom(chamadas, 'INSERT INTO validade_products')).toHaveLength(0);
  });

  it('continua gravando produto de unidade', async () => {
    const { chamadas } = instalarSql(catalogo('UN'));
    const { res, state } = fakeResponse();

    await manageValidade(request({
      action: 'add',
      item: { ean: '7891000315507', codigo: '123', descricao: 'LEITE', validade: '2026-12-31T00:00:00.000Z' },
    }), res);

    expect(state.status).toBe(200);
    expect(chamadasCom(chamadas, 'INSERT INTO validade_products')).toHaveLength(1);
  });
});

describe('Arrastão — recusa produto de KG', () => {
  it('bloqueia a coleta e explica o motivo', async () => {
    const { chamadas } = instalarSql(catalogo('KG'));
    const { res, state } = fakeResponse();

    await manageArrastao(request({
      action: 'add_item',
      session_id: 'sessao-1',
      item: { ean: '7891000315507', codigo: '123', descricao: 'CARNE', validade: '2026-12-31T00:00:00.000Z' },
    }), res);

    expect(state.status).toBe(400);
    expect(state.body?.error).toBe(MSG_SERVIDOR_ARRASTAO);
    expect(chamadasCom(chamadas, 'INSERT INTO arrastao_items')).toHaveLength(0);
  });

  it('continua coletando produto de unidade', async () => {
    const { chamadas } = instalarSql(catalogo('UN'));
    const { res, state } = fakeResponse();

    await manageArrastao(request({
      action: 'add_item',
      session_id: 'sessao-1',
      item: { ean: '7891000315507', codigo: '123', descricao: 'LEITE', validade: '2026-12-31T00:00:00.000Z' },
    }), res);

    expect(state.status).toBe(200);
    expect(chamadasCom(chamadas, 'INSERT INTO arrastao_items')).toHaveLength(1);
  });
});
