/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeFunction } = vi.hoisted(() => ({ invokeFunction: vi.fn() }));

vi.mock('../lib/api', () => ({ invokeFunction }));

import { bytesToBase64, fetchEmailConfig, sendRebaixaEmail } from '../lib/validade-email';

beforeEach(() => {
  invokeFunction.mockReset();
});

describe('conversão para base64', () => {
  it('codifica os bytes da planilha', () => {
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });

  it('codifica listas grandes sem estourar a pilha', () => {
    const bytes = new Uint8Array(100_000).fill(65);
    const encoded = bytesToBase64(bytes);

    expect(encoded).toHaveLength(Math.ceil(bytes.length / 3) * 4);
    expect(Buffer.from(encoded, 'base64').length).toBe(bytes.length);
  });

  it('devolve string vazia para lista vazia', () => {
    expect(bytesToBase64(new Uint8Array())).toBe('');
  });
});

describe('configuração de e-mail', () => {
  it('devolve a configuração do servidor', async () => {
    invokeFunction.mockResolvedValue({
      data: {
        enabled: true,
        provider: 'resend',
        defaultTo: 'comercial@empresa.com',
        copyTo: 'isaiassilva@comper.com.br',
      },
      error: null,
    });

    await expect(fetchEmailConfig()).resolves.toEqual({
      enabled: true,
      provider: 'resend',
      defaultTo: 'comercial@empresa.com',
      copyTo: 'isaiassilva@comper.com.br',
    });
    expect(invokeFunction).toHaveBeenCalledWith('send-rebaixa-email', {
      body: { action: 'config' },
    });
  });

  it('normaliza uma resposta incompleta', async () => {
    invokeFunction.mockResolvedValue({ data: {}, error: null });

    await expect(fetchEmailConfig()).resolves.toEqual({
      enabled: false,
      provider: null,
      defaultTo: null,
      copyTo: null,
    });
  });

  it('propaga o erro do servidor', async () => {
    invokeFunction.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'Token inválido ou expirado' },
    });

    await expect(fetchEmailConfig()).rejects.toThrow('Token inválido ou expirado');
  });
});

describe('envio da planilha por e-mail', () => {
  it('manda o anexo em base64 para o servidor', async () => {
    invokeFunction.mockResolvedValue({
      data: {
        ok: true,
        to: 'comercial@empresa.com',
        cc: 'isaiassilva@comper.com.br',
        filename: 'solicitacao-rebaixa-2026-11-04.ods',
        itens: 12,
      },
      error: null,
    });

    const result = await sendRebaixaEmail({
      to: 'comercial@empresa.com',
      subject: 'Solicitação de rebaixa / perecíveis — 04/11/2026',
      text: 'Segue a planilha de rebaixa com 12 produto(s)',
      filename: 'solicitacao-rebaixa-2026-11-04.ods',
      content: new Uint8Array([104, 105]),
      itens: 12,
    });

    expect(result).toEqual({
      ok: true,
      to: 'comercial@empresa.com',
      cc: 'isaiassilva@comper.com.br',
      filename: 'solicitacao-rebaixa-2026-11-04.ods',
      itens: 12,
    });

    const [, options] = invokeFunction.mock.calls[0];
    expect(options.body).toMatchObject({
      action: 'send',
      to: 'comercial@empresa.com',
      filename: 'solicitacao-rebaixa-2026-11-04.ods',
      contentBase64: 'aGk=',
      itens: 12,
    });
  });

  it('lança o erro devolvido pelo servidor', async () => {
    invokeFunction.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'O envio de e-mail não está configurado no servidor',
      },
    });

    await expect(
      sendRebaixaEmail({
        to: 'comercial@empresa.com',
        subject: 'Assunto',
        text: 'Mensagem',
        filename: 'rebaixa.ods',
        content: new Uint8Array([1]),
        itens: 1,
      }),
    ).rejects.toThrow('O envio de e-mail não está configurado no servidor');
  });
});
