/**
 * Tela de Usuários (multi-loja).
 *
 * A lista mostra **apenas os acessos da loja em que o admin está** (a loja do
 * token) e o novo acesso nasce nessa mesma loja — nada de renderizar todos os
 * acessos de todas as lojas.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserManagementView from '../components/UserManagementView';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('@/contexts/AuthContext', () => ({
  // O admin está na loja 82 (vem do token).
  useAuth: () => ({ getToken: () => 'token', loja: 82 }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

interface InvokeOptions {
  body?: { action?: string; newUser?: Record<string, unknown> };
}

const usuarioDaLoja = {
  id: '1',
  username: 'ana',
  role: 'user',
  loja: 82,
  created_at: '2026-01-10T12:00:00.000Z',
};

const lojas = [
  { codigo: 82, nome: 'Loja 82', ativo: true },
  { codigo: 103, nome: 'Loja 103', ativo: true },
];

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  window.localStorage.setItem('estoque_pro_token', 'token');
  invoke.mockImplementation(async (fn: string, opts?: InvokeOptions) => {
    if (fn !== 'manage-users') return { data: {}, error: null };
    const action = opts?.body?.action;
    if (action === 'list') return { data: { users: [usuarioDaLoja] }, error: null };
    if (action === 'list_lojas') return { data: { lojas }, error: null };
    if (action === 'add') return { data: { success: true }, error: null };
    return { data: {}, error: null };
  });
});

function chamadaAdd(): Record<string, unknown> | undefined {
  const call = invoke.mock.calls.find(
    ([fn, opts]: [string, InvokeOptions]) => fn === 'manage-users' && opts?.body?.action === 'add',
  );
  return call?.[1]?.body?.newUser;
}

it('mostra os acessos da loja atual e identifica a loja na tela', async () => {
  render(<UserManagementView />);

  // A versão mobile e a tabela desktop renderizam o mesmo usuário.
  expect((await screen.findAllByText('ana')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Loja 82').length).toBeGreaterThan(0);
  expect(screen.getByText(/Acessos de/)).toBeInTheDocument();
});

it('cria o acesso na loja atual (sem seletor de loja no formulário)', async () => {
  const user = userEvent.setup();
  render(<UserManagementView />);
  await screen.findAllByText('ana');

  await user.type(screen.getByPlaceholderText('Nome de usuário'), 'bruno');
  await user.type(screen.getByPlaceholderText('Senha'), 'senha123');
  await user.click(screen.getByRole('button', { name: 'Adicionar' }));

  await waitFor(() => expect(chamadaAdd()).toBeTruthy());
  expect(chamadaAdd()).toMatchObject({ username: 'bruno', loja: 82 });
});
