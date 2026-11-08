import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invokeFunction } from '@/lib/api';
import { aplicarSecao, revisarSecoes } from '@/lib/ai-categoria';

vi.mock('@/lib/api', () => ({ invokeFunction: vi.fn() }));

const invokeMock = vi.mocked(invokeFunction);

beforeEach(() => {
  invokeMock.mockReset();
});

describe('revisarSecoes', () => {
  it('chama a action review_categorias e devolve candidatos e propostas', async () => {
    invokeMock.mockResolvedValue({
      data: {
        candidatos: [{ codigo: '111', descricao: 'MENTOS', secaoAtual: 'Outros' }],
        propostas: [
          {
            codigo: '111',
            descricao: 'MENTOS',
            secaoAtual: 'Outros',
            secao: 'Snacks e Doces',
            secaoCodigo: '3',
            confianca: 0.9,
          },
        ],
        avisos: [],
        model: 'nvidia/nemotron',
      },
      error: null,
    } as never);

    const resultado = await revisarSecoes({ limite: 20, token: 'abc' });

    expect(invokeMock).toHaveBeenCalledWith('ai-assist', expect.objectContaining({
      body: { action: 'review_categorias', limite: 20 },
      headers: { Authorization: 'Bearer abc' },
    }));
    expect(resultado.propostas).toHaveLength(1);
    expect(resultado.propostas[0].secaoCodigo).toBe('3');
  });

  it('repete o erro da API', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('sem rede') } as never);
    await expect(revisarSecoes()).rejects.toThrow('sem rede');
  });

  it('repete o erro devolvido no corpo da resposta', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'A IA não está configurada' }, error: null } as never);
    await expect(revisarSecoes()).rejects.toThrow('A IA não está configurada');
  });
});

describe('aplicarSecao', () => {
  it('grava a seção pela action set_categoria', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null } as never);

    await aplicarSecao('111', '3', 'abc');

    expect(invokeMock).toHaveBeenCalledWith('query-product', {
      body: { action: 'set_categoria', codigo: '111', categoriaCodigo: '3' },
      headers: { Authorization: 'Bearer abc' },
    });
  });

  it('repete o erro devolvido no corpo da resposta', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'Seção inexistente na taxonomia' }, error: null } as never);
    await expect(aplicarSecao('111', '99')).rejects.toThrow('Seção inexistente na taxonomia');
  });
});
