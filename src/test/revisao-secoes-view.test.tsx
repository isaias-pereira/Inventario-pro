/**
 * @vitest-environment jsdom
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RevisaoSecoesView from '../components/RevisaoSecoesView';

const { invokeFunction, revisarSecoes, aplicarSecao, useAuth, carregarCategorias } = vi.hoisted(() => ({
  invokeFunction: vi.fn(),
  revisarSecoes: vi.fn(),
  aplicarSecao: vi.fn(),
  carregarCategorias: vi.fn(),
  useAuth: vi.fn(() => ({
    user: { username: 'admin', role: 'admin' as string },
    getToken: () => 'token',
    isAdmin: true,
    userRole: 'admin' as string,
  })),
}));

vi.mock('@/lib/api', () => ({ invokeFunction }));
vi.mock('@/lib/ai-categoria', () => ({ revisarSecoes, aplicarSecao }));
vi.mock('@/lib/categorias', () => ({
  carregarCategorias,
  SEM_SECAO: '__sem_secao__',
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const CATEGORIAS = [
  { codigo: '3', secao: 'Snacks e Doces' },
  { codigo: '8', secao: 'Hortifruti' },
  { codigo: '19', secao: 'Outros' },
];

const REVISAO = {
  candidatos: [
    { codigo: '111', descricao: 'MENTOS MAST 37G', secaoAtual: 'Outros' },
    { codigo: '222', descricao: 'CUPUACU KG', secaoAtual: 'Outros' },
  ],
  propostas: [
    {
      codigo: '111',
      descricao: 'MENTOS MAST 37G',
      secaoAtual: 'Outros',
      secao: 'Snacks e Doces',
      secaoCodigo: '3',
      confianca: 0.9,
    },
    {
      codigo: '222',
      descricao: 'CUPUACU KG',
      secaoAtual: 'Outros',
      secao: 'Hortifruti',
      secaoCodigo: '8',
      confianca: 0.8,
    },
  ],
  avisos: ['MENTOS parece claro'],
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  carregarCategorias.mockResolvedValue(CATEGORIAS);
  invokeFunction.mockResolvedValue({ data: { enabled: true, model: 'nvidia/nemotron' }, error: null });
  revisarSecoes.mockResolvedValue(REVISAO);
  aplicarSecao.mockResolvedValue(undefined);
});

describe('RevisaoSecoesView', () => {
  it('pede a revisão e mostra as propostas da IA', async () => {
    const user = userEvent.setup();
    render(<RevisaoSecoesView />);

    await user.click(await screen.findByRole('button', { name: /Revisar com IA/ }));

    expect(revisarSecoes).toHaveBeenCalled();
    expect(await screen.findByText('MENTOS MAST 37G')).toBeInTheDocument();
    expect(screen.getByText('CUPUACU KG')).toBeInTheDocument();
    expect(screen.getByText('Observações da IA')).toBeInTheDocument();
    expect(screen.getByText('2 de 2 selecionado(s)')).toBeInTheDocument();
  });

  it('aplica apenas as propostas marcadas', async () => {
    const user = userEvent.setup();
    render(<RevisaoSecoesView />);

    await user.click(await screen.findByRole('button', { name: /Revisar com IA/ }));
    await screen.findByText('MENTOS MAST 37G');

    // Desmarca o segundo produto.
    await user.click(screen.getByLabelText('Aplicar seção de CUPUACU KG'));
    expect(screen.getByText('1 de 2 selecionado(s)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Aplicar 1 alteração/ }));

    await waitFor(() => expect(aplicarSecao).toHaveBeenCalledTimes(1));
    expect(aplicarSecao).toHaveBeenCalledWith('111', '3', 'token');
  });

  it('avisa quando a IA não está configurada', async () => {
    invokeFunction.mockResolvedValue({ data: { enabled: false }, error: null });
    render(<RevisaoSecoesView />);

    expect(await screen.findByText(/A IA não está configurada neste ambiente/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revisar com IA/ })).toBeDisabled();
  });

  it('avisa quando a IA não propõe nada para o lote', async () => {
    revisarSecoes.mockResolvedValue({ ...REVISAO, propostas: [] });
    const user = userEvent.setup();
    render(<RevisaoSecoesView />);

    await user.click(await screen.findByRole('button', { name: /Revisar com IA/ }));

    expect(await screen.findByText(/Nenhuma proposta neste lote/)).toBeInTheDocument();
  });

  it('mantém as falhas de gravação separadas das aplicadas', async () => {
    const user = userEvent.setup();
    aplicarSecao.mockImplementation(async (codigo: string) => {
      if (codigo === '222') throw new Error('seção inexistente');
    });
    render(<RevisaoSecoesView />);

    await user.click(await screen.findByRole('button', { name: /Revisar com IA/ }));
    await screen.findByText('MENTOS MAST 37G');

    await user.click(screen.getByRole('button', { name: /Aplicar 2 alteração/ }));

    await waitFor(() => expect(aplicarSecao).toHaveBeenCalledTimes(2));
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('1 produto(s) reclassificado(s).');
    expect(toast.error).toHaveBeenCalledWith(
      '1 produto(s) não puderam ser gravados.',
      expect.objectContaining({ description: expect.stringContaining('222') }),
    );
  });
});
