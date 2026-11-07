import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArrastaoView from '../components/ArrastaoView';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'admin', role: 'admin' }, getToken: () => 'token', isAdmin: true }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

/** Produto base (EAN 1) com uma caixa CX de 15 unidades (EAN 101). */
const produtoComCaixa = {
  ean: '1',
  codigo: '1',
  descricao: 'TESTE 01',
  tipo: 'UN',
  embalagem: {
    ean_fechado: '101',
    tipo_embalagem: 'CX',
    quantidade_fechada: 15,
    descricao: null,
  },
};

const produtoSimples = { ean: '7891000315507', codigo: '123', descricao: 'LEITE INTEGRAL 1L', tipo: 'UN' };

const sessao = {
  id: 'sessao-1',
  corredor: 'A',
  started_by: 'admin',
  participants: ['admin'],
  started_at: new Date().toISOString(),
  ended_at: null,
  status: 'active' as const,
};

interface InvokeOptions {
  body?: { action?: string; item?: Record<string, unknown> };
}

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  window.localStorage.setItem('estoque_pro_token', 'token');
});

function setupInvoke(product: Record<string, unknown> | null) {
  invoke.mockImplementation(async (fn: string, opts?: InvokeOptions) => {
    if (fn === 'query-product') {
      return product
        ? { data: { found: true, product }, error: null }
        : { data: { found: false }, error: null };
    }
    const action = opts?.body?.action;
    if (action === 'list_active') return { data: { sessions: [sessao] }, error: null };
    if (action === 'list_log') return { data: { sessions: [] }, error: null };
    if (action === 'list_items') return { data: { items: [] }, error: null };
    if (action === 'add_item') return { data: { success: true }, error: null };
    return { data: {}, error: null };
  });
}

async function abrirSessao(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Corredor: A');
  await user.click(screen.getByText('Corredor: A'));
  await screen.findByPlaceholderText('Código do produto');
}

async function buscarProduto(user: ReturnType<typeof userEvent.setup>, codigo: string, descricao: string) {
  await user.type(screen.getByPlaceholderText('Código do produto'), codigo);
  await user.click(screen.getByRole('button', { name: 'Buscar produto' }));
  await screen.findByText(descricao);
}

function chamadaAddItem(): Record<string, unknown> | undefined {
  const call = invoke.mock.calls.find(
    ([fn, opts]: [string, InvokeOptions]) => fn === 'manage-arrastao' && opts?.body?.action === 'add_item',
  );
  return call?.[1]?.body?.item;
}

it('mostra que o código coletado é uma caixa e quantas unidades ela tem', async () => {
  setupInvoke(produtoComCaixa);
  const user = userEvent.setup();
  render(<ArrastaoView open onOpenChange={() => {}} />);

  await abrirSessao(user);
  await buscarProduto(user, '101', 'TESTE 01');

  expect(screen.getByText('CX ×15')).toBeInTheDocument();
  expect(screen.getByText('EAN fechado: 101')).toBeInTheDocument();
  expect(screen.getByText(/1 caixa = 15 un/)).toBeInTheDocument();
});

it('coleta o total convertido em unidades do produto base', async () => {
  setupInvoke(produtoComCaixa);
  const user = userEvent.setup();
  render(<ArrastaoView open onOpenChange={() => {}} />);

  await abrirSessao(user);
  await buscarProduto(user, '101', 'TESTE 01');
  fireEvent.change(screen.getByLabelText('Data de validade'), { target: { value: '2026-10-30' } });
  fireEvent.change(screen.getByLabelText('Qtd de caixas'), { target: { value: '2' } });

  // A tela mostra a conversão antes de coletar.
  expect(screen.getByText('= 30 un')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Coletar' }));

  await waitFor(() => expect(chamadaAddItem()).toBeTruthy());
  const item = chamadaAddItem();
  // 2 caixas × 15 = 30 unidades do produto base (EAN 1).
  expect(item?.quantidade).toBe(30);
  expect(item?.ean).toBe(1);
  expect(item?.codigo).toBe(1);
});

it('mantém a quantidade digitada quando o produto não tem embalagem fechada', async () => {
  setupInvoke(produtoSimples);
  const user = userEvent.setup();
  render(<ArrastaoView open onOpenChange={() => {}} />);

  await abrirSessao(user);
  await buscarProduto(user, '123', 'LEITE INTEGRAL 1L');
  expect(screen.queryByText('CX ×15')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Data de validade'), { target: { value: '2026-10-30' } });
  fireEvent.change(screen.getByLabelText('Qtd'), { target: { value: '2' } });
  await user.click(screen.getByRole('button', { name: 'Coletar' }));

  await waitFor(() => expect(chamadaAddItem()).toBeTruthy());
  expect(chamadaAddItem()?.quantidade).toBe(2);
});

it('não coleta quando a quantidade convertida é zero', async () => {
  setupInvoke(produtoComCaixa);
  const user = userEvent.setup();
  render(<ArrastaoView open onOpenChange={() => {}} />);

  await abrirSessao(user);
  await buscarProduto(user, '101', 'TESTE 01');
  fireEvent.change(screen.getByLabelText('Data de validade'), { target: { value: '2026-10-30' } });
  fireEvent.change(screen.getByLabelText('Qtd de caixas'), { target: { value: '0' } });
  await user.click(screen.getByRole('button', { name: 'Coletar' }));

  await waitFor(() => expect(chamadaAddItem()).toBeUndefined());
});
