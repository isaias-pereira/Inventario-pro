/**
 * Escopo de visibilidade da Validade.
 *
 * A regra é derivada de `usuario_encarregados`, não do perfil:
 *
 * - admin vê a loja inteira;
 * - col_validade vê só as próprias coletas;
 * - os demais veem a si mesmos, os vínculos diretos, os colegas da mesma
 *   equipe e os encarregados que compartilham pelo menos um subordinado.
 *
 * O caso de regressão é o usuário da Luana vendo os itens do Isaias — os dois
 * não compartilham nenhum usuário, então o escopo não pode cruzar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest } from '../../api/_lib/http';

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

/**
 * Grafo de teste:
 *
 * Luana -> Ana, Bia
 * Isaias -> Carla
 * Adriana -> Carla        (Isaias e Adriana são co-supervisores)
 * Marlene (col_validade) -> ligada ao Isaias, mas vê só as próprias.
 */
const VINCULOS: Record<string, { supervisores: string[]; subordinados: string[] }> = {
  luana: { supervisores: [], subordinados: ['ana', 'bia'] },
  isaias: { supervisores: [], subordinados: ['carla'] },
  adriana: { supervisores: [], subordinados: ['carla'] },
  ana: { supervisores: ['luana'], subordinados: [] },
  bia: { supervisores: ['luana'], subordinados: [] },
  carla: { supervisores: ['isaias', 'adriana'], subordinados: [] },
  marlene: { supervisores: ['isaias'], subordinados: [] },
};

const LOJA = 103;
const ITEM_ID = '76340242-56a2-4f73-a515-d6b08e6424c3';

interface Chamada {
  text: string;
  params: unknown[];
}

function sqlText(query: unknown): string {
  if (typeof query === 'string') return query;
  if (Array.isArray(query)) return query.join(' ');
  return '';
}

function nomesUnicos(nomes: string[]): string[] {
  return [...new Set(nomes)];
}

/** Escopo esperado para o grafo de teste (mesma regra do helper). */
function escopoEsperado(usuario: string): string[] {
  const dados = VINCULOS[usuario] ?? { supervisores: [], subordinados: [] };
  const colegas = dados.supervisores.flatMap(
    (supervisor) => VINCULOS[supervisor]?.subordinados ?? [],
  );
  const coSupervisores = dados.subordinados.flatMap(
    (subordinado) => VINCULOS[subordinado]?.supervisores ?? [],
  );
  return nomesUnicos([
    usuario,
    ...dados.supervisores,
    ...dados.subordinados,
    ...colegas,
    ...coSupervisores,
  ]);
}

function resolverEscopo(text: string, params: unknown[]): unknown[] {
  const usuario = String(params[0] ?? '');
  return escopoEsperado(usuario).map((nome) => ({ nome }));
}

function responderPadrao(text: string, params: unknown[]): unknown[] {
  if (text.includes('to_regclass')) return [{ table_name: 'tabela' }];
  if (text.includes('COUNT(*)::int AS c')) return [{ c: 0 }];
  if (text.includes('information_schema.columns')) return [{ column_name: 'loja' }];

  if (text.includes('WITH meus_supervisores')) return resolverEscopo(text, params);

  if (text.includes('FROM public.usuario_encarregados') && text.includes('encarregado =')) {
    const encarregado = String(params[0] ?? '');
    return (VINCULOS[encarregado]?.subordinados ?? []).map((usuario) => ({ usuario }));
  }

  if (text.includes('SELECT id FROM validade_products')) return [{ id: ITEM_ID }];
  if (text.includes('SELECT DISTINCT created_by')) return [{ created_by: 'ana' }];
  if (text.includes('SELECT v.*')) return [];
  return [];
}

function installSql(
  responder: (text: string, params: unknown[]) => unknown[] = responderPadrao,
) {
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
    return responder(text, params);
  });
  createSqlMock.mockReturnValue(sql);
  return { sql, chamadas };
}

function chamadasCom(chamadas: Chamada[], trecho: string): Chamada[] {
  return chamadas.filter((chamada) => chamada.text.includes(trecho));
}

