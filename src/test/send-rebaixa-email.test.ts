import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailMessage } from '../../api/_lib/mailer';

const { authenticateMock, sendMailMock, mailerConfigMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  sendMailMock: vi.fn(async (_message: MailMessage) => undefined),
  mailerConfigMock: vi.fn(() => ({
    provider: 'resend' as 'resend' | 'smtp' | null,
    from: 'rebaixa@empresa.com',
    defaultTo: 'comercial@empresa.com',
  })),
}));

vi.mock('../../api/_lib/auth', () => ({ authenticate: authenticateMock }));
vi.mock('../../api/_lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/mailer')>();
  return { ...actual, sendMail: sendMailMock, mailerConfig: mailerConfigMock };
});

import handler, {
  attachmentName,
  canSendRebaixaEmail,
  decodeAttachment,
  defaultSubject,
} from '../../api/send-rebaixa-email';

/** Resposta falsa da Serverless Function, com o estado capturado. */
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
        ? (JSON.parse(payload) as Record<string, unknown>)
        : (payload as Record<string, unknown>);
    },
  };
  return { res, state };
}

function request(body: Record<string, unknown>, method = 'POST') {
  return { method, headers: {}, body };
}

const odsBase64 = Buffer.from('conteudo-da-planilha').toString('base64');

beforeEach(() => {
  authenticateMock.mockReset();
  authenticateMock.mockReturnValue({ sub: 'admin', role: 'admin', exp: 0 });
  sendMailMock.mockClear();
  mailerConfigMock.mockReturnValue({
    provider: 'resend',
    from: 'rebaixa@empresa.com',
    defaultTo: 'comercial@empresa.com',
  });
});

describe('helpers do endpoint de e-mail', () => {
  it('monta o assunto padrão com a data', () => {
    expect(defaultSubject(new Date(2026, 10, 4))).toBe(
      'Solicitação de rebaixa / perecíveis — 04/11/2026',
    );
  });

  it('aceita apenas nomes de planilha seguros', () => {
    expect(attachmentName('solicitacao-rebaixa-2026-11-04.ods')).toBe(
      'solicitacao-rebaixa-2026-11-04.ods',
    );
    expect(attachmentName('rebaixa.csv')).toBe('rebaixa.csv');
    expect(attachmentName('rebaixa.txt')).toBeNull();
    expect(attachmentName('../../etc/passwd.ods')).toBeNull();
    expect(attachmentName('rebaixa.ods"')).toBeNull();
    expect(attachmentName(null)).toBeNull();
  });

  it('decodifica o anexo em base64', () => {
    expect(decodeAttachment(odsBase64)?.toString('utf8')).toBe('conteudo-da-planilha');
  });

  it('recusa conteúdo que não é base64', () => {
    expect(decodeAttachment('não é base64!')).toBeNull();
    expect(decodeAttachment('')).toBeNull();
    expect(decodeAttachment(123)).toBeNull();
  });

  it('recusa anexos acima do limite', () => {
    const grande = Buffer.alloc(2048, 1).toString('base64');
    expect(decodeAttachment(grande, 1024)).toBeNull();
  });
});

