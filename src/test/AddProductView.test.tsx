import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddProductView from '@/components/AddProductView';
import { invokeFunction } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('@/lib/api', () => ({ invokeFunction: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const invokeMock = vi.mocked(invokeFunction);

const fillForm = () => {
  fireEvent.change(screen.getByLabelText('EAN'), { target: { value: '7899999999999' } });
  fireEvent.change(screen.getByLabelText('Código'), { target: { value: '959731' } });
  fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'teste alt' } });
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Adicionar Produto' }));

describe('AddProductView', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.setItem('estoque_pro_token', 'test-token');
  });

  it('starts without a selected type and offers KG and UN', async () => {
    const user = userEvent.setup();
    render(<AddProductView />);

    expect(screen.getByText('Selecione o tipo')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Tipo do produto'));
    expect(await screen.findByRole('option', { name: 'KG' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'UN' })).toBeInTheDocument();
  });

  it('asks before linking a new EAN to a product found by an alternative code', async () => {
    invokeMock
      .mockResolvedValueOnce({
        data: {
          exists: true,
          product: {
            ean: '7897122601252',
            codigo: '721310',
            descricao: 'CARNE SECA VAPZA 400G',
            tipo: 'un',
            codigos: ['721310', '959731'],
            eans: ['7897122601252'],
          },
        },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: { success: true, action: 'ean_linked', alreadyLinked: false, product: { codigo: '721310' } },
        error: null,
      } as never);

    render(<AddProductView />);
    fillForm();
    submit();

    expect(await screen.findByText('Produto já existe')).toBeInTheDocument();
    // Mostra o produto mestre encontrado, não o código digitado.
    expect(screen.getByText('CARNE SECA VAPZA 400G')).toBeInTheDocument();
    expect(screen.getByText(/Códigos vinculados:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vincular EAN' }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenLastCalledWith(
        'query-product',
        expect.objectContaining({
          body: { action: 'insert', ean: '7899999999999', codigo: '959731', descricao: 'TESTE ALT', tipo: '' },
        }),
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('EAN vinculado com sucesso!', expect.anything()));
  });

  it('shows the API error message when the link fails', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { exists: false }, error: null } as never)
      .mockResolvedValueOnce({ data: { error: 'EAN já pertence a outro produto' }, error: null } as never);

    render(<AddProductView />);
    fillForm();
    submit();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('EAN já pertence a outro produto'));
  });
});
