/**
 * Tela de Usuários no modo `encarregado`.
 *
 * O encarregado cadastra a própria equipe: sem seletor de encarregado (o
 * vínculo é automático), sem edição e sem remoção de acessos. A lista traz
 * apenas a equipe (o servidor já filtra).
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserManagementView from '../components/UserManagementView';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('@/contexts/AuthContext', () => ({
  // A Luana é encarregado da loja 103.
  useAuth: () => ({ getToken: () => 'token', loja: 103, userRole: 'encarregado' }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

interface InvokeOptions {
  body?: { action?: string; newUser?: Record<string, unknown> };
}

const membros = [
  {
    id: '1',
    username: 'ana',
    role: 'user',
    loja: 103,
    encarregados: ['Luana'],
    created_at: '2026-01-10T12:00:00.000Z',
  },
  {
    id: '2',
    username: 'bob',
    role: 'promotor',
    loja: 103,
    encarregados: ['Luana'],
    created_at: '2026-01-11T12:00:00.000Z',
  },
];

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  window.localStorage.setItem('estoque_pro_token', 'token');
  invoke.mockImplementation(async (fn: string, opts?: InvokeOptions) => {
    if (fn !== 'manage-users') return { data: {}, error: null };
    const action = opts?.body?.action;
    if (action === 'list') return { data: { users: membros }, error: null };
    if (action === 'list_lojas') {
      return { data: { lojas: [{ codigo: 103, nome: 'Loja 103', ativo: true }] }, error: null };
    }
    if (action === 'list_encarregados') {
      return { data: { encarregados: [{ username: 'Luana', role: 'encarregado', loja: 103 }] }, error: null };
    }
    if (action === 'add') return { data: { success: true, encarregados: ['Luana'] }, error: null };
    return { data: {}, error: null };
  });
});

function chamadaAdd(): Record<string, unknown> | undefined {
  const call = invoke.mock.calls.find(
    ([fn, opts]: [string, InvokeOptions]) => fn === 'manage-users' && opts?.body?.action === 'add',
  );
  return call?.[1]?.body?.newUser;
}

it('mostra a equipe e identifica o encarregado', async () => {
  render(<UserManagementView />);

  expect((await screen.findAllByText('ana')).length).toBeGreaterThan(0);
  expect(screen.getByText('Minha Equipe')).toBeInTheDocument();
  expect(screen.getByText(/já nascem vinculados a você/)).toBeInTheDocument();
});

it('não mostra o seletor de encarregado (o vínculo é automático)', async () => {
  render(<UserManagementView />);
  await screen.findAllByText('ana');

  expect(screen.queryByText(/Encarregado\(s\) responsável\(is\)/)).not.toBeInTheDocument();
  expect(screen.getByText(/O novo acesso fica vinculado a você automaticamente/)).toBeInTheDocument();
});

it('não mostra os botões de editar e remover', async () => {
  const { container } = render(<UserManagementView />);
  await screen.findAllByText('ana');

  const botoes = Array.from(container.querySelectorAll('button'));
  const rotulos = botoes.map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
  expect(rotulos.some((r) => r.includes('Remover') || r.includes('Editar'))).toBe(false);
});

it('cria o usuário sem lista de encarregados (o servidor vincula a ele)', async () => {
  const user = userEvent.setup();
  render(<UserManagementView />);
  await screen.findAllByText('ana');

  await user.type(screen.getByPlaceholderText('Nome de usuário'), 'carla');
  await user.type(screen.getByPlaceholderText('Senha'), 'senha123');
  await user.click(screen.getByRole('button', { name: 'Adicionar' }));

  await waitFor(() => expect(chamadaAdd()).toBeTruthy());
  expect(chamadaAdd()).toMatchObject({ username: 'carla', role: 'user', encarregados: [] });
});

it('só oferece os perfis operacionais no cadastro', async () => {
  const user = userEvent.setup();
  render(<UserManagementView />);
  await screen.findAllByText('ana');

  await user.click(screen.getByRole('combobox'));
  const opcoes = screen.getAllByRole('option').map((o) => o.textContent);
  expect(opcoes).toEqual(['Usuário', 'Promotor', 'Col. Validade']);
});