function escopoDaChamada(chamada: Chamada | undefined): string[] {
  return (chamada?.params.find((valor) => Array.isArray(valor)) as string[] | undefined) ?? [];
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

function autenticar(username: string, role: string) {
  authenticateMock.mockReturnValue({ sub: username, role, loja: LOJA, exp: 9999999999 });
}

beforeEach(() => {
  authenticateMock.mockReset();
  createSqlMock.mockReset();
  autenticar('ana', 'user');
});

describe('Validade — escopo de leitura por vínculo', () => {
  it('usuário da Luana não vê os itens do Isaias', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_all' }), res);

    expect(state.status).toBe(200);
    const listagem = chamadasCom(chamadas, 'FROM validade_products v')[0];
    expect(listagem?.text).toContain('v.created_by = ANY');
    const escopo = escopoDaChamada(listagem);
    expect(escopo).toEqual(expect.arrayContaining(['ana', 'bia', 'luana']));
    expect(escopo).not.toContain('isaias');
    expect(escopo).not.toContain('carla');
  });

  it('a própria Luana não vê os itens do Isaias', async () => {
    autenticar('luana', 'encarregado');
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_all' }), res);

    expect(state.status).toBe(200);
    const escopo = escopoDaChamada(chamadasCom(chamadas, 'FROM validade_products v')[0]);
    expect(escopo).toEqual(expect.arrayContaining(['luana', 'ana', 'bia']));
    expect(escopo).not.toContain('isaias');
  });

  it('Isaias e Adriana se veem porque compartilham a Carla', async () => {
    autenticar('isaias', 'encarregado');
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_all' }), res);

    expect(state.status).toBe(200);
    const escopo = escopoDaChamada(chamadasCom(chamadas, 'FROM validade_products v')[0]);
    expect(escopo).toEqual(expect.arrayContaining(['isaias', 'carla', 'adriana']));
    expect(escopo).not.toContain('luana');
    expect(escopo).not.toContain('ana');
  });

  it('admin não recebe filtro de criador (vê a loja inteira)', async () => {
    autenticar('admin', 'admin');
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_all' }), res);

    expect(state.status).toBe(200);
    const listagem = chamadasCom(chamadas, 'FROM validade_products v')[0];
    expect(listagem?.text).not.toContain('v.created_by = ANY');
    expect(chamadasCom(chamadas, 'WITH meus_supervisores')).toHaveLength(0);
  });

  it('col_validade continua vendo só as próprias coletas', async () => {
    autenticar('marlene', 'col_validade');
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_all' }), res);

    expect(state.status).toBe(200);
    const listagem = chamadasCom(chamadas, 'FROM validade_products v')[0];
    const escopo = escopoDaChamada(listagem);
    expect(escopo).toEqual(['marlene']);
  });

  it('list e notifications usam o mesmo escopo do list_all', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list' }), res);
    await manageValidade(request({ action: 'notifications' }), res);

    expect(state.status).toBe(200);
    const escopos = chamadasCom(chamadas, 'FROM validade_products v')
      .map((chamada) => escopoDaChamada(chamada));
    expect(escopos).toHaveLength(2);
    for (const escopo of escopos) {
      expect(escopo).toEqual(expect.arrayContaining(['ana', 'bia', 'luana']));
      expect(escopo).not.toContain('isaias');
    }
  });

  it('consulta_periodo do encarregado também fica no escopo', async () => {
    autenticar('luana', 'encarregado');
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({
      action: 'consulta_periodo',
      incluir_vencidos: true,
    }), res);

    expect(state.status).toBe(200);
    const consulta = chamadasCom(chamadas, 'FROM validade_products v')[0];
    const escopo = escopoDaChamada(consulta);
    expect(escopo).toEqual(expect.arrayContaining(['luana', 'ana', 'bia']));
    expect(escopo).not.toContain('isaias');
  });

  it('o roster do "Coletado por" mostra o escopo e não a loja inteira', async () => {
    autenticar('isaias', 'encarregado');
    installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_users' }), res);

    expect(state.status).toBe(200);
    expect(state.body?.users).toEqual(['isaias', 'adriana', 'carla']);
  });

  it('falha fechado quando a consulta de vínculo quebra', async () => {
    const { chamadas } = installSql((text) => {
      if (text.includes('WITH meus_supervisores')) throw new Error('banco indisponível');
      return responderPadrao(text, []);
    });
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_all' }), res);

    expect(state.status).toBe(500);
    expect(chamadasCom(chamadas, 'SELECT v.*')).toHaveLength(0);
  });
});

describe('Validade — escrita limitada à equipe direta', () => {
  it('Adriana não edita um item do Isaias, mesmo sendo co-supervisora', async () => {
    autenticar('adriana', 'encarregado');
    // O item pertence ao Isaias: só seria visível para edição se o escopo de
    // escrita incluísse o criador.
    const { chamadas } = installSql((text, params) => {
      if (text.includes('SELECT id FROM validade_products')) {
        const escopo = (params.find((valor) => Array.isArray(valor)) as string[] | undefined) ?? [];
        return escopo.includes('isaias') ? [{ id: ITEM_ID }] : [];
      }
      return responderPadrao(text, params);
    });
    const { res, state } = fakeResponse();

    await manageValidade(request({
      action: 'update',
      id: ITEM_ID,
      validade: '2026-12-31',
    }), res);

    expect(state.status).toBe(404);
    const checagem = chamadasCom(chamadas, 'SELECT id FROM validade_products')[0];
    const escopo = escopoDaChamada(checagem);
    expect(escopo).toEqual(expect.arrayContaining(['adriana', 'carla']));
    expect(escopo).not.toContain('isaias');
    expect(chamadasCom(chamadas, 'UPDATE validade_products')).toHaveLength(0);
  });
});

describe('Arrastão — mesmo escopo da Validade', () => {
  it('usuário da Luana consulta só o próprio escopo', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageArrastao(request({
      action: 'consulta_all_items',
      incluir_vencidos: true,
    }), res);

    expect(state.status).toBe(200);
    const consulta = chamadasCom(chamadas, 'FROM arrastao_items i')[0];
    expect(consulta?.text).toContain('i.scanned_by = ANY');
    const escopo = escopoDaChamada(consulta);
    expect(escopo).toEqual(expect.arrayContaining(['ana', 'bia', 'luana']));
    expect(escopo).not.toContain('isaias');
  });
});
