import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest } from '../../api/_lib/http';
import type { WhatsappConfig } from '../../api/_lib/whatsapp';

const { authenticateMock, createSqlMock, configMock, sendMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  createSqlMock: vi.fn(),
  configMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock('../../api/_lib/auth', () => ({ authenticate: authenticateMock }));
vi.mock('../../api/_lib/db', () => ({ createSql: createSqlMock }));
vi.mock('../../api/_lib/whatsapp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/whatsapp')>();
  return {
    ...actual,
    whatsappConfig: configMock,
    sendWhatsappToRecipients: sendMock,
  };
});

import { handleWhatsappCron, handleWhatsappPost, canSendWhatsapp } from '../../api/_lib/whatsapp-endpoint';
import manageValidade from '../../api/manage-validade';

const CONFIG: WhatsappConfig = {
  enabled: true,
  token: 'token',
  phoneNumberId: '123',
  recipients: ['5511999999999'],
  templateName: 'alerta_validade_sgs',
  templateLang: 'pt_BR',
  apiVersion: 'v23.0',
  alertDays: 4,
  maxItems: 30,
};

const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

function fakeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return { method: 'POST', headers: {}, body: {}, ...overrides };
}

/**
 * O endpoint real mora em `_lib/whatsapp-endpoint` e é chamado por
 * `manage-validade`; este atalho mantém os testes focados na lógica.
 */
function handler(req: ApiRequest, res: Parameters<typeof handleWhatsappCron>[1]) {
  return req.method === 'GET'
    ? handleWhatsappCron(req, res)
    : handleWhatsappPost(req, res);
}

/** Texto da query, seja tagged template (`sql\`...\``) ou query crua. */
function sqlText(query: unknown): string {
  if (typeof query === 'string') return query;
  if (Array.isArray(query)) return query.join(' ');
  return '';
}

/**
 * Instala o mock de banco. `rows` são os produtos da validade; `claim` diz se
 * a reserva do slot foi aceita; `history` alimenta a ação `history`.
 *
 * No multi-loja: `lojas` é o cadastro de lojas, `destinatarios` mapeia a loja
 * aos números cadastrados e `rowsPorLoja` dá os produtos de cada loja.
 */
function installSql(options: {
  rows?: unknown[];
  rowsPorLoja?: Record<number, unknown[]>;
  claim?: boolean;
  history?: unknown[];
  lojas?: unknown[];
  destinatarios?: Record<number, string[]>;
} = {}) {
  const {
    rows = [],
    rowsPorLoja = {},
    claim = true,
    history = [],
    lojas = [],
    destinatarios = {},
  } = options;
  const sql = vi.fn(async (query: unknown, params?: unknown[]) => {
    const text = sqlText(query);
    if (text.includes('to_regclass')) return [{ table_name: 'whatsapp_envios' }];
    if (text.includes('INSERT INTO public.whatsapp_envios')) {
      return claim ? [{ id: '42' }] : [];
    }
    if (text.includes('FROM public.whatsapp_envios')) return history;
    if (text.includes('FROM public.whatsapp_destinatarios')) {
      const loja = Number((params as unknown[] | undefined)?.[0]);
      return (destinatarios[loja] ?? []).map((telefone) => ({ telefone }));
    }
    if (text.includes('FROM public.lojas')) return lojas;
    if (text.includes('FROM public.validade_products')) {
      const loja = Number((params as unknown[] | undefined)?.[1]);
      return rowsPorLoja[loja] ?? rows;
    }
    return [];
  });
  createSqlMock.mockReturnValue(sql);
  return sql;
}

beforeEach(() => {
  authenticateMock.mockReset();
  createSqlMock.mockReset();
  configMock.mockReset();
  sendMock.mockReset();
  configMock.mockReturnValue({ ...CONFIG });
  sendMock.mockResolvedValue({
    results: [{ to: '5511999999999', ok: true }],
    enviados: 1,
    falhas: 0,
  });
  process.env.CRON_SECRET = 'segredo';
});

describe('canSendWhatsapp', () => {
  it('libera só admin (o encarregado não dispara o alerta)', () => {
    expect(canSendWhatsapp('admin')).toBe(true);
    expect(canSendWhatsapp('encarregado')).toBe(false);
    expect(canSendWhatsapp('user')).toBe(false);
    expect(canSendWhatsapp('enc_flv')).toBe(false);
    expect(canSendWhatsapp(null)).toBe(false);
  });
});

