/**
 * Escopo por loja (multi-loja).
 *
 * O servidor aplica o filtro de loja a partir do token (`payload.loja`) em
 * todos os dados operacionais. Estes testes travam esse contrato: cada endpoint
 * filtra e grava pela loja do token — nunca pela loja que o cliente manda.
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
import manageConsulta from '../../api/manage-consulta';
import manageInventory from '../../api/manage-inventory';
import manageMetas from '../../api/manage-metas';
import manageRebaixa from '../../api/manage-rebaixa';
import manageArrastao from '../../api/manage-arrastao';
import manageUsers from '../../api/manage-users';
import manageEmails from '../../api/manage-emails';

/** Uma chamada ao banco registrada. */
interface Chamada {
  text: string;
  params: unknown[];
}

/** Texto da query, seja tagged template (`sql\`...\``) ou query crua. */
function sqlText(query: unknown): string {
  if (typeof query === 'string') return query;
  if (Array.isArray(query)) return query.join(' ');
  return '';
}

/**
 * Respostas padrão do mock: as consultas de schema (existência da tabela,
 * contagem de órfãos) precisam devolver alguma coisa para o endpoint seguir.
 */
function responderPadrao(text: string): unknown[] {
  if (text.includes('to_regclass')) return [{ table_name: 'tabela' }];
  if (text.includes('COUNT(*)::int AS c')) return [{ c: 0 }];
  if (text.includes('information_schema.columns')) return [{ column_name: 'loja' }];
  if (text.includes('MAX(numero)')) return [{ max: 0 }];
  // Validação dos encarregados no cadastro/edição de usuário.
  if (text.includes('FROM public.app_users') && text.includes('username = ANY')) {
    return [{ username: 'isa', role: 'admin', loja: 103 }];
  }
  return [];
}

/**
 * Instala o mock de banco.
 *
 * `responder` devolve as linhas de cada query (por padrão, as respostas de
 * schema); as chamadas ficam registradas para o teste inspecionar o SQL.
 */
function installSql(responder: (text: string) => unknown[] = responderPadrao) {
  const chamadas: Chamada[] = [];
  const sql = vi.fn(async (query: unknown, ...rest: unknown[]) => {
    // Lote transacional: `sql([{ query, params }], [], true)`
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
    // Tagged template: os valores interpolados chegam como argumentos.
    // Query crua: o segundo argumento é o array de parâmetros.
    const params = Array.isArray(query)
      ? rest
      : (Array.isArray(rest[0]) ? (rest[0] as unknown[]) : rest);
    chamadas.push({ text, params });
    return responder(text);
  });
  createSqlMock.mockReturnValue(sql);
  return { sql, chamadas };
}

/** Chamadas cujo SQL casa com o trecho informado. */
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
  // Admin da loja 103 (a loja vem assinada no token).
  authenticateMock.mockReturnValue({ sub: 'isa', role: 'admin', loja: 103, exp: 9999999999 });
});

describe('escopo por loja — Validade', () => {
  it('filtra a listagem pela loja do token', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({ action: 'list_all' }), res);

    expect(state.status).toBe(200);
    const listagem = chamadasCom(chamadas, 'FROM validade_products v')[0];
    expect(listagem.text).toContain('v.loja = $1');
    expect(listagem.params).toContain(103);
  });

  it('grava a loja do token no item adicionado', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageValidade(request({
      action: 'add',
      item: { ean: '7891000315507', codigo: '123', descricao: 'LEITE', validade: '2026-12-31T00:00:00.000Z' },
    }), res);

    expect(state.status).toBe(200);
    const insert = chamadasCom(chamadas, 'INSERT INTO validade_products')[0];
    expect(insert.text).toContain('loja');
    expect(insert.params).toContain(103);
  });

  it('não deixa editar item de outra loja', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageValidade(request({
      action: 'remove',
      id: '11111111-1111-1111-1111-111111111111',
    }), res);

    const remocao = chamadasCom(chamadas, 'UPDATE validade_products SET status = false')[0];
    expect(remocao.text).toContain('loja =');
    expect(remocao.params).toContain(103);
  });

  it('restringe a consulta por período à loja do token', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageValidade(request({
      action: 'consulta_periodo',
      data_inicio: '2026-11-01',
      data_fim: '2026-11-10',
    }), res);

    const consulta = chamadasCom(chamadas, 'FROM validade_products v')[0];
    expect(consulta.text).toContain('v.loja = $1');
    expect(consulta.params[0]).toBe(103);
  });
});

