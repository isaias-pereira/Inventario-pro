/**
 * @vitest-environment jsdom
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValidadeView from '../components/ValidadeView';

const {
  invoke,
  createOds,
  fetchTipos,
  fetchCustos,
  emailConfig,
  sendEmail,
  useAuth,
} = vi.hoisted(() => ({
  invoke: vi.fn(),
  createOds: vi.fn(() => new Uint8Array([1, 2, 3])),
  fetchTipos: vi.fn(async () => ({ '100': 'UN' })),
  fetchCustos: vi.fn(async () => ({ '100': 4.5 })),
  emailConfig: vi.fn(async () => ({
    enabled: true,
    provider: 'resend' as const,
    defaultTo: 'comercial@empresa.com',
  })),
  sendEmail: vi.fn(async (_input: {
    to: string;
    subject: string;
    text: string;
    filename: string;
    content: Uint8Array;
    itens: number;
  }) => ({
    ok: true,
    to: 'comercial@empresa.com',
    filename: 'solicitacao-rebaixa-2026-11-04.ods',
    itens: 1,
  })),
  useAuth: vi.fn(() => ({
    user: { role: 'admin' },
    getToken: () => 'token',
    isAdmin: true,
  })),
}));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validade-tipos', () => ({ fetchProductTipos: fetchTipos }));
vi.mock('@/lib/validade-custos', () => ({ fetchProductCustos: fetchCustos }));
vi.mock('@/lib/validade-email', () => ({
  fetchEmailConfig: emailConfig,
  sendRebaixaEmail: sendEmail,
}));
vi.mock('@/lib/validade-spreadsheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validade-spreadsheet')>();
  return { ...actual, createValidadeOds: createOds };
});

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  createOds.mockClear();
  fetchTipos.mockClear();
  fetchCustos.mockClear();
  emailConfig.mockClear();
  sendEmail.mockClear();
  useAuth.mockReturnValue({
    user: { role: 'admin' },
    getToken: () => 'token',
    isAdmin: true,
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

/** Abre a tela e o diálogo de exportação. */
async function openExportDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<ValidadeView />);
  await screen.findByText('BANANA PRATA');
  await user.click(screen.getByRole('button', { name: 'Exportar lista de validade' }));
  await screen.findByRole('button', { name: /Enviar por e-mail/ });
}

it('envia a planilha .ods por e-mail com assunto e mensagem prontos', async () => {
  const user = userEvent.setup();
  await openExportDialog(user);

  await user.click(screen.getByRole('button', { name: /Enviar por e-mail/ }));

  // O destinatário vem do servidor; assunto e mensagem já vêm preenchidos.
  const to = await screen.findByLabelText('Para');
  await waitFor(() => expect(to).toHaveValue('comercial@empresa.com'));
  expect((screen.getByLabelText('Assunto') as HTMLInputElement).value).toMatch(
    /^Solicitação de rebaixa \/ perecíveis — \d{2}\/\d{2}\/\d{4}$/,
  );
  expect(screen.getByLabelText('Mensagem')).toHaveValue(
    'Segue a planilha de rebaixa com 1 produto(s)',
  );

  await user.click(screen.getByRole('button', { name: 'Enviar' }));

  await waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
  const input = sendEmail.mock.calls[0][0];
  expect(input.to).toBe('comercial@empresa.com');
  expect(input.text).toBe('Segue a planilha de rebaixa com 1 produto(s)');
  expect(input.filename).toMatch(/^solicitacao-rebaixa-\d{4}-\d{2}-\d{2}\.ods$/);
  expect(input.content).toBeInstanceOf(Uint8Array);
  expect(input.itens).toBe(1);
  // A planilha enviada é a mesma do download, com tipos e custos do catálogo.
  expect(createOds).toHaveBeenCalledWith(
    [expect.objectContaining({ codigo: 100, quantidade: 3, descricao: 'BANANA PRATA' })],
    { '100': 'UN' },
    { custos: { '100': 4.5 } },
  );
});

it('avisa quando o servidor não tem e-mail configurado', async () => {
  emailConfig.mockResolvedValue({ enabled: false, provider: null, defaultTo: null });

  const user = userEvent.setup();
  await openExportDialog(user);
  await user.click(screen.getByRole('button', { name: /Enviar por e-mail/ }));

  await screen.findByText(/O envio de e-mail não está configurado no servidor/);
  // Sem destinatário padrão o botão de envio continua desabilitado.
  expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
});

it('esconde a opção de e-mail para quem não é administrador', async () => {
  useAuth.mockReturnValue({
    user: { role: 'encarregado' },
    getToken: () => 'token',
    isAdmin: false,
  });

  const user = userEvent.setup();
  render(<ValidadeView />);
  await screen.findByText('BANANA PRATA');
  await user.click(screen.getByRole('button', { name: 'Exportar lista de validade' }));

  expect(screen.queryByRole('button', { name: /Enviar por e-mail/ })).not.toBeInTheDocument();
});
