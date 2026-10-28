import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddProductView from '../components/AddProductView';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => { cleanup(); invoke.mockReset(); });

async function selectTipo(user: ReturnType<typeof userEvent.setup>, option: 'KG' | 'UN') {
  await user.click(screen.getByLabelText('Tipo'));
  await user.click(await screen.findByRole('option', { name: option }));
}

it('submits the selected type with a new product', async () => {
  const user = userEvent.setup();
  invoke.mockResolvedValueOnce({ data: { exists: false } }).mockResolvedValueOnce({ data: { action: 'created' } });
  render(<AddProductView />);
  fireEvent.change(screen.getByLabelText('EAN'), { target: { value: '123123123' } });
  fireEvent.change(screen.getByLabelText('Código'), { target: { value: '631612' } });
  fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'banana nanica' } });
  await selectTipo(user, 'KG');
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Produto' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('query-product', expect.objectContaining({ body: { action: 'insert', ean: '123123123', codigo: '631612', descricao: 'BANANA NANICA', tipo: 'KG' } })));
});

it('loads and edits every field, retaining unmodified EAN links', async () => {
  const user = userEvent.setup();
  const original = { codigo: '631612', ean: '210', descricao: 'BANANA NANICA KG 300044334', tipo: 'kg', eans: ['210', '123123123'] };
  invoke.mockResolvedValueOnce({ data: { found: true, product: original } }).mockResolvedValueOnce({ data: { action: 'updated', product: { ...original, codigo: '631613', ean: '211', descricao: 'BANANA PRATA', tipo: 'un', eans: ['211','123123123','999'] } } });
  render(<AddProductView />);
  fireEvent.click(screen.getByRole('button', { name: /^Editar$/ }));
  fireEvent.change(screen.getByLabelText('Código ou EAN'), { target: { value: '631612' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar produto' }));
  await screen.findByLabelText('EAN principal');
  fireEvent.change(screen.getByLabelText('EAN principal'), { target: { value: '211' } });
  fireEvent.change(screen.getByLabelText('Código'), { target: { value: '631613' } });
  fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'banana prata' } });
  await selectTipo(user, 'UN');
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar EAN vinculado' }));
  fireEvent.change(screen.getByLabelText('EAN vinculado 2'), { target: { value: '999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('query-product', expect.objectContaining({ body: { action: 'update', originalCodigo: '631612', codigo: '631613', ean: '211', eans: ['211', '123123123', '999'], descricao: 'BANANA PRATA', tipo: 'UN' } })));
});
