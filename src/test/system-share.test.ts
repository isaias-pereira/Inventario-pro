import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserBlocksFileShare,
  fileExtension,
  isChromiumBrowser,
  shareFileWithSystem,
} from '../lib/system-share';

/** Simula um navegador Chromium (Chrome/Samsung Internet no Android). */
function setChromium(brand = 'Chromium'): void {
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: true,
    value: { brands: [{ brand }, { brand: 'Not)A;Brand' }] },
  });
}

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'userAgentData');
});

describe('detecção do navegador', () => {
  it('identifica o Chromium pelas marcas do UA-CH', () => {
    setChromium('Google Chrome');
    expect(isChromiumBrowser()).toBe(true);
  });

  it('identifica o Chromium pela string do agente do usuário', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36');
    expect(isChromiumBrowser()).toBe(true);
  });

  it('não confunde o Firefox com o Chromium', () => {
    setUserAgent('Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0');
    expect(isChromiumBrowser()).toBe(false);
  });

  it('extrai a extensão do arquivo', () => {
    expect(fileExtension('solicitacao-rebaixa-2026-10-05.ods')).toBe('ods');
    expect(fileExtension('relatorio.PDF')).toBe('pdf');
    expect(fileExtension('sem-extensao')).toBe('');
  });
});

describe('tipos de arquivo aceitos na folha de compartilhamento', () => {
  it('o Chromium recusa anexar a planilha .ods', () => {
    setChromium('Google Chrome');
    expect(browserBlocksFileShare('solicitacao-rebaixa-2026-10-05.ods')).toBe(true);
  });

  it('o Chromium aceita o PDF', () => {
    setChromium('Google Chrome');
    expect(browserBlocksFileShare('validade-2026-10-05.pdf')).toBe(false);
  });

  it('o Chromium aceita csv, png e mp4', () => {
    setChromium('Google Chrome');
    expect(browserBlocksFileShare('rebaixa.csv')).toBe(false);
    expect(browserBlocksFileShare('foto.png')).toBe(false);
    expect(browserBlocksFileShare('video.mp4')).toBe(false);
  });

  it('fora do Chromium não há bloqueio conhecido', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1');
    expect(browserBlocksFileShare('solicitacao-rebaixa-2026-10-05.ods')).toBe(false);
  });
});

describe('compartilhamento com o sistema', () => {
  it('devolve shared quando a folha do sistema aceita o arquivo', async () => {
    const share = vi.fn(async (_data?: ShareData) => undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });

    const file = new File([new Uint8Array([1, 2, 3])], 'validade.pdf', { type: 'application/pdf' });
    await expect(shareFileWithSystem(file, { title: 'Assunto', text: 'Corpo' })).resolves.toBe('shared');

    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files?.[0].name).toBe('validade.pdf');
    expect(data.title).toBe('Assunto');
    expect(data.text).toBe('Corpo');
  });

  it('devolve cancelled quando o usuário fecha a folha', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn(async () => {
        throw new DOMException('Cancelado', 'AbortError');
      }),
    });

    const file = new File([new Uint8Array([1])], 'validade.pdf', { type: 'application/pdf' });
    await expect(shareFileWithSystem(file)).resolves.toBe('cancelled');
  });

  it('devolve blocked quando o navegador recusa o anexo', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn(async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      }),
    });

    const file = new File([new Uint8Array([1])], 'validade.ods', { type: 'application/vnd.oasis.opendocument.spreadsheet' });
    await expect(shareFileWithSystem(file)).resolves.toBe('blocked');
  });

  it('devolve unavailable quando o aparelho não tem Web Share API', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });

    const file = new File([new Uint8Array([1])], 'validade.pdf', { type: 'application/pdf' });
    await expect(shareFileWithSystem(file)).resolves.toBe('unavailable');
  });
});
