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

const CATEGORIAS = [
  { codigo: '4', secao: 'Mercearia' },
  { codigo: '8', secao: 'Hortifruti' },
];

/** Respostas enfileiradas para as chamadas que não são a taxonomia de seções. */
const respostas: Array<{ data: unknown; error: unknown }> = [];
const enfileirar = (resposta: { data: unknown; error: unknown }) => respostas.push(resposta);

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
    respostas.length = 0;
    localStorage.setItem('estoque_pro_token', 'test-token');
    invokeMock.mockImplementation(async (_fn: string, options?: { body?: { action?: string } }) => {
      const action = options?.body?.action;
      if (action === 'categorias') return { data: { categorias: CATEGORIAS }, error: null } as never;
      if (action === 'read_label') return (respostas.shift() ?? { data: {}, error: null }) as never;
      return (respostas.shift() ?? { data: {}, error: null }) as never;
    });
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
    enfileirar({
      data: {
        exists: true,
        product: {
          ean: '7897122601252',
          codigo: '721310',
          descricao: 'CARNE SECA VAPZA 400G',
          tipo: 'un',
          codigos: ['721310', '959731'],
          eans: ['7897122601252'],
          categoria_codigo: '7',
          secao: 'Açougue e Peixaria',
        },
      },
      error: null,
    });
    enfileirar({
      data: { success: true, action: 'ean_linked', alreadyLinked: false, product: { codigo: '721310' } },
      error: null,
    });

    render(<AddProductView />);
    fillForm();
    submit();

    expect(await screen.findByText('Produto já existe')).toBeInTheDocument();
    // Mostra o produto mestre encontrado, não o código digitado.
    expect(screen.getByText('CARNE SECA VAPZA 400G')).toBeInTheDocument();
    expect(screen.getByText(/Códigos vinculados:/)).toBeInTheDocument();
    // A seção atual do produto aparece no aviso.
    expect(screen.getByText('Açougue e Peixaria')).toBeInTheDocument();

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
    enfileirar({ data: { exists: false }, error: null });
    enfileirar({ data: { error: 'EAN já pertence a outro produto' }, error: null });

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
    expect(invokeMock).not.toHaveBeenCalledWith('query-product', expect.objectContaining({ body: { action: 'insert' } }));
  });

  it('fills the closed packaging EAN with the scanned code', async () => {
    const user = userEvent.setup();
    render(<AddProductView />);

    await user.click(screen.getByRole('checkbox', { name: /Embalagem fechada/ }));
    await user.click(screen.getByRole('button', { name: 'Escanear EAN fechado' }));
    await waitFor(() => expect(scanCallback.current).toBeTruthy());

    await act(async () => { scanCallback.current?.('7895555555555'); });

    await waitFor(() => expect(screen.getByLabelText('EAN fechado')).toHaveValue('7895555555555'));
    expect(invokeMock).not.toHaveBeenCalledWith('query-product', expect.objectContaining({ body: { action: 'insert' } }));
  });

  it('fills the product fields from a scanned label without saving', async () => {
    enfileirar({
      data: {
        label: { ean: '7509546707761', codigo: '3265420', descricao: 'SH DARLING 315ML', tipo: 'UN' },
        produto: null,
        avisos: ['Produto não encontrado no catálogo: confira o código e consulte manualmente.'],
      },
      error: null,
    });

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
    expect(invokeMock).toHaveBeenCalledWith(
      'ai-assist',
      expect.objectContaining({ body: expect.objectContaining({ action: 'read_label' }) }),
    );
  });

  describe('seção do catálogo', () => {
    it('lista as seções e envia a escolhida no cadastro', async () => {
      const user = userEvent.setup();
      enfileirar({ data: { exists: false }, error: null });
      enfileirar({ data: { success: true, action: 'created' }, error: null });

      render(<AddProductView />);
      await screen.findByText('Selecione a seção');

      fillForm();
      await user.click(screen.getByLabelText('Seção do produto'));
      await user.click(await screen.findByRole('option', { name: 'Hortifruti' }));
      submit();

      await waitFor(() =>
        expect(invokeMock).toHaveBeenLastCalledWith(
          'query-product',
          expect.objectContaining({
            body: expect.objectContaining({ action: 'insert', categoriaCodigo: '8' }),
          }),
        ),
      );
    });

    it('não envia a seção quando a pessoa não escolhe nenhuma', async () => {
      enfileirar({ data: { exists: false }, error: null });
      enfileirar({ data: { success: true, action: 'created' }, error: null });

      render(<AddProductView />);
      await screen.findByText('Selecione a seção');

      fillForm();
      submit();

      await waitFor(() => {
        const body = (invokeMock.mock.calls.at(-1)?.[1] as { body?: Record<string, unknown> } | undefined)?.body;
        expect(body?.action).toBe('insert');
        expect(body?.categoriaCodigo).toBeUndefined();
      });
    });

    it('carrega a seção do produto na edição e permite trocar', async () => {
      const user = userEvent.setup();
      enfileirar({
        data: {
          found: true,
          product: {
            ean: '210',
            codigo: '631612',
            descricao: 'BANANA NANICA KG',
            tipo: 'kg',
            eans: ['210'],
            categoria_codigo: '8',
            secao: 'Hortifruti',
          },
        },
        error: null,
      });
      enfileirar({
        data: { success: true, action: 'updated', product: { codigo: '631612', categoria_codigo: '4', secao: 'Mercearia' } },
        error: null,
      });

      render(<AddProductView />);
      fireEvent.click(screen.getByRole('button', { name: /^Editar$/ }));
      fireEvent.change(screen.getByLabelText('Código ou EAN'), { target: { value: '631612' } });
      fireEvent.click(screen.getByRole('button', { name: 'Buscar produto' }));

      await waitFor(() => expect(screen.getByLabelText('Seção do produto')).toHaveTextContent('Hortifruti'));

      await user.click(screen.getByLabelText('Seção do produto'));
      await user.click(await screen.findByRole('option', { name: 'Mercearia' }));
      fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

      await waitFor(() =>
        expect(invokeMock).toHaveBeenLastCalledWith(
          'query-product',
          expect.objectContaining({
            body: expect.objectContaining({ action: 'update', categoriaCodigo: '4' }),
          }),
        ),
      );
    });
  });
});
