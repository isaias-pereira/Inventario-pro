import { afterEach, describe, expect, it, vi } from 'vitest';

const { createTransportMock, sendMailMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(async () => ({ messageId: 'abc' })),
}));

vi.mock('nodemailer', () => ({
  createTransport: createTransportMock,
}));

import {
  buildResendPayload,
  mailerConfig,
  sendMail,
  sendViaResend,
  sendViaSmtp,
  validateRecipients,
  type MailConfig,
  type MailMessage,
} from '../../api/_lib/mailer';

const config: MailConfig = {
  provider: 'resend',
  from: 'rebaixa@empresa.com',
  defaultTo: 'comercial@empresa.com',
};

const message: MailMessage = {
  to: 'comercial@empresa.com',
  subject: 'Solicitação de rebaixa / perecíveis — 04/11/2026',
  text: 'Segue a planilha de rebaixa com 12 produto(s)',
};

const envKeys = [
  'RESEND_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'REBAIXA_EMAIL_FROM',
  'REBAIXA_EMAIL_TO',
];

/** Limpa as variáveis de e-mail do ambiente (e devolve o estado anterior). */
function clearMailEnv(): void {
  for (const key of envKeys) delete process.env[key];
}

afterEach(() => {
  clearMailEnv();
  vi.restoreAllMocks();
  createTransportMock.mockReset();
  sendMailMock.mockReset();
});

describe('configuração do e-mail', () => {
  it('usa o Resend quando há RESEND_API_KEY', () => {
    expect(mailerConfig({ RESEND_API_KEY: 're_123' })).toEqual({
      provider: 'resend',
      from: null,
      defaultTo: null,
    });
  });

  it('usa o SMTP quando há SMTP_HOST', () => {
    expect(mailerConfig({ SMTP_HOST: 'smtp.empresa.com' }).provider).toBe('smtp');
  });

  it('prefere o Resend quando os dois provedores estão configurados', () => {
    expect(mailerConfig({ RESEND_API_KEY: 're_123', SMTP_HOST: 'smtp.empresa.com' }).provider)
      .toBe('resend');
  });

  it('fica indisponível sem nenhum provedor', () => {
    expect(mailerConfig({}).provider).toBeNull();
  });

  it('lê o remetente e o destinatário padrão', () => {
    expect(
      mailerConfig({
        RESEND_API_KEY: 're_123',
        REBAIXA_EMAIL_FROM: 'rebaixa@empresa.com',
        REBAIXA_EMAIL_TO: 'comercial@empresa.com',
      }),
    ).toEqual({
      provider: 'resend',
      from: 'rebaixa@empresa.com',
      defaultTo: 'comercial@empresa.com',
    });
  });
});

describe('validação dos destinatários', () => {
  it('aceita um e-mail simples', () => {
    expect(validateRecipients('comercial@empresa.com')).toEqual(['comercial@empresa.com']);
  });

  it('aceita listas separadas por vírgula e ponto e vírgula', () => {
    expect(validateRecipients('a@empresa.com; b@empresa.com, c@empresa.com')).toEqual([
      'a@empresa.com',
      'b@empresa.com',
      'c@empresa.com',
    ]);
  });

  it('aceita o formato com nome', () => {
    expect(validateRecipients('Comercial <comercial@empresa.com>')).toEqual([
      'Comercial <comercial@empresa.com>',
    ]);
  });

  it('recusa e-mail inválido', () => {
    expect(validateRecipients('comercial@')).toBeNull();
    expect(validateRecipients('comercial empresa.com')).toBeNull();
    expect(validateRecipients('comercial@empresa')).toBeNull();
  });

  it('recusa lista vazia', () => {
    expect(validateRecipients('')).toBeNull();
    expect(validateRecipients('   ')).toBeNull();
    expect(validateRecipients(null)).toBeNull();
  });
});