describe('GET /api/manage-validade (cron)', () => {
  it('responde 503 quando o CRON_SECRET não está configurado', async () => {
    process.env.CRON_SECRET = '';
    installSql();
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ method: 'GET' }), res);

    expect(state.status).toBe(503);
    expect(String(state.body?.error)).toContain('CRON_SECRET');
  });

  it('recusa chamada sem o segredo correto', async () => {
    installSql();
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ method: 'GET', headers: { authorization: 'Bearer outro' } }), res);

    expect(state.status).toBe(401);
  });

  it('responde 503 quando a integração está desabilitada', async () => {
    configMock.mockReturnValue({ ...CONFIG, enabled: false });
    installSql();
    const { res, state } = fakeResponse();

    await handler(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo' },
    }), res);

    expect(state.status).toBe(503);
  });

  it('não reenvia quando o slot do dia já foi reservado', async () => {
    installSql({ claim: false });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo', 'x-vercel-cron-schedule': '0 10 * * *' },
    }), res);

    expect(state.status).toBe(200);
    expect(state.body?.skipped).toBe('slot já enviado');
    expect(state.body?.slot).toBe('manha');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('não envia nada quando não há produtos no período', async () => {
    installSql({ rows: [] });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo', 'x-vercel-cron-schedule': '0 16 * * *' },
    }), res);

    expect(state.status).toBe(200);
    expect(state.body?.skipped).toBe('sem produtos vencendo');
    expect(state.body?.slot).toBe('tarde');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('envia e registra o resultado do slot', async () => {
    const sql = installSql({
      rows: [{ descricao: 'ARROZ 5KG', quantidade: 3, validade: AMANHA, status: true, motivo: null }],
    });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo', 'x-vercel-cron-schedule': '0 10 * * *' },
    }), res);

    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ ok: true, slot: 'manha', total: 1, enviados: 1, falhas: 0 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const update = sql.mock.calls.find((call) => sqlText(call[0]).includes('UPDATE public.whatsapp_envios'));
    expect(update).toBeTruthy();
  });

  it('aceita o slot explícito na query (teste manual do cron)', async () => {
    installSql({ rows: [] });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo' },
      query: { slot: 'tarde' },
    }), res);

    expect(state.body?.slot).toBe('tarde');
  });

  it('com ?dry=1 mostra a mensagem sem reservar o slot nem enviar', async () => {
    const sql = installSql({
      rows: [{ descricao: 'ARROZ 5KG', quantidade: 3, validade: AMANHA, status: true, motivo: null }],
    });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo', 'x-vercel-cron-schedule': '0 10 * * *' },
      query: { dry: '1' },
    }), res);

    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ ok: true, dryRun: true, slot: 'manha', total: 1 });
    expect(String(state.body?.summary)).toContain('1 vence em até 4 dias');
    expect(sendMock).not.toHaveBeenCalled();
    const insert = sql.mock.calls.find((call) => sqlText(call[0]).includes('INSERT INTO public.whatsapp_envios'));
    expect(insert).toBeFalsy();
  });
});

describe('POST /api/manage-validade (whatsapp_*)', () => {
  it('bloqueia papéis sem permissão', async () => {
    authenticateMock.mockReturnValue({ sub: 'fulano', role: 'user' });
    installSql();
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'config' } }), res);

    expect(state.status).toBe(403);
  });

  it('devolve a configuração com os números mascarados', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin' });
    installSql();
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'config' } }), res);

    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({
      enabled: true,
      recipientsCount: 1,
      template: 'alerta_validade_sgs',
      schedule: ['07:00', '13:00'],
    });
    expect((state.body?.recipients as string[])[0]).toBe('5511*****9999');
  });

  it('monta a prévia sem enviar', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin' });
    installSql({
      rows: [{ descricao: 'ARROZ 5KG', quantidade: 3, validade: AMANHA, status: true, motivo: null }],
    });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'preview' } }), res);

    expect(state.status).toBe(200);
    expect(state.body?.total).toBe(1);
    expect(String(state.body?.summary)).toContain('1 vence em até 4 dias');
    expect(String(state.body?.list)).toContain('ARROZ 5KG');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('recusa o envio manual quando a integração está desabilitada', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin' });
    configMock.mockReturnValue({ ...CONFIG, enabled: false });
    installSql();
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'send' } }), res);

    expect(state.status).toBe(503);
  });

  it('envia manualmente e registra no histórico', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin' });
    const sql = installSql({
      rows: [{ descricao: 'ARROZ 5KG', quantidade: 3, validade: AMANHA, status: true, motivo: null }],
    });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'send' } }), res);

    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ ok: true, total: 1, enviados: 1, falhas: 0 });
    const manual = sql.mock.calls.find((call) => sqlText(call[0]).includes("'manual'"));
    expect(manual).toBeTruthy();
  });

  it('não envia nada no modo manual quando não há produtos no período', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin' });
    installSql({ rows: [] });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'send' } }), res);

    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({
      ok: true,
      skipped: 'sem produtos vencendo',
      total: 0,
      enviados: 0,
      falhas: 0,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('lista os últimos envios', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin' });
    installSql({
      history: [{ slot: 'manha', dia: '2026-11-10', total: 3, enviados: 1, falhas: 0 }],
    });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'history' } }), res);

    expect(state.status).toBe(200);
    expect(state.body?.items).toHaveLength(1);
  });

  it('recusa ação desconhecida', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin' });
    installSql();
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'apagar' } }), res);

    expect(state.status).toBe(400);
  });
});

