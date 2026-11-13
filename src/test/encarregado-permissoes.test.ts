/**
 * Permissões do perfil `encarregado`.
 *
 * Este arquivo trava o contrato do encarregado no servidor:
 *
 * - Validade: edita/exclui os itens da **própria equipe** (e só eles);
 * - Validade: o dropdown "Coletado por" traz o **roster da equipe**, mesmo
 *   para quem ainda não coletou nada;
 * - WhatsApp: o alerta é só do admin;
 * - Usuários: cadastra usuários operacionais da própria equipe, com o
 *   **vínculo automático** com ele — e não edita nem remove acessos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest } from '../../api/_lib/http';

const { authenticateMock, createSqlMock, jwtSecretMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  createSqlMock: vi.fn(),
  jwtSecretMock: vi.fn(() => 'segredo-de-teste'),
}));

vi.mock('../../api/_lib/auth', () => ({
  authenticate: authenticateMock,
  jwtSecret: jwtSecretMock,
}));

vi.mock('../../api/_lib/db', () => ({ createSql: createSqlMock }));

import manageValidade from '../../api/manage-validade';
import manageUsers from '../../api/manage-users';
import { handleWhatsappPost } from '../../api/_lib/whatsapp-endpoint';

/** Equipe da Luana (encarregado) na loja 103. */
const EQUIPE = ['ana', 'bob'];

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
  if (text.includes('COUNT(*)::int AS c')) return [{ c: 0 }];
  if (text.includes('information_schema.columns')) return [{ column_name: 'loja' }];
  // Equipe do encarregado.
  if (text.includes('FROM public.usuario_encarregados') && text.includes('encarregado =')) {
    return EQUIPE.map((usuario) => ({ usuario }));
  }
  // Item da Validade pertence à equipe (caso padrão dos testes).
  if (text.includes('SELECT id FROM validade_products')) return [{ id: '12' }];
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

beforeEach(() => {
  authenticateMock.mockReset();
  createSqlMock.mockReset();
  // Encarregado da loja 103.
  authenticateMock.mockReturnValue({ sub: 'luana', role: 'encarregado', loja: 103, exp: 9999999999 });
});

describe('Validade — o encarregado edita e exclui os itens da equipe', () => {
  it('edita um item coletado pela equipe', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({
      action: 'update',
      id: '12',
      validade: '2026-12-31',
      quantidade: 4,
    }), res);

    expect(state.status).toBe(200);
    const checagem = chamadasCom(chamadas, 'SELECT id FROM validade_products')[0];
    expect(checagem?.text).toContain('created_by = ANY');
    expect(checagem?.params).toContain(103);
    const equipe = checagem?.params.find((valor) => Array.isArray(valor)) as string[] | undefined;
    expect(equipe).toEqual(['luana', 'ana', 'bob']);
    expect(chamadasCom(chamadas, 'UPDATE validade_products')).not.toHaveLength(0);
  });

  it('não edita item que está fora da equipe', async () => {
    const { chamadas } = installSql((text) => {
      if (text.includes('SELECT id FROM validade_products')) return [];
      return responderPadrao(text);
    });
    const { res, state } = fakeResponse();

    await manageValidade(request({
      action: 'update',
      id: '99',
      validade: '2026-12-31',
    }), res);

    expect(state.status).toBe(404);
    expect(chamadasCom(chamadas, 'UPDATE validade_products')).toHaveLength(0);
  });

  it('exclui um item coletado pela equipe', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'remove', id: '12' }), res);

    expect(state.status).toBe(200);
    const remocao = chamadasCom(chamadas, 'SET status = false')[0];
    expect(remocao?.params).toContain(103);
  });

  it('recusa edição de quem não é admin nem encarregado', async () => {
    authenticateMock.mockReturnValue({ sub: 'ana', role: 'user', loja: 103, exp: 9999999999 });
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'update', id: '12', validade: '2026-12-31' }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'UPDATE validade_products')).toHaveLength(0);
  });

  it('recusa exclusão de quem não é admin nem encarregado', async () => {
    authenticateMock.mockReturnValue({ sub: 'ana', role: 'user', loja: 103, exp: 9999999999 });
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'remove', id: '12' }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'SET status = false')).toHaveLength(0);
  });
});

describe('Validade — o dropdown "Coletado por" do encarregado', () => {
  it('lista o roster da equipe (mesmo quem ainda não coletou)', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_users' }), res);

    expect(state.status).toBe(200);
    expect(state.body?.users).toEqual(['luana', 'ana', 'bob']);
    // Não consulta os itens: a lista é o roster da equipe.
    expect(chamadasCom(chamadas, 'FROM validade_products')).toHaveLength(0);
  });
});

describe('WhatsApp — só o admin dispara o alerta', () => {
  it('recusa o encarregado', async () => {
    installSql();
    const { res, state } = fakeResponse();

    await handleWhatsappPost(request({ action: 'whatsapp_config' }), res);

    expect(state.status).toBe(403);
    expect(String(state.body?.error)).toContain('admin');
  });

  it('libera o admin', async () => {
    authenticateMock.mockReturnValue({ sub: 'isa', role: 'admin', loja: 103, exp: 9999999999 });
    installSql();
    const { res, state } = fakeResponse();

    await handleWhatsappPost(request({ action: 'whatsapp_config' }), res);

    expect(state.status).toBe(200);
  });
});

describe('Usuários — o encarregado cadastra a própria equipe', () => {
  it('cria o usuário na loja do token já vinculado ao encarregado', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageUsers(request({
      action: 'add',
      newUser: { username: 'carla', password: 'senha123', role: 'user' },
    }), res);

    expect(state.status).toBe(200);

    const usuario = chamadasCom(chamadas, 'INSERT INTO app_users')[0];
    expect(usuario?.params).toContain('carla');
    expect(usuario?.params).toContain(103);

    const vinculo = chamadasCom(chamadas, 'INSERT INTO public.usuario_encarregados')[0];
    expect(vinculo?.params).toContain('carla');
    expect(vinculo?.params).toContain('luana');
    expect(vinculo?.params).toContain(103);
  });

  it('recusa cadastrar perfil de admin ou encarregado', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageUsers(request({
      action: 'add',
      newUser: { username: 'chefe', password: 'senha123', role: 'admin' },
    }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'INSERT INTO app_users')).toHaveLength(0);
  });

  it('lista apenas a equipe', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageUsers(request({ action: 'list' }), res);

    const listagem = chamadasCom(chamadas, 'FROM app_users')
      .find((chamada) => chamada.text.includes('username = ANY'));
    expect(listagem).toBeDefined();
    expect(listagem?.params).toContain(103);
    const equipe = listagem?.params.find((valor) => Array.isArray(valor)) as string[] | undefined;
    expect(equipe).toEqual(['luana', 'ana', 'bob']);
  });

  it('devolve só ele mesmo na lista de encarregados', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageUsers(request({ action: 'list_encarregados' }), res);

    const listagem = chamadasCom(chamadas, 'FROM app_users')
      .find((chamada) => chamada.text.includes('username = ') && !chamada.text.includes('ANY'));
    expect(listagem?.params).toContain('luana');
    expect(listagem?.params).toContain(103);
  });

  it('não edita acessos', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageUsers(request({
      action: 'update',
      newUser: { username: 'ana', role: 'admin' },
    }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'UPDATE app_users')).toHaveLength(0);
  });

  it('não remove acessos', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageUsers(request({
      action: 'delete',
      newUser: { username: 'ana' },
    }), res);

    expect(state.status).toBe(403);
    expect(chamadasCom(chamadas, 'DELETE FROM app_users')).toHaveLength(0);
  });
});
