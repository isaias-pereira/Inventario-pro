import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValidadeView from '../components/ValidadeView';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' }, getToken: () => 'token', isAdmin: true }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/validade-tipos', () => ({ fetchProductTipos: vi.fn(async () => ({})) }));

/**
 * O campo "Dias de antecedência" é livre: o valor pode ser apagado e digitado
 * outro (8, 9, 12…). Se ficar vazio, o padrão aplicado ao salvar é 1 dia.
 */
beforeEach(() => {
  cleanup();
  invoke.mockReset();
  invoke.mockImplementation(async () => ({ data: { items: [] }, error: null }));
  window.localStorage.clear();
});

async function abrirConfig(user: ReturnType<typeof userEvent.setup>) {
  render(<ValidadeView />);
  await user.click(await screen.findByLabelText(/Configurar alerta de validade/));
  return screen.findByLabelText('Dias de antecedência');
}

it('deixa o campo livre: aceita apagar e digitar outro número', async () => {
  const user = userEvent.setup();
  const campo = await abrirConfig(user);

  await user.clear(campo);
  expect(campo).toHaveValue(null);

  await user.type(campo, '9');
  expect(campo).toHaveValue(9);
});

it('salva o número digitado pelo usuário', async () => {
  const user = userEvent.setup();
  const campo = await abrirConfig(user);

  await user.clear(campo);
  await user.type(campo, '8');
  await user.click(screen.getByRole('button', { name: /Salvar/ }));

  await waitFor(() => {
    expect(window.localStorage.getItem('validade_alert_days')).toBe('8');
  });
});

it('usa 1 dia quando o campo fica vazio', async () => {
  const user = userEvent.setup();
  const campo = await abrirConfig(user);

  await user.clear(campo);
  await user.click(screen.getByRole('button', { name: /Salvar/ }));

  await waitFor(() => {
    expect(window.localStorage.getItem('validade_alert_days')).toBe('1');
  });
});

it('não mostra mais o banner de alertas de validade', async () => {
  const hoje = new Date().toISOString();
  invoke.mockImplementation(async () => ({
    data: { items: [{ id: '1', ean: '789', codigo: '123', descricao: 'LEITE', quantidade: 1, validade: hoje }] },
    error: null,
  }));

  render(<ValidadeView />);

  await waitFor(() => expect(invoke).toHaveBeenCalled());
  expect(screen.queryByText(/Alertas de Validade/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Vencem HOJE/i)).not.toBeInTheDocument();
});
