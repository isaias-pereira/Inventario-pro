import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InventarioView from '../components/InventarioView';

const { addItem, invoke } = vi.hoisted(() => ({
  addItem: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast };
});
vi.mock('@/contexts/DataContext', () => ({
  useData: () => ({
    inventoryItems: [],
    addOrUpdateInventoryItem: addItem,
    clearAllInventory: vi.fn(),
    updateInventoryItemQuantidade: vi.fn(),
    removeInventoryItem: vi.fn(),
    hasInventory: false,
    fetchInventory: vi.fn(),
    currentLote: 4,
    currentLoteNome: 'TESTE',
    renameLote: vi.fn(),
    viewingLote: null,
    listLotes: vi.fn(),
    viewLote: vi.fn(),
    exitViewLote: vi.fn(),
    finalizeLote: vi.fn(),
    suspendLote: vi.fn(),
    resumeLote: vi.fn(),
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: false, user: { username: 'teste' }, getToken: () => 'token' }),
}));

const packagedProduct = {
  ean: '210',
  codigo: '631612',
  descricao: 'BANANA NANICA KG',
  tipo: 'KG',
  embalagem: {
    ean_fechado: '7891234567890',
    tipo_embalagem: 'CX',
    quantidade_fechada: 10,
    descricao: null,
  },
};

const unitProduct = {
  ean: '7890000000000',
  codigo: '631613',
  descricao: 'BANANA PRATA UN',
  tipo: 'UN',
  embalagem: null,
};

function found(product: unknown) {
  return { data: { found: true, product }, error: null };
}

async function search(code: string) {
  fireEvent.change(screen.getByPlaceholderText('Código do produto'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
  await screen.findByText('Produto Encontrado');
}

beforeEach(() => {
  cleanup();
  addItem.mockReset();
  addItem.mockResolvedValue(undefined);
  invoke.mockReset();
});

describe('InventarioView — embalagem fechada', () => {
  it('converts the package count into total kg when Contar is clicked', async () => {
    invoke.mockResolvedValueOnce(found(packagedProduct));

    render(<InventarioView />);
    await search('7891234567890');

    expect(screen.getByText('CX ×10')).toBeInTheDocument();
    expect(screen.getByLabelText('Qtd de caixas')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Qtd de caixas'), { target: { value: '3' } });
    expect(screen.getByText('= 30 kg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Contar' }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        { ean: '210', codigo: '631612', descricao: 'BANANA NANICA KG' },
        30,
        'teste',
      ),
    );
  });

  it('keeps the unit flow unchanged when the scanned EAN is not a package', async () => {
    invoke.mockResolvedValueOnce(found(unitProduct));

    render(<InventarioView />);
    await search('7890000000000');

    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Quantidade')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Contar' }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        { ean: '7890000000000', codigo: '631613', descricao: 'BANANA PRATA UN' },
        2,
        'teste',
      ),
    );
  });

  it('adds one package in Auto +1 mode', async () => {
    invoke.mockResolvedValueOnce(found(packagedProduct));

    render(<InventarioView />);
    fireEvent.click(screen.getByLabelText('Auto +1'));
    fireEvent.change(screen.getByPlaceholderText('Código do produto'), { target: { value: '7891234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        { ean: '210', codigo: '631612', descricao: 'BANANA NANICA KG' },
        10,
        'teste',
      ),
    );
  });
});