describe('escopo por loja — Consulta', () => {
  it('lista apenas a base da loja do token', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageConsulta(request({ action: 'list' }), res);

    const listagem = chamadasCom(chamadas, 'FROM consulta_products cp')[0];
    expect(listagem.text).toContain('cp.loja = $1');
    expect(listagem.params).toContain(103);
  });

  it('substitui só a base da loja (não apaga as outras lojas)', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageConsulta(request({
      action: 'replace',
      products: [{ codigo: '1', descricao: 'X', estoque: 1, preco: 2 }],
    }), res);

    const remocao = chamadasCom(chamadas, 'DELETE FROM consulta_products')[0];
    expect(remocao.text).toContain('WHERE loja =');
    expect(remocao.params).toContain(103);
  });
});

describe('escopo por loja — Inventário', () => {
  it('cria o lote na loja do token', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageInventory(request({
      action: 'add',
      item: { ean: '7891000315507', codigo: '123', descricao: 'LEITE' },
      quantidade: 3,
    }), res);

    const lote = chamadasCom(chamadas, 'INSERT INTO inventory_lotes')[0];
    expect(lote.text).toContain('loja');
    expect(lote.params).toContain(103);

    const item = chamadasCom(chamadas, 'INSERT INTO shared_inventory')[0];
    expect(item.text).toContain('loja');
    expect(item.params).toContain(103);
  });

  it('busca o lote aberto da loja do token', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageInventory(request({ action: 'list' }), res);

    const aberto = chamadasCom(chamadas, "FROM inventory_lotes WHERE loja")[0];
    expect(aberto.params).toContain(103);
  });

  it('limpa apenas os itens da loja do token', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageInventory(request({ action: 'clear' }), res);

    const remocao = chamadasCom(chamadas, 'DELETE FROM shared_inventory')[0];
    expect(remocao.text).toContain('loja =');
    expect(remocao.params).toContain(103);
  });
});

describe('escopo por loja — Metas', () => {
  it('salva a meta na loja do token (conflito por loja)', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageMetas(request({
      action: 'save_meta',
      ano: 2026,
      mes: 11,
      items: [{ dia: 1, meta: 100 }],
    }), res);

    const insert = chamadasCom(chamadas, 'INSERT INTO metas_mensais')[0];
    expect(insert.text).toContain('loja');
    expect(insert.text).toContain('ON CONFLICT (loja, ano, mes, dia)');
    expect(insert.params).toContain(103);
  });

  it('lê as metas da loja do token', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageMetas(request({ action: 'get', ano: 2026, mes: 11 }), res);

    const leitura = chamadasCom(chamadas, 'FROM metas_mensais')[0];
    expect(leitura.text).toContain('loja =');
    expect(leitura.params).toContain(103);
  });
});

describe('escopo por loja — Rebaixa', () => {
  it('lista o rascunho da loja do token', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageRebaixa(request({ action: 'list' }), res);

    const listagem = chamadasCom(chamadas, 'FROM public.rebaixa_products r')[0];
    expect(listagem.text).toContain('r.loja = $1');
    expect(listagem.params).toContain(103);
  });

  it('limpa só o rascunho da loja', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageRebaixa(request({ action: 'clear' }), res);

    const remocao = chamadasCom(chamadas, 'DELETE FROM public.rebaixa_products')[0];
    expect(remocao.text).toContain("status = 'rascunho'");
    expect(remocao.text).toContain('loja = $1');
    expect(remocao.params).toContain(103);
  });

  it('grava a loja no item adicionado', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageRebaixa(request({
      action: 'add',
      item: {
        ean: '7891000315507',
        codigo: '123',
        descricao: 'LEITE',
        tipo: 'UN',
        validade: '2026-12-31T00:00:00.000Z',
        quantidade: 2,
      },
    }), res);

    const insert = chamadasCom(chamadas, 'INSERT INTO public.rebaixa_products')[0];
    expect(insert.text).toContain('loja');
    expect(insert.params).toContain(103);
  });
});

