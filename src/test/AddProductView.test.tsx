import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddProductView from '@/components/AddProductView';
import { invokeFunction } from '@/lib/api';
import { toast } from 'sonner';

// A câmera não existe no jsdom: o mock guarda o callback de leitura para
// simular a leitura de um código de barras.
const { scanCallback } = vi.hoisted(() => ({
  scanCallback: { current: null as null | ((text: string) => void) },
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false;
    async start(_camera: unknown, _config: unknown, onSuccess: (text: string) => void) {
      scanCallback.current = onSuccess;
    }
    async stop() {}
    async clear() {}
    static async getCameras() { return []; }
  },
}));

vi.mock('@/lib/api', () => ({ invokeFunction: vi.fn() }));

// O jsdom não decodifica imagem: a compressão da foto é testada à parte
// (src/test/ai-image.test.ts). Aqui só importa o resultado.
vi.mock('@/lib/ai-image', () => ({
  prepareImage: vi.fn(async () => ({
    base64: 'QUFB',
    mimeType: 'image/jpeg',
    width: 100,
    height: 100,
    bytes: 3,
  })),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
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

  it('fills the product EAN with the scanned code without sending the form', async () => {
    const user = userEvent.setup();
    render(<AddProductView />);

    await user.click(screen.getByRole('button', { name: 'Escanear EAN do produto' }));
    await waitFor(() => expect(scanCallback.current).toBeTruthy());

    await act(async () => { scanCallback.current?.('7891234567890'); });

    await waitFor(() => expect(screen.getByLabelText('EAN')).toHaveValue('7891234567890'));
    // O botão do leitor é type="button": não pode enviar o formulário.
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('fills the closed packaging EAN with the scanned code', async () => {
    const user = userEvent.setup();
    render(<AddProductView />);

    await user.click(screen.getByRole('checkbox', { name: /Embalagem fechada/ }));
    await user.click(screen.getByRole('button', { name: 'Escanear EAN fechado' }));
    await waitFor(() => expect(scanCallback.current).toBeTruthy());

    await act(async () => { scanCallback.current?.('7895555555555'); });

    await waitFor(() => expect(screen.getByLabelText('EAN fechado')).toHaveValue('7895555555555'));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('fills the product fields from a scanned label without saving', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        label: { ean: '7509546707761', codigo: '3265420', descricao: 'SH DARLING 315ML', tipo: 'UN' },
        produto: null,
        avisos: ['Produto não encontrado no catálogo: confira o código e consulte manualmente.'],
      },
      error: null,
    } as never);

    const user = userEvent.setup();
    render(<AddProductView />);

    await user.click(screen.getByRole('button', { name: 'Scanear Etiqueta' }));

    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const arquivo = new File(['fake'], 'etiqueta.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } });
    });

    await waitFor(() => expect(screen.getByLabelText('EAN')).toHaveValue('7509546707761'));
    expect(screen.getByLabelText('Código')).toHaveValue('3265420');
    expect(screen.getByLabelText('Descrição')).toHaveValue('SH DARLING 315ML');

    // O botão é type="button": a leitura não envia o formulário.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      'ai-assist',
      expect.objectContaining({ body: expect.objectContaining({ action: 'read_label' }) }),
    );
  });
});