describe('payload do Resend', () => {
  it('converte o anexo em base64', () => {
    const payload = buildResendPayload(
      {
        ...message,
        attachment: {
          filename: 'rebaixa.ods',
          contentType: 'application/vnd.oasis.opendocument.spreadsheet',
          content: new Uint8Array([1, 2, 3]),
        },
      },
      config,
    ) as {
      from: string;
      to: string[];
      attachments: { filename: string; content: string }[];
    };

    expect(payload.from).toBe('rebaixa@empresa.com');
    expect(payload.to).toEqual(['comercial@empresa.com']);
    expect(payload.attachments[0].filename).toBe('rebaixa.ods');
    expect(payload.attachments[0].content).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('separa a lista de destinatários', () => {
    const payload = buildResendPayload(
      { ...message, to: 'a@empresa.com, b@empresa.com' },
      config,
    ) as { to: string[] };

    expect(payload.to).toEqual(['a@empresa.com', 'b@empresa.com']);
  });
});

describe('envio pelo Resend', () => {
  it('chama a API com o token e o anexo', async () => {
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) =>
      new Response('{"id":"abc"}', { status: 200 }),
    );

    await sendViaResend(
      {
        ...message,
        attachment: {
          filename: 'rebaixa.ods',
          contentType: 'application/vnd.oasis.opendocument.spreadsheet',
          content: new Uint8Array([1, 2, 3]),
        },
      },
      config,
      fetchMock as unknown as typeof fetch,
      're_123',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer re_123');
    const body = JSON.parse(String(options.body));
    expect(body.subject).toBe(message.subject);
    expect(body.attachments[0].content).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('relata a recusa do provedor', async () => {
    const fetchMock = vi.fn(async () => new Response('dominio nao verificado', { status: 422 }));

    await expect(
      sendViaResend(message, config, fetchMock as unknown as typeof fetch, 're_123'),
    ).rejects.toThrow(/recusou o envio \(422\)/);
  });

  it('exige a chave da API', async () => {
    await expect(
      sendViaResend(message, config, (async () => new Response('')) as unknown as typeof fetch, ''),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('exige o remetente', async () => {
    await expect(
      sendViaResend(
        message,
        { ...config, from: null },
        (async () => new Response('')) as unknown as typeof fetch,
        're_123',
      ),
    ).rejects.toThrow(/REBAIXA_EMAIL_FROM/);
  });
});

describe('envio pelo servidor', () => {
  it('avisa quando o envio não está configurado', async () => {
    clearMailEnv();
    await expect(sendMail(message)).rejects.toThrow(/não está configurado no servidor/);
  });

  it('manda para o Resend quando ele está configurado', async () => {
    process.env.RESEND_API_KEY = 're_123';
    process.env.REBAIXA_EMAIL_FROM = 'rebaixa@empresa.com';
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) =>
      new Response('{"id":"abc"}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendMail(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('envio por SMTP', () => {
  it('conecta no servidor configurado e anexa a planilha', async () => {
    process.env.SMTP_HOST = 'mail.empresa.com.br';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'rebaixa@empresa.com.br';
    process.env.SMTP_PASS = 'senha-secreta';
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });

    await sendViaSmtp(
      {
        ...message,
        attachment: {
          filename: 'rebaixa.ods',
          contentType: 'application/vnd.oasis.opendocument.spreadsheet',
          content: new Uint8Array([1, 2, 3]),
        },
      },
      config,
    );

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'mail.empresa.com.br',
      port: 587,
      secure: false,
      auth: { user: 'rebaixa@empresa.com.br', pass: 'senha-secreta' },
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0][0];
    expect(sent.from).toBe('rebaixa@empresa.com');
    expect(sent.to).toBe('comercial@empresa.com');
    expect(sent.subject).toBe(message.subject);
    expect(sent.text).toBe(message.text);
    expect(sent.attachments[0].filename).toBe('rebaixa.ods');
    expect(sent.attachments[0].contentType).toBe('application/vnd.oasis.opendocument.spreadsheet');
    expect(Buffer.from(sent.attachments[0].content).toString('utf8')).toBe(
      String.fromCharCode(1, 2, 3),
    );
  });

  it('usa TLS direto na porta 465', async () => {
    process.env.SMTP_HOST = 'mail.empresa.com.br';
    process.env.SMTP_PORT = '465';
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });

    await sendViaSmtp(message, config);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it('exige o host do SMTP', async () => {
    clearMailEnv();
    await expect(sendViaSmtp(message, config)).rejects.toThrow(/SMTP_HOST/);
  });

  it('exige o remetente', async () => {
    process.env.SMTP_HOST = 'mail.empresa.com.br';
    await expect(sendViaSmtp(message, { ...config, from: null })).rejects.toThrow(
      /REBAIXA_EMAIL_FROM/,
    );
  });
});