describe('escopo por loja — Arrastão', () => {
  it('inicia a sessão na loja do token', async () => {
    const { chamadas } = installSql((text) => {
      if (text.includes('INSERT INTO arrastao_sessions')) return [{ id: 'sessao-1', loja: 103 }];
      return responderPadrao(text);
    });
    const { res } = fakeResponse();

    await manageArrastao(request({ action: 'start', corredor: 'A' }), res);

    const insert = chamadasCom(chamadas, 'INSERT INTO arrastao_sessions')[0];
    expect(insert.text).toContain('loja');
    expect(insert.params).toContain(103);
  });

  it('leva os itens para a Validade da loja da sessão', async () => {
    const { chamadas } = installSql((text) => {
      if (text.includes('SELECT started_by, status FROM arrastao_sessions')) {
        return [{ started_by: 'isa', status: 'active' }];
      }
      if (text.includes('SELECT loja FROM arrastao_sessions')) {
        return [{ loja: 92 }];
      }
      return responderPadrao(text);
    });
    const { res } = fakeResponse();

    await manageArrastao(request({ action: 'finalize', session_id: 'sessao-1' }), res);

    const transferencia = chamadasCom(chamadas, 'INSERT INTO validade_products')[0];
    expect(transferencia.text).toContain('loja');
    expect(transferencia.params).toContain(92);
  });
});

describe('escopo por loja — Usuários', () => {
  it('lista apenas os acessos da loja do token', async () => {
    const { chamadas } = installSql();
    const { res, state } = fakeResponse();

    await manageUsers(request({ action: 'list' }), res);

    expect(state.status).toBe(200);
    const listagem = chamadasCom(chamadas, 'FROM app_users')[0];
    expect(listagem.text).toContain('WHERE loja =');
    expect(listagem.params).toContain(103);
  });

  it('cadastra o usuário na loja informada (validada)', async () => {
    const { chamadas } = installSql((text) => {
      if (text.includes('FROM public.lojas WHERE codigo')) return [{ ok: 1 }];
      return responderPadrao(text);
    });
    const { res } = fakeResponse();

    await manageUsers(request({
      action: 'add',
      newUser: { username: 'novo', password: 'senha', role: 'user', loja: 92 },
    }), res);

    const insert = chamadasCom(chamadas, 'INSERT INTO app_users')[0];
    expect(insert.text).toContain('loja');
    expect(insert.params).toContain(92);
  });

  it('troca a loja re-assinando o token (admin)', async () => {
    installSql((text) => {
      if (text.includes('FROM public.lojas WHERE codigo')) return [{ ok: 1 }];
      return responderPadrao(text);
    });
    const { res, state } = fakeResponse();

    await manageUsers(request({ action: 'switch_loja', newUser: { loja: 88 } }), res);

    expect(state.status).toBe(200);
    const token = String(state.body?.token);
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    expect(Number(payload.loja)).toBe(88);
    expect(payload.sub).toBe('isa');
    expect(state.body?.user).toMatchObject({ loja: 88 });
  });

  it('recusa trocar para uma loja inexistente', async () => {
    installSql(responderPadrao);
    const { res, state } = fakeResponse();

    await manageUsers(request({ action: 'switch_loja', newUser: { loja: 999 } }), res);

    expect(state.status).toBe(400);
    expect(state.body?.token).toBeUndefined();
  });

  it('lista as lojas para qualquer usuário logado', async () => {
    authenticateMock.mockReturnValue({ sub: 'comprador', role: 'user', loja: 103, exp: 9999999999 });
    const { chamadas } = installSql((text) => {
      if (text.includes('FROM public.lojas') && text.includes('ORDER BY codigo')) {
        return [{ codigo: 103, nome: 'Loja 103', ativo: true }];
      }
      return responderPadrao(text);
    });
    const { res, state } = fakeResponse();

    await manageUsers(request({ action: 'list_lojas' }), res);

    expect(state.status).toBe(200);
    expect(state.body?.lojas).toHaveLength(1);
    expect(chamadasCom(chamadas, 'FROM public.lojas').length).toBeGreaterThan(0);
  });
});

describe('escopo por loja — E-mails', () => {
  it('lista os destinatários da loja do token', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageEmails(request({ action: 'list' }), res);

    const listagem = chamadasCom(chamadas, 'FROM public.email_padrao')[0];
    expect(listagem.text).toContain('loja = $1');
    expect(listagem.params).toContain(103);
  });

  it('lê o assunto/mensagem padrão da loja', async () => {
    const { chamadas } = installSql();
    const { res } = fakeResponse();

    await manageEmails(request({ action: 'list' }), res);

    const config = chamadasCom(chamadas, 'FROM public.email_config')[0];
    expect(config.text).toContain('loja =');
    expect(config.params).toContain(103);
  });
});