describe('WhatsApp por loja', () => {
  it('envia o alerta de cada loja separadamente (cron)', async () => {
    installSql({
      lojas: [
        { codigo: 103, nome: 'Loja 103', ativo: true },
        { codigo: 92, nome: 'Loja 92', ativo: true },
      ],
      rowsPorLoja: {
        103: [{ descricao: 'ARROZ 5KG', quantidade: 3, validade: AMANHA, status: true, motivo: null }],
        92: [{ descricao: 'FEIJA 1KG', quantidade: 2, validade: AMANHA, status: true, motivo: null }],
      },
      destinatarios: { 103: ['5511999999999'], 92: ['5511888888888'] },
    });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo', 'x-vercel-cron-schedule': '0 10 * * *' },
    }), res);

    expect(state.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2);
    // Cada loja recebe só os números e os produtos dela.
    expect(sendMock.mock.calls[0][0]).toEqual(['5511999999999']);
    expect(sendMock.mock.calls[1][0]).toEqual(['5511888888888']);
    expect(state.body?.total).toBe(2);
  });

  it('usa os destinatários cadastrados da loja', async () => {
    installSql({
      lojas: [{ codigo: 103, nome: 'Loja 103', ativo: true }],
      rows: [{ descricao: 'ARROZ 5KG', quantidade: 3, validade: AMANHA, status: true, motivo: null }],
      destinatarios: { 103: ['5511999999999'] },
    });
    const { res } = fakeResponse();

    await handler(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo', 'x-vercel-cron-schedule': '0 10 * * *' },
    }), res);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toEqual(['5511999999999']);
  });

  it('a prévia da tela mostra só os produtos da loja do token', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin', loja: 92 });
    installSql({
      rowsPorLoja: {
        103: [{ descricao: 'ARROZ 5KG', quantidade: 3, validade: AMANHA, status: true, motivo: null }],
        92: [{ descricao: 'FEIJA 1KG', quantidade: 2, validade: AMANHA, status: true, motivo: null }],
      },
      destinatarios: { 92: ['5511888888888'] },
    });
    const { res, state } = fakeResponse();

    await handler(fakeRequest({ body: { action: 'preview' } }), res);

    expect(state.body?.loja).toBe(92);
    expect(state.body?.total).toBe(1);
    expect(String(state.body?.list)).toContain('FEIJA 1KG');
    expect(String(state.body?.list)).not.toContain('ARROZ 5KG');
  });
});

describe('delegação em api/manage-validade', () => {
  it('encaminha o GET do cron para o WhatsApp', async () => {
    installSql({ claim: false });
    const { res, state } = fakeResponse();

    await manageValidade(fakeRequest({
      method: 'GET',
      headers: { authorization: 'Bearer segredo', 'x-vercel-cron-schedule': '0 10 * * *' },
    }), res);

    expect(state.status).toBe(200);
    expect(state.body?.skipped).toBe('slot já enviado');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('encaminha as ações whatsapp_* para o endpoint', async () => {
    authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin' });
    installSql();
    const { res, state } = fakeResponse();

    await manageValidade(fakeRequest({ body: { action: 'whatsapp_config' } }), res);

    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ enabled: true, recipientsCount: 1 });
  });
});