describe('endpoint de envio por e-mail', () => {
  it('devolve a configuração do servidor', async () => {
    const { res, state } = fakeResponse();
    await handler(request({ action: 'config' }), res);

    expect(state.status).toBe(200);
    expect(state.body).toEqual({
      enabled: true,
      provider: 'resend',
      defaultTo: 'comercial@empresa.com',
    });
  });

  it('avisa quando o servidor não tem provedor configurado', async () => {
    mailerConfigMock.mockReturnValue({ provider: null, from: null, defaultTo: null });
    const { res, state } = fakeResponse();
    await handler(request({ action: 'config' }), res);

    expect(state.body).toMatchObject({ enabled: false, provider: null });
  });

  it('recusa quem não é administrador', async () => {
    authenticateMock.mockReturnValue({ sub: 'user', role: 'user', exp: 0 });
    const { res, state } = fakeResponse();
    await handler(request({ action: 'send' }), res);

    expect(state.status).toBe(403);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('permite o encarregado enviar a planilha', async () => {
    authenticateMock.mockReturnValue({ sub: 'encarregado', role: 'encarregado', exp: 0 });
    const { res, state } = fakeResponse();
    await handler(
      request({
        action: 'send',
        to: 'comercial@empresa.com',
        filename: 'rebaixa.ods',
        contentBase64: odsBase64,
        itens: 2,
      }),
      res,
    );

    expect(state.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('recusa enc. flv no envio por e-mail', async () => {
    authenticateMock.mockReturnValue({ sub: 'flv', role: 'enc_flv', exp: 0 });
    const { res, state } = fakeResponse();
    await handler(request({ action: 'send' }), res);

    expect(state.status).toBe(403);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('reconhece apenas admin e encarregado como remetentes', () => {
    expect(canSendRebaixaEmail('admin')).toBe(true);
    expect(canSendRebaixaEmail('encarregado')).toBe(true);
    expect(canSendRebaixaEmail('enc_flv')).toBe(false);
    expect(canSendRebaixaEmail('user')).toBe(false);
    expect(canSendRebaixaEmail(undefined)).toBe(false);
  });

  it('envia a planilha com o anexo em base64', async () => {
    const { res, state } = fakeResponse();
    await handler(
      request({
        action: 'send',
        to: 'comercial@empresa.com',
        subject: 'Solicitação de rebaixa / perecíveis — 04/11/2026',
        text: 'Segue a planilha de rebaixa com 12 produto(s)',
        filename: 'solicitacao-rebaixa-2026-11-04.ods',
        contentBase64: odsBase64,
        itens: 12,
      }),
      res,
    );

    expect(state.status).toBe(200);
    expect(state.body).toEqual({
      ok: true,
      to: 'comercial@empresa.com',
      filename: 'solicitacao-rebaixa-2026-11-04.ods',
      itens: 12,
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0][0];
    expect(sent.to).toBe('comercial@empresa.com');
    expect(sent.subject).toBe('Solicitação de rebaixa / perecíveis — 04/11/2026');
    expect(sent.text).toBe('Segue a planilha de rebaixa com 12 produto(s)');
    expect(sent.attachment.filename).toBe('solicitacao-rebaixa-2026-11-04.ods');
    expect(sent.attachment.contentType).toBe('application/vnd.oasis.opendocument.spreadsheet');
    expect(Buffer.from(sent.attachment.content).toString('utf8')).toBe('conteudo-da-planilha');
  });

  it('usa o destinatário padrão do servidor quando o cliente não informa', async () => {
    const { res, state } = fakeResponse();
    await handler(
      request({
        action: 'send',
        filename: 'rebaixa.ods',
        contentBase64: odsBase64,
        itens: 3,
      }),
      res,
    );

    expect(state.status).toBe(200);
    expect(sendMailMock.mock.calls[0][0].to).toBe('comercial@empresa.com');
  });

  it('recusa destinatário inválido', async () => {
    const { res, state } = fakeResponse();
    await handler(
      request({ action: 'send', to: 'nao-e-email', filename: 'rebaixa.ods', contentBase64: odsBase64 }),
      res,
    );

    expect(state.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('recusa arquivo que não é planilha', async () => {
    const { res, state } = fakeResponse();
    await handler(
      request({ action: 'send', filename: 'rebaixa.exe', contentBase64: odsBase64 }),
      res,
    );

    expect(state.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('recusa anexo inválido', async () => {
    const { res, state } = fakeResponse();
    await handler(
      request({ action: 'send', filename: 'rebaixa.ods', contentBase64: '%%%' }),
      res,
    );

    expect(state.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('responde 503 quando o envio não está configurado', async () => {
    mailerConfigMock.mockReturnValue({ provider: null, from: null, defaultTo: null });
    const { res, state } = fakeResponse();
    await handler(
      request({ action: 'send', filename: 'rebaixa.ods', contentBase64: odsBase64 }),
      res,
    );

    expect(state.status).toBe(503);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('recusa requisições que não sejam POST', async () => {
    const { res, state } = fakeResponse();
    await handler(request({}, 'GET'), res);

    expect(state.status).toBe(405);
  });
});
