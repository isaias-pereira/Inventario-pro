import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddProductView from '../components/AddProductView';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const existingPackaging = {
  ean_fechado: '7891234567890',
  tipo_embalagem: 'CX',
  quantidade_fechada: 10,
  descricao: null,
};

const productWithPackaging = {
  ean: '210',
  codigo: '631612',
  descricao: 'BANANA NANICA KG',
  tipo: 'kg',
  eans: ['210'],
  embalagens: [existingPackaging],
};

async function selectOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  localStorage.setItem('estoque_pro_token', 'test-token');
});

describe('AddProductView — embalagem fechada', () => {
  it('switches the add form to closed packaging mode and submits the package', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        action: 'packaging_added',
        product: { ...productWithPackaging, embalagens: [existingPackaging] },
      },
    });

    render(<AddProductView />);
    fireEvent.click(screen.getByLabelText(/Embalagem fechada/));

    expect(await screen.findByLabelText('EAN do produto')).toBeInTheDocument();
    expect(screen.getByLabelText('EAN fechado')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo da embalagem')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantidade fechada')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('EAN do produto'), { target: { value: '210' } });
    fireEvent.change(screen.getByLabelText('EAN fechado'), { target: { value: '7891234567890' } });
    await selectOption(user, 'Tipo da embalagem', 'CX — Caixa');
    fireEvent.change(screen.getByLabelText('Quantidade fechada'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular embalagem' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'query-product',
        expect.objectContaining({
          body: {
            action: 'add_packaging',
            ean: '210',
            eanFechado: '7891234567890',
            tipo: 'CX',
            quantidadeFechada: '10',
          },
        }),
      ),
    );
  });

  it('lists, removes and adds packages while editing a product', async () => {
    const user = userEvent.setup();
    invoke
      .mockResolvedValueOnce({ data: { found: true, product: productWithPackaging } })
      .mockResolvedValueOnce({ data: { success: true, action: 'packaging_removed' } })
      .mockResolvedValueOnce({
        data: {
          success: true,
          action: 'packaging_added',
          product: {
            ...productWithPackaging,
            embalagens: [
              { ean_fechado: '7890000000000', tipo_embalagem: 'FD', quantidade_fechada: 60, descricao: null },
            ],
          },
        },
      });

    render(<AddProductView />);
    fireEvent.click(screen.getByRole('button', { name: /^Editar$/ }));
    fireEvent.change(screen.getByLabelText('Código ou EAN'), { target: { value: '631612' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar produto' }));

    expect(await screen.findByText('Embalagens fechadas')).toBeInTheDocument();
    expect(screen.getByText('CX ×10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover embalagem 7891234567890' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenNthCalledWith(
        2,
        'query-product',
        expect.objectContaining({ body: { action: 'remove_packaging', eanFechado: '7891234567890' } }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('CX ×10')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Nova embalagem' }));
    fireEvent.change(screen.getByLabelText('EAN fechado'), { target: { value: '7890000000000' } });
    await selectOption(user, 'Tipo da embalagem', 'FD — Fardo');
    fireEvent.change(screen.getByLabelText('Quantidade fechada'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular embalagem' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenNthCalledWith(
        3,
        'query-product',
        expect.objectContaining({
          body: {
            action: 'add_packaging',
            ean: '631612',
            eanFechado: '7890000000000',
            tipo: 'FD',
            quantidadeFechada: '60',
          },
        }),
      ),
    );
    expect(await screen.findByText('FD ×60')).toBeInTheDocument();
  });
});
