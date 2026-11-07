import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValidadeView from '../components/ValidadeView';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' }, getToken: () => 'token', isAdmin: true }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/validade-tipos', () => ({ fetchProductTipos: vi.fn(async () => ({})) }));

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

interface InvokeOptions {
  body?: { action?: string; item?: AddItem };
}

interface AddItem {
  ean: number;
  codigo: number;
  descricao: string;
  validade: string;
  quantidade: number;
  motivo: string | null;
}

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  window.localStorage.setItem('estoque_pro_token', 'token');
});

function setupInvoke(product: Record<string, unknown> | null, items: unknown[] = []) {
  invoke.mockImplementation(async (fn: string, opts?: InvokeOptions) => {
    if (fn === 'query-product') {
      return product
        ? { data: { found: true, product }, error: null }
        : { data: { found: false }, error: null };
    }
    if (opts?.body?.action === 'list_all') return { data: { items }, error: null };
    if (opts?.body?.action === 'add') return { data: { success: true }, error: null };
    return { data: {}, error: null };
  });
}

async function buscarProduto(user: ReturnType<typeof userEvent.setup>, codigo: string) {
  await user.type(screen.getByPlaceholderText('Código do produto'), codigo);
  await user.click(screen.getByRole('button', { name: 'Consultar' }));
  await screen.findByText('Produto Encontrado');
}

function chamadaAdd(): AddItem | undefined {
  const call = invoke.mock.calls.find(
    ([fn, opts]: [string, InvokeOptions]) => fn === 'manage-validade' && opts?.body?.action === 'add',
  );
  return call?.[1]?.body?.item;
}

it('mostra que o código buscado é uma caixa e quantas unidades ela tem', async () => {
  setupInvoke(produtoComCaixa);
  const user = userEvent.setup();
  render(<ValidadeView />);

  await buscarProduto(user, '101');

  expect(screen.getByText('CX ×15')).toBeInTheDocument();
  const card = screen.getByText('Produto Encontrado').closest('div.overflow-hidden');
  expect(card?.textContent).toContain('EAN fechado');
  expect(card?.textContent).toContain('101');
  expect(screen.getByText(/1 caixa = 15 un/)).toBeInTheDocument();
});

it('registra o total convertido em unidades do produto base', async () => {
  setupInvoke(produtoComCaixa);
  const user = userEvent.setup();
  render(<ValidadeView />);

  await buscarProduto(user, '101');
  fireEvent.change(screen.getByLabelText('Data de validade'), { target: { value: '2026-10-30' } });
  fireEvent.change(screen.getByLabelText('Qtd de caixas'), { target: { value: '2' } });

  // A tela mostra a conversão antes de registrar.
  expect(screen.getByText('= 30 un')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Registrar' }));

  await waitFor(() => expect(chamadaAdd()).toBeTruthy());
  const item = chamadaAdd();
  // 2 caixas × 15 = 30 unidades do produto base (EAN 1).
  expect(item.quantidade).toBe(30);
  expect(item.ean).toBe(1);
  expect(item.codigo).toBe(1);
});

it('mantém a quantidade digitada quando o produto não tem embalagem fechada', async () => {
  setupInvoke(produtoSimples);
  const user = userEvent.setup();
  render(<ValidadeView />);

  await buscarProduto(user, '123');
  expect(screen.queryByText('CX ×15')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Quantidade')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Data de validade'), { target: { value: '2026-10-30' } });
  fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } });
  await user.click(screen.getByRole('button', { name: 'Registrar' }));

  await waitFor(() => expect(chamadaAdd()).toBeTruthy());
  expect(chamadaAdd()?.quantidade).toBe(2);
});

it('não registra quando a quantidade convertida é zero', async () => {
  setupInvoke(produtoComCaixa);
  const user = userEvent.setup();
  render(<ValidadeView />);

  await buscarProduto(user, '101');
  fireEvent.change(screen.getByLabelText('Data de validade'), { target: { value: '2026-10-30' } });
  fireEvent.change(screen.getByLabelText('Qtd de caixas'), { target: { value: '0' } });
  await user.click(screen.getByRole('button', { name: 'Registrar' }));

  await waitFor(() => expect(chamadaAdd()).toBeUndefined());
});
