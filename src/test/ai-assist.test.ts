/**
 * A Function de IA (`api/ai-assist.ts`) precisa se comportar bem **sem** a IA
 * configurada: é o cenário de produção até a chave entrar na Vercel.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import handler from '../../api/ai-assist';
import { signJwt } from '../../api/_lib/jwt';

const SECRET = 'segredo-de-teste';

function tokenFor(role: string): string {
  return signJwt({ sub: 'teste', role, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
}

function makeRes() {
  const state = { status: 200, payload: null as unknown };
  const res = {
    status(code: number) { state.status = code; return res; },
    setHeader() { /* sem headers nos testes */ },
    json(payload: unknown) { state.payload = payload; },
    // A Function responde com JSON serializado (sendJson).
    end(payload?: unknown) {
      if (typeof payload === 'string') {
        try { state.payload = JSON.parse(payload); } catch { state.payload = payload; }
      } else if (payload !== undefined) {
        state.payload = payload;
      }
    },
  };
  return { res, state };
}

async function call(body: Record<string, unknown>, role = 'admin') {
  const { res, state } = makeRes();
  await handler(
    { method: 'POST', headers: { authorization: `Bearer ${tokenFor(role)}` }, body },
    res,
  );
  return state;
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  delete process.env.AI_API_KEY;
});

afterEach(() => {
  delete process.env.AI_API_KEY;
});

describe('Function de IA', () => {
  it('avisa que a IA está desligada (sem quebrar o app)', async () => {
    const state = await call({ action: 'config' });
    expect(state.status).toBe(200);
    expect(state.payload).toMatchObject({ enabled: false });
  });

  it('recusa a leitura por foto quando a IA não está configurada', async () => {
    const state = await call({ action: 'read_label', image: 'AAAA', mimeType: 'image/jpeg' });
    expect(state.status).toBe(503);
    expect((state.payload as { error: string }).error).toContain('não está configurada');
  });

  it('recusa a revisão de importação para quem não é admin', async () => {
    process.env.AI_API_KEY = 'chave-de-teste';
    const state = await call({ action: 'import_review', target: 'consulta', headers: ['Código'] }, 'encarregado');
    expect(state.status).toBe(403);
  });

  it('recusa imagem em formato não suportado', async () => {
    process.env.AI_API_KEY = 'chave-de-teste';
    const state = await call({ action: 'read_label', image: 'AAAA', mimeType: 'application/pdf' });
    expect(state.status).toBe(400);
  });

  it('recusa ação desconhecida', async () => {
    const state = await call({ action: 'inventar' });
    expect(state.status).toBe(400);
  });

  it('exige autenticação', async () => {
    const { res, state } = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'config' } }, res);
    expect(state.status).toBe(401);
  });
});
