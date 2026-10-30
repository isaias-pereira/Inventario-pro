import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValidadeView from '../components/ValidadeView';

const { invoke, save, createOds, saveSpreadsheet, shareOds, fetchTipos, fetchCustos } = vi.hoisted(() => ({
  invoke: vi.fn(),
  save: vi.fn(),
  createOds: vi.fn(() => new Uint8Array([1, 2, 3])),
  saveSpreadsheet: vi.fn(),
  shareOds: vi.fn(async (_bytes: Uint8Array) => 'shared'),
  fetchTipos: vi.fn(async () => ({ '100': 'UN' })),
  fetchCustos: vi.fn(async () => ({ '100': 4.5 })),
}));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' }, getToken: () => 'token', isAdmin: true }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/validade-tipos', () => ({ fetchProductTipos: fetchTipos }));
vi.mock('@/lib/validade-custos', () => ({ fetchProductCustos: fetchCustos }));
vi.mock('@/lib/validade-spreadsheet', () => ({
  createValidadeOds: createOds,
  saveValidadeOds: saveSpreadsheet,
  shareValidadeOds: shareOds,
}));
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
      save,
    };
  }),
}));

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  save.mockReset();
  createOds.mockClear();
  saveSpreadsheet.mockReset();
  shareOds.mockClear();
  fetchTipos.mockClear();
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

  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0]).toMatch(/^validade-\d{4}-\d{2}-\d{2}\.pdf$/);
});

it('exports the expiry list as an ODS spreadsheet', async () => {
  const user = userEvent.setup();
  render(<ValidadeView />);

  await screen.findByText('BANANA PRATA');
  await user.click(screen.getByRole('button', { name: 'Exportar lista de validade' }));

  // A opção de planilha usa o tipo do produto para decidir o vencimento.
  await user.click(await screen.findByRole('button', { name: /Planilha/ }));

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
  expect(createOds).toHaveBeenCalledWith(
    [expect.objectContaining({ codigo: 100, quantidade: 3, descricao: 'BANANA PRATA' })],
    { '100': 'UN' },
    { custos: { '100': 4.5 } },
  );
  // O compartilhamento nativo substitui o download: nada foi baixado.
  expect(saveSpreadsheet).not.toHaveBeenCalled();
});

it('opens the product details when the whole card is clicked', async () => {
  const user = userEvent.setup();
  render(<ValidadeView />);

  await screen.findByText('BANANA PRATA');
  const card = screen.getByRole('button', { name: 'Ver detalhes de BANANA PRATA' });
  await user.click(card);

  expect(await screen.findByText('Detalhes do Produto')).toBeInTheDocument();
  expect(screen.getByText('Registrado por')).toBeInTheDocument();
});
