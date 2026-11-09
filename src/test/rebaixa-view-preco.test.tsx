/**
 * @vitest-environment jsdom
 *
 * A Rebaixa tem um único preço: o da rebaixa (sugestão de 50% do PMZ).
 * O campo "Preço final da rebaixa" não existe mais — nem na tela, nem no
 * payload enviado ao servidor.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RebaixaView from '../components/RebaixaView';

const { invokeFunction } = vi.hoisted(() => ({ invokeFunction: vi.fn() }));

vi.mock('@/lib/api', () => ({ invokeFunction }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'admin', role: 'admin' },
    userRole: 'admin',
    isAdmin: true,
    getToken: () => 'token',
  }),
}));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ findByCode: () => null }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/components/BarcodeScanner', () => ({ default: () => null }));

const PRODUTO = {
  ean: '7891000315507',
  codigo: '123',
  descricao: 'LEITE INTEGRAL 1L',
  tipo: 'un',
};

const ITEM = {
  id: '6f9619ff-8b86-d011-b42d-00c04fc964ff',
  ean: '7891000315507',
  codigo: '123',
  descricao: 'LEITE INTEGRAL 1L',
  tipo: 'UN' as const,
  validade: '2026-10-30T23:59:59.000Z',
  motivo: null,
  quantidade: 4,
  pmz: 10,
  preco_sugerido: 5,
  preco_final: 5,
  validade_id: null,
  status: 'rascunho',
  secao: 'Bebidas',
};

interface InvokeOptions {
  body?: Record<string, unknown>;
}

/** Respostas da API para a tela da Rebaixa. */
function setupInvoke(items: unknown[] = []) {
  invokeFunction.mockImplementation(async (fn: string, opts?: InvokeOptions) => {
    const body = opts?.body ?? {};
    if (fn === 'query-product') {
      if (body.action === 'costs') return { data: { costs: { '123': 10 } }, error: null };
      if (body.action === 'categorias') return { data: { categorias: [] }, error: null };
      return { data: { found: true, product: PRODUTO }, error: null };
    }
    if (fn === 'manage-rebaixa') {
      if (body.action === 'list') return { data: { items }, error: null };
      if (body.action === 'add_many') return { data: { added: (body.items as unknown[]).length, skipped: 0 }, error: null };
      return { data: {}, error: null };
    }
    return { data: {}, error: null };
  });
}

/** Corpo enviado na action `add_many`. */
function corpoAddMany(): Record<string, unknown> | undefined {
  const call = invokeFunction.mock.calls.find(
    ([fn, opts]: [string, InvokeOptions]) => fn === 'manage-rebaixa' && opts?.body?.action === 'add_many',
  );
  return call?.[1]?.body;
}

/** Corpo enviado na action `update`. */
function corpoUpdate(): Record<string, unknown> | undefined {
  const call = invokeFunction.mock.calls.find(
    ([fn, opts]: [string, InvokeOptions]) => fn === 'manage-rebaixa' && opts?.body?.action === 'update',
  );
  return call?.[1]?.body;
}

/** Input de preço do diálogo (o input que fica logo abaixo do label). */
function inputDoPreco(dialog: HTMLElement): HTMLInputElement {
  const label = within(dialog).getByText('Preço da rebaixa');
  const input = label.parentElement?.querySelector('input');
  if (!input) throw new Error('Input de preço não encontrado');
  return input as HTMLInputElement;
}

beforeEach(() => {
  cleanup();
  invokeFunction.mockReset();
  window.localStorage.setItem('estoque_pro_token', 'token');
});

it('mostra um único campo de preço no diálogo de adicionar', async () => {
  setupInvoke();
  const user = userEvent.setup();
  render(<RebaixaView />);

  await user.click(screen.getAllByRole('button', { name: /Adicionar produto/ })[0]);
  const dialog = await screen.findByRole('dialog');

  await user.type(within(dialog).getByPlaceholderText('Código do produto'), '123');
  await user.click(within(dialog).getByRole('button', { name: 'Buscar' }));

  await within(dialog).findByText('Preço da rebaixa');

  // Não existe mais o campo "Preço final da rebaixa".
  expect(within(dialog).queryByText('Preço final da rebaixa')).not.toBeInTheDocument();
  expect(dialog.textContent).not.toContain('Preço final');

  // O preço já vem preenchido com a sugestão: 50% do PMZ (10 → 5,00).
  expect(inputDoPreco(dialog)).toHaveValue('5,00');
});

it('envia apenas o preço da rebaixa ao adicionar um produto', async () => {
  setupInvoke();
  const user = userEvent.setup();
  render(<RebaixaView />);

  await user.click(screen.getAllByRole('button', { name: /Adicionar produto/ })[0]);
  const dialog = await screen.findByRole('dialog');

  await user.type(within(dialog).getByPlaceholderText('Código do produto'), '123');
  await user.click(within(dialog).getByRole('button', { name: 'Buscar' }));
  await within(dialog).findByText('Preço da rebaixa');

  await user.type(within(dialog).getByPlaceholderText('0'), '6');
  await user.type(within(dialog).getByLabelText('Data de vencimento'), '2026-10-30');

  const preco = inputDoPreco(dialog);
  await user.clear(preco);
  await user.type(preco, '4,50');

  await user.click(within(dialog).getByRole('button', { name: 'Adicionar à lista' }));

  await waitFor(() => expect(corpoAddMany()).toBeDefined());
  const itens = corpoAddMany()?.items as Record<string, unknown>[];
  expect(itens).toHaveLength(1);
  expect(itens[0].preco_sugerido).toBe(4.5);
  expect(itens[0]).not.toHaveProperty('preco_final');
});

it('mostra um único campo de preço no diálogo de editar e atualiza sem preço final', async () => {
  setupInvoke([ITEM]);
  const user = userEvent.setup();
  render(<RebaixaView />);

  const [editar] = await screen.findAllByRole('button', { name: 'Editar LEITE INTEGRAL 1L' });
  await user.click(editar);
  const dialog = await screen.findByRole('dialog');

  await within(dialog).findByText('Preço da rebaixa');
  expect(within(dialog).queryByText('Preço final da rebaixa')).not.toBeInTheDocument();
  expect(dialog.textContent).not.toContain('Preço final');

  const preco = inputDoPreco(dialog);
  expect(preco).toHaveValue('5,00');

  await user.clear(preco);
  await user.type(preco, '3,25');
  await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

  await waitFor(() => expect(corpoUpdate()).toBeDefined());
  const corpo = corpoUpdate();
  expect(corpo?.preco_sugerido).toBe(3.25);
  expect(corpo).not.toHaveProperty('preco_final');
});
