import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ODS_MIME, saveValidadeOds, shareValidadeOds } from '../lib/validade-spreadsheet';

const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const date = new Date(2026, 9, 5);

let clickSpy: ReturnType<typeof vi.spyOn>;
let clickedDownload = '';
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

/** Simula o suporte (ou a ausência) do Web Share no aparelho. */
function setShareSupport(
  share?: (data?: ShareData) => Promise<void>,
  canShare?: (data?: ShareData) => boolean,
): void {
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare });
}

beforeEach(() => {
  clickedDownload = '';
  createObjectURL = vi.fn(() => 'blob:rebaixa');
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownload = this.download;
    });
});

afterEach(() => {
  vi.restoreAllMocks();
  setShareSupport(undefined, undefined);
});

describe('compartilhamento da planilha de rebaixa', () => {
  it('envia o .ods pelo compartilhamento nativo do celular', async () => {
    const share = vi.fn(async (_data?: ShareData) => undefined);
    setShareSupport(share, () => true);

    await expect(
      shareValidadeOds(bytes, { date, text: 'Segue a planilha de rebaixa' }),
    ).resolves.toBe('shared');

    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files).toHaveLength(1);
    expect(data.files?.[0].name).toBe('solicitacao-rebaixa-2026-10-05.ods');
    expect(data.files?.[0].type).toBe(ODS_MIME);
    expect(data.title).toBe('Solicitação de rebaixa / perecíveis');
    expect(data.text).toBe('Segue a planilha de rebaixa');
    // Nada é baixado quando a folha de compartilhamento abre.
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('usa o assunto informado como título do compartilhamento', async () => {
    const share = vi.fn(async (_data?: ShareData) => undefined);
    setShareSupport(share, () => true);

    await expect(
      shareValidadeOds(bytes, {
        date,
        subject: 'Solicitação de rebaixa / perecíveis — 05/10/2026',
        text: 'Segue a planilha com 12 produto(s)',
      }),
    ).resolves.toBe('shared');

    const data = share.mock.calls[0][0] as ShareData;
    expect(data.title).toBe('Solicitação de rebaixa / perecíveis — 05/10/2026');
    expect(data.text).toBe('Segue a planilha com 12 produto(s)');
  });

  it('não baixa nada quando o usuário fecha a folha de compartilhamento', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('Cancelado', 'AbortError');
    });
    setShareSupport(share, () => true);

    await expect(shareValidadeOds(bytes, { date })).resolves.toBe('cancelled');
    expect(share).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('informa quando o navegador recusa o arquivo (.ods não é aceito pelo Chrome)', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('File type not supported', 'NotAllowedError');
    });
    setShareSupport(share, () => true);

    await expect(shareValidadeOds(bytes, { date })).resolves.toBe('blocked');
    expect(share).toHaveBeenCalledTimes(1);
    // Não baixa nada: quem oferece o PDF é a tela.
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('tenta o compartilhamento mesmo quando canShare recusa (o Chrome só barra na hora de enviar)', async () => {
    const share = vi.fn(async () => {
      throw new TypeError('Provided value cannot be serialized');
    });
    setShareSupport(share, () => false);

    await expect(shareValidadeOds(bytes, { date })).resolves.toBe('blocked');
    expect(share).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('baixa a planilha quando o aparelho não tem compartilhamento', async () => {
    setShareSupport(undefined, undefined);

    await expect(shareValidadeOds(bytes, { date })).resolves.toBe('downloaded');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe(ODS_MIME);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clickedDownload).toBe('solicitacao-rebaixa-2026-10-05.ods');
  });

  it('o download direto usa o MIME e o nome datado do OpenDocument', () => {
    saveValidadeOds(bytes, date);

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe(ODS_MIME);
    expect(clickedDownload).toBe('solicitacao-rebaixa-2026-10-05.ods');
  });
});
