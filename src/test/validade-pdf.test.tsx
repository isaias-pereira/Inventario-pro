import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValidadeView from '../components/ValidadeView';

const { invoke, save, createOds, saveSpreadsheet, shareOds, fetchTipos, fetchCustos, blocksFileShare, csvBytes } =
  vi.hoisted(() => ({
    invoke: vi.fn(),
    save: vi.fn(),
    createOds: vi.fn(() => new Uint8Array([1, 2, 3])),
    saveSpreadsheet: vi.fn(),
    shareOds: vi.fn(async (_bytes: Uint8Array, _options?: { subject?: string; text?: string }) => 'shared'),
    fetchTipos: vi.fn(async () => ({ '100': 'UN' })),
    fetchCustos: vi.fn(async () => ({ '100': 4.5 })),
    blocksFileShare: vi.fn(() => false),
    csvBytes: vi.fn(),
  }));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' }, getToken: () => 'token', isAdmin: true }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validade-tipos', () => ({ fetchProductTipos: fetchTipos }));
vi.mock('@/lib/validade-custos', () => ({ fetchProductCustos: fetchCustos }));
// O módulo real é usado; só as funções de arquivo são controladas.
vi.mock('@/lib/validade-spreadsheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validade-spreadsheet')>();
  return {
    ...actual,
    createValidadeOds: createOds,
    saveValidadeOds: saveSpreadsheet,
    shareValidadeOds: shareOds,
  };
});
// O módulo real é usado; só a detecção do bloqueio do .ods é controlada.
vi.mock('@/lib/system-share', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/system-share')>();
  return { ...actual, browserBlocksFileShare: blocksFileShare };
});
// O CSV real é usado; os bytes gerados ficam guardados para a verificação.
vi.mock('@/lib/validade-csv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validade-csv')>();
  return {
    ...actual,
    createValidadeCsv: (...args: Parameters<typeof actual.createValidadeCsv>) => {
      const bytes = actual.createValidadeCsv(...args);
      csvBytes(bytes);
      return bytes;
    },
  };
});
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function jsPDF() {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      setFillColor: vi.fn(),
      rect: vi.fn(),
      setTextColor: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      text: vi.fn(),
      splitTextToSize: (value: string) => [value],
      addPage: vi.fn(),
      setPage: vi.fn(),
      getNumberOfPages: () => 1,
      output: () => new ArrayBuffer(16),
      save,
    };
  }),
}));

let clickedDownload = '';

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  save.mockReset();
  createOds.mockClear();
  saveSpreadsheet.mockReset();
  shareOds.mockClear();
  fetchTipos.mockClear();
  fetchCustos.mockClear();
  blocksFileShare.mockReturnValue(false);
  csvBytes.mockClear();
  clickedDownload = '';
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:pdf'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedDownload = this.download;
  });
  window.localStorage.setItem('estoque_pro_token', 'token');
  invoke.mockResolvedValue({
    data: {
      items: [
        {
          id: '1',
          ean: 7891234,
          codigo: 100,
          descricao: 'BANANA PRATA',
          validade: new Date(Date.now() + 5 * 86400000).toISOString(),
          status: true,
          created_by: 'admin',
          quantidade: 3,
        },
      ],
    },
  });
});

it('downloads the expiry list as a PDF', async () => {
  const user = userEvent.setup();
  render(<ValidadeView />);

  await screen.findByText('BANANA PRATA');
  await user.click(screen.getByRole('button', { name: 'Exportar lista de validade' }));

  // O botão de exportar abre a escolha entre planilha e PDF.
  await user.click(await screen.findByRole('button', { name: /PDF/ }));

  await waitFor(() => expect(clickedDownload).toMatch(/^validade-\d{4}-\d{2}-\d{2}\.pdf$/));
});

