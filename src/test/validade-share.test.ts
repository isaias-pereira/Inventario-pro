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

  it('baixa a planilha quando o aparelho não compartilha arquivos', async () => {
    setShareSupport(undefined, undefined);

    await expect(shareValidadeOds(bytes, { date })).resolves.toBe('downloaded');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe(ODS_MIME);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clickedDownload).toBe('solicitacao-rebaixa-2026-10-05.ods');
  });

  it('baixa quando o navegador tem share mas recusa o arquivo', async () => {
    const share = vi.fn(async () => undefined);
    setShareSupport(share, () => false);

    await expect(shareValidadeOds(bytes, { date })).resolves.toBe('downloaded');

    expect(share).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clickedDownload).toBe('solicitacao-rebaixa-2026-10-05.ods');
  });

  it('cai no download quando o compartilhamento falha por falta de gesto', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('Precisa de ativação do usuário', 'NotAllowedError');
    });
    setShareSupport(share, () => true);

    await expect(shareValidadeOds(bytes, { date })).resolves.toBe('downloaded');
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
