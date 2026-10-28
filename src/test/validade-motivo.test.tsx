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

const produtoUn = { ean: '7891000315507', codigo: '123', descricao: 'LEITE INTEGRAL 1L', tipo: 'UN' };
const produtoKg = { ean: '210', codigo: '631612', descricao: 'BANANA NANICA KG 300044334', tipo: 'KG' };

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

it('mantém o campo de data para produtos do tipo UN', async () => {
  setupInvoke(produtoUn);
  const user = userEvent.setup();
  render(<ValidadeView />);

  await buscarProduto(user, '123');

  expect(screen.getByLabelText('Data de validade')).toBeInTheDocument();
  expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument();
  expect(screen.getByText('Tipo').parentElement?.textContent).toContain('UN');
});

it('troca o campo de data pelo dropdown de motivo para produtos do tipo KG', async () => {
  setupInvoke(produtoKg);
  const user = userEvent.setup();
  render(<ValidadeView />);

  await buscarProduto(user, '631612');

  expect(screen.queryByLabelText('Data de validade')).not.toBeInTheDocument();
  expect(screen.getByText('Tipo').parentElement?.textContent).toContain('KG');

  await user.click(screen.getByLabelText('Motivo'));
  expect(await screen.findByRole('option', { name: 'Excesso' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Qualidade' })).toBeInTheDocument();
});

it('registra o motivo escolhido e a data de hoje para produtos KG', async () => {
  setupInvoke(produtoKg);
  const user = userEvent.setup();
  render(<ValidadeView />);

  await buscarProduto(user, '631612');
  await user.click(screen.getByLabelText('Motivo'));
  await user.click(await screen.findByRole('option', { name: 'Excesso' }));
  fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });
  await user.click(screen.getByRole('button', { name: 'Registrar' }));

  await waitFor(() => expect(chamadaAdd()).toBeTruthy());
  const item = chamadaAdd();
  expect(item.motivo).toBe('Excesso');
  expect(item.quantidade).toBe(3);
  expect(new Date(item.validade).toDateString()).toBe(new Date().toDateString());
});

it('registra a data informada e sem motivo para produtos UN', async () => {
  setupInvoke(produtoUn);
  const user = userEvent.setup();
  render(<ValidadeView />);

  await buscarProduto(user, '123');
  fireEvent.change(screen.getByLabelText('Data de validade'), { target: { value: '2026-10-30' } });
  fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } });
  await user.click(screen.getByRole('button', { name: 'Registrar' }));

  await waitFor(() => expect(chamadaAdd()).toBeTruthy());
  const item = chamadaAdd();
  expect(item.motivo).toBeNull();
  expect(new Date(item.validade).toLocaleDateString('pt-BR')).toBe('30/10/2026');
});

it('exibe o motivo na lista sem disparar alerta de vencimento', async () => {
  setupInvoke(produtoKg, [
    {
      id: '1',
      ean: 210,
      codigo: 631612,
      descricao: 'BANANA NANICA KG 300044334',
      validade: new Date().toISOString(),
      status: true,
      created_by: 'admin',
      quantidade: 3,
      motivo: 'Qualidade',
    },
  ]);
  render(<ValidadeView />);

  await screen.findByText('BANANA NANICA KG 300044334');
  expect(screen.getAllByText('Qualidade').length).toBeGreaterThan(0);
  expect(screen.queryByText(/Vencem HOJE/i)).not.toBeInTheDocument();
});