it('exports the expiry list as an ODS spreadsheet', async () => {
  const user = userEvent.setup();
  render(<ValidadeView />);

  await screen.findByText('BANANA PRATA');
  await user.click(screen.getByRole('button', { name: 'Exportar lista de validade' }));

  // A opção de planilha usa o tipo do produto para decidir o vencimento.
  await user.click(await screen.findByRole('button', { name: /Planilha \(ODS\)/ }));

  await waitFor(() => expect(saveSpreadsheet).toHaveBeenCalledTimes(1));
  expect(fetchTipos).toHaveBeenCalledWith(['100'], 'token');
  // O custo (PMZ) é buscado junto com o tipo para preencher a planilha.
  expect(fetchCustos).toHaveBeenCalledWith(['100'], 'token');
  expect(createOds).toHaveBeenCalledWith(
    [expect.objectContaining({ codigo: 100, quantidade: 3, descricao: 'BANANA PRATA' })],
    { '100': 'UN' },
    { custos: { '100': 4.5 } },
  );
});

it('shares the ODS through the system share sheet', async () => {
  const user = userEvent.setup();
  render(<ValidadeView />);

  await screen.findByText('BANANA PRATA');
  await user.click(screen.getByRole('button', { name: 'Exportar lista de validade' }));

  // O diálogo prepara tipos e custos ao abrir para o compartilhamento manter o gesto.
  await waitFor(() => expect(fetchCustos).toHaveBeenCalledWith(['100'], 'token'));

  await user.click(await screen.findByRole('button', { name: 'Compartilhar' }));

  await waitFor(() => expect(shareOds).toHaveBeenCalledTimes(1));
  expect(shareOds.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
  // O assunto e o corpo vão preenchidos para o Thunderbird/Gmail no celular.
  expect(shareOds.mock.calls[0][1]).toEqual({
    subject: expect.stringMatching(/^Solicitação de rebaixa \/ perecíveis — \d{2}\/\d{2}\/\d{4}$/),
    text: 'Segue a planilha de rebaixa com 1 produto(s)',
  });
  expect(createOds).toHaveBeenCalledWith(
    [expect.objectContaining({ codigo: 100, quantidade: 3, descricao: 'BANANA PRATA' })],
    { '100': 'UN' },
    { custos: { '100': 4.5 } },
  );
  // O compartilhamento nativo substitui o download: nada foi baixado.
  expect(saveSpreadsheet).not.toHaveBeenCalled();
});

it('shares the CSV when the browser refuses the .ods attachment (Chrome)', async () => {
  blocksFileShare.mockReturnValue(true);
  const share = vi.fn(async (_data?: ShareData) => undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });

  const user = userEvent.setup();
  render(<ValidadeView />);

  await screen.findByText('BANANA PRATA');
  await user.click(screen.getByRole('button', { name: 'Exportar lista de validade' }));
  await waitFor(() => expect(fetchCustos).toHaveBeenCalledWith(['100'], 'token'));

  await user.click(await screen.findByRole('button', { name: 'Compartilhar' }));

  // O .ods não entra: o Chrome recusa o tipo e o app envia o CSV (planilha).
  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  const data = share.mock.calls[0][0] as ShareData;
  expect(data.files).toHaveLength(1);
  expect(data.files?.[0].name).toMatch(/^solicitacao-rebaixa-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(data.files?.[0].type).toBe('text/csv');
  expect(data.title).toMatch(/^Solicitação de rebaixa \/ perecíveis — \d{2}\/\d{2}\/\d{4}$/);
  expect(data.text).toBe('Segue a planilha de rebaixa com 1 produto(s)');
  expect(shareOds).not.toHaveBeenCalled();

  // O conteúdo é a planilha em si (cabeçalho + linha do produto).
  const csv = new TextDecoder('utf-8').decode(csvBytes.mock.calls[0][0]);
  expect(csv).toContain('LOJA;EAN OU BALANÇA;CÓDIGO C5;DESCRIÇÃO');
  expect(csv).toContain('BANANA PRATA');
});

it('opens the product details when the whole card is clicked', async () => {
  const user = userEvent.setup();
  render(<ValidadeView />);

  await screen.findByText('BANANA PRATA');
  const card = screen.getByRole('button', { name: 'Ver detalhes de BANANA PRATA' });
  await user.click(card);

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('BANANA PRATA')).toBeInTheDocument();
  expect(within(dialog).getByText('Registrado por')).toBeInTheDocument();
});
