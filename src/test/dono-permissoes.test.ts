/**
 * Exceção da conta do dono do projeto.
 *
 * O dono continua `encarregado` (escopo da própria loja), mas o servidor abre
 * quatro áreas administrativas para ele: Consulta, Metas, Base de Dados e
 * Revisão de Seções. Os demais encarregados continuam bloqueados. Estes testes
 * travam esse contrato nos endpoints e na identificação da conta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest } from '../../api/_lib/http';

const { authenticateMock, createSqlMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  createSqlMock: vi.fn(),
}));

vi.mock('../../api/_lib/auth', () => ({
  authenticate: authenticateMock,
  jwtSecret: () => 'segredo-de-teste',
}));

vi.mock('../../api/_lib/db', () => ({ createSql: createSqlMock }));

import manageConsulta from '../../api/manage-consulta';
import manageMetas from '../../api/manage-metas';
import queryProduct from '../../api/query-product';
import aiAssist from '../../api/ai-assist';
import { isAdminOrDono, isDono, isDonoUsername } from '../../api/_lib/owner';

const PRODUTO = {
  ean: '789',
  codigo: '111',
  descricao: 'PRODUTO TESTE',
  tipo: 'UN',
  categoria_codigo: null,
  secao: null,
  codigos: ['111'],
  eans: ['789'],
  embalagens: [],
};

interface Chamada {
  text: string;
  params: unknown[];
}

function sqlText(query: unknown): string {
  if (typeof query === 'string') return query;
  if (Array.isArray(query)) return query.join(' ');
  return '';
}

function responderPadrao(text: string): unknown[] {
  if (text.includes('to_regclass')) return [{ table_name: 'tabela' }];
  // Produto do catálogo (set_categoria).
  if (text.includes('FROM public.produto p')) return [PRODUTO];
  // Taxonomia (set_categoria).
  if (text.includes('FROM public.categoria') && text.includes('codigo=$1')) {
    return [{ codigo: '3' }];
  }
  return [];
}

function installSql(responder: (text: string) => unknown[] = responderPadrao) {
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
    const text = sqlText(query);
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

const DONO = { sub: 'Isaias', role: 'encarregado', loja: 103, exp: 9999999999 };
const ENCARREGADO = { sub: 'Daycon', role: 'encarregado', loja: 103, exp: 9999999999 };

beforeEach(() => {
  authenticateMock.mockReset();
  createSqlMock.mockReset();
  delete process.env.OWNER_USERNAMES;
  delete process.env.NVIDIA_API_KEY;
  delete process.env.AI_API_KEY;
  authenticateMock.mockReturnValue(DONO);
});

afterEach(() => {
  delete process.env.OWNER_USERNAMES;
  delete process.env.NVIDIA_API_KEY;
  delete process.env.AI_API_KEY;
});

describe('identificação da conta do dono', () => {
  it('reconhece a conta padrão sem diferenciar caixa nem espaços', () => {
    expect(isDonoUsername('Isaias')).toBe(true);
    expect(isDonoUsername(' isaias ')).toBe(true);
    expect(isDonoUsername('Daycon')).toBe(false);
    expect(isDonoUsername(undefined)).toBe(false);
  });

  it('aceita uma lista extra em OWNER_USERNAMES', () => {
    process.env.OWNER_USERNAMES = 'Isaias, OutraConta';
    expect(isDonoUsername('outraconta')).toBe(true);
    expect(isDonoUsername('admin')).toBe(false);
  });

  it('reconhece a claim assinada e também tokens antigos (sem a claim)', () => {
    expect(isDono({ sub: 'qualquer', role: 'encarregado', dono: true })).toBe(true);
    expect(isDono({ sub: 'Isaias', role: 'encarregado' })).toBe(true);
    expect(isDono({ sub: 'Daycon', role: 'encarregado', dono: false })).toBe(false);
  });

  it('dá acesso administrativo ao admin e ao dono, mas não ao encarregado comum', () => {
    expect(isAdminOrDono({ sub: 'isa', role: 'admin' })).toBe(true);
    expect(isAdminOrDono(DONO)).toBe(true);
    expect(isAdminOrDono(ENCARREGADO)).toBe(false);
  });
});

describe('Base de Dados — só o dono substitui a base além do admin', () => {
  it('libera o dono', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageConsulta(request({
      action: 'replace',
      products: [{ codigo: '111', descricao: 'PRODUTO', estoque: 1, preco: 2 }],
    }), res);

    expect(state.status).toBe(200);
    expect(chamadasCom(chamadas, 'DELETE FROM consulta_products')).toHaveLength(1);
  });

  it('recusa outro encarregado', async () => {
    authenticateMock.mockReturnValue(ENCARREGADO);
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageConsulta(request({
      action: 'replace',
      products: [{ codigo: '111', descricao: 'PRODUTO', estoque: 1, preco: 2 }],
    }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'DELETE FROM consulta_products')).toHaveLength(0);
  });
});

describe('Metas — só o dono grava além do admin', () => {
  it('libera o dono para salvar a meta', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageMetas(request({
      action: 'save_meta',
      ano: 2026,
      mes: 11,
      items: [{ dia: 1, meta: 100 }],
    }), res);

    expect(state.status).toBe(200);
    expect(chamadasCom(chamadas, 'INSERT INTO metas_mensais')).toHaveLength(1);
  });

  it('recusa outro encarregado', async () => {
    authenticateMock.mockReturnValue(ENCARREGADO);
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageMetas(request({
      action: 'save_realizado',
      ano: 2026,
      mes: 11,
      realizadoItems: [{ dia: 1, venda: 50 }],
    }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'UPDATE metas_mensais')).toHaveLength(0);
  });
});

describe('Revisão de Seções — o dono classifica, mas não edita o catálogo', () => {
  it('libera set_categoria para o dono', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await queryProduct(request({
      action: 'set_categoria',
      codigo: '111',
      categoriaCodigo: '3',
    }), res);

    expect(state.status).toBe(200);
    expect(chamadasCom(chamadas, 'UPDATE public.produto SET categoria_codigo')).toHaveLength(1);
  });

  it('recusa set_categoria para outro encarregado', async () => {
    authenticateMock.mockReturnValue(ENCARREGADO);
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await queryProduct(request({
      action: 'set_categoria',
      codigo: '111',
      categoriaCodigo: '3',
    }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'UPDATE public.produto SET categoria_codigo')).toHaveLength(0);
  });

  it('continua barrando a edição completa do catálogo para o dono', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await queryProduct(request({ action: 'update', codigo: '111' }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'UPDATE public.produto')).toHaveLength(0);
  });
});

describe('IA da Base de Dados/Revisão de Seções — só admin e dono', () => {
  it('deixa o dono passar pela checagem de permissão', async () => {
    const { res, state } = fakeResponse();

    await aiAssist(request({
      action: 'import_review',
      target: 'consulta',
      headers: ['codigo'],
      samples: [],
    }), res);

    // Sem chave da IA o endpoint responde 503 — o importante é não ser 403.
    expect(state.status).toBe(503);
  });

  it('recusa outro encarregado antes de olhar a IA', async () => {
    authenticateMock.mockReturnValue(ENCARREGADO);
    const { res, state } = fakeResponse();

    await aiAssist(request({ action: 'review_categorias' }), res);

    expect(state.status).toBe(403);
  });
});
