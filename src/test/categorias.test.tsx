import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  fetchCategorias,
  carregarCategorias,
  limparCacheCategorias,
  secaoDo,
  codigoSecao,
  filtrarPorSecao,
  SEM_SECAO,
  type ComSecao,
} from '@/lib/categorias';
import SecaoBadge from '@/components/SecaoBadge';
import SecaoFilter from '@/components/SecaoFilter';

const { invokeFunction } = vi.hoisted(() => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/api', () => ({ invokeFunction }));

const CATEGORIAS = [
  { codigo: '4', secao: 'Mercearia' },
  { codigo: '8', secao: 'Hortifruti' },
  { codigo: '12', secao: 'Bebê' },
  { codigo: '19', secao: 'Outros' },
];

beforeEach(() => {
  cleanup();
  invokeFunction.mockReset();
  // A taxonomia é cacheada por sessão: cada caso começa do zero.
  limparCacheCategorias();
});

afterEach(() => {
  cleanup();
});

describe('helpers de seção', () => {
  it('devolve a seção do produto quando ela existe', () => {
    expect(secaoDo({ secao: 'Hortifruti' })).toBe('Hortifruti');
    expect(secaoDo({ secao: '  Mercearia  ' })).toBe('Mercearia');
  });

  it('devolve null quando o produto não tem seção', () => {
    expect(secaoDo(null)).toBeNull();
    expect(secaoDo(undefined)).toBeNull();
    expect(secaoDo({})).toBeNull();
    expect(secaoDo({ secao: '' })).toBeNull();
    expect(secaoDo({ secao: '   ' })).toBeNull();
  });

  it('devolve o código da seção', () => {
    expect(codigoSecao({ categoria_codigo: '8' })).toBe('8');
    expect(codigoSecao({ categoria_codigo: 8 })).toBe('8');
    expect(codigoSecao({ categoria_codigo: null })).toBeNull();
    expect(codigoSecao({})).toBeNull();
  });

  it('filtra a lista pela seção', () => {
    const itens: ComSecao[] = [
      { secao: 'Hortifruti' },
      { secao: 'Mercearia' },
      { secao: null },
    ];

    expect(filtrarPorSecao(itens, '')).toHaveLength(3);
    expect(filtrarPorSecao(itens, null)).toHaveLength(3);
    expect(filtrarPorSecao(itens, 'Hortifruti')).toHaveLength(1);
    expect(filtrarPorSecao(itens, 'Mercearia')[0].secao).toBe('Mercearia');
    // Produto sem seção não entra em nenhum filtro de seção.
    expect(filtrarPorSecao(itens, 'Outros')).toHaveLength(0);
  });
});

describe('fetchCategorias', () => {
  it('lê a taxonomia da action categorias', async () => {
    invokeFunction.mockResolvedValue({ data: { categorias: CATEGORIAS }, error: null });

    await expect(fetchCategorias()).resolves.toEqual(CATEGORIAS);
    expect(invokeFunction).toHaveBeenCalledWith('query-product', { body: { action: 'categorias' } });
  });

  it('ignora linhas incompletas da taxonomia', async () => {
    invokeFunction.mockResolvedValue({
      data: { categorias: [{ codigo: '4', secao: 'Mercearia' }, { codigo: '', secao: 'X' }, { codigo: '9' }] },
      error: null,
    });

    await expect(fetchCategorias()).resolves.toEqual([{ codigo: '4', secao: 'Mercearia' }]);
  });

  it('propaga o erro da API', async () => {
    invokeFunction.mockResolvedValue({ data: null, error: new Error('sem rede') });
    await expect(fetchCategorias()).rejects.toThrow('sem rede');
  });
});

describe('SecaoBadge', () => {
  it('mostra o nome da seção', () => {
    render(<SecaoBadge secao="Hortifruti" />);
    expect(screen.getByText('Hortifruti')).toBeInTheDocument();
  });

  it('não mostra selo quando o produto não tem seção', () => {
    const { container } = render(<SecaoBadge secao={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SecaoFilter', () => {
  it('não aparece quando a taxonomia está indisponível', async () => {
    invokeFunction.mockResolvedValue({ data: { categorias: [] }, error: null });
    const { container } = render(<SecaoFilter value="" onChange={() => {}} />);

    await waitFor(() => expect(invokeFunction).toHaveBeenCalled());
    expect(container.querySelector('[aria-label="Filtrar por seção"]')).toBeNull();
  });

  it('lista as seções e devolve a escolhida', async () => {
    const user = userEvent.setup();
    invokeFunction.mockResolvedValue({ data: { categorias: CATEGORIAS }, error: null });
    const onChange = vi.fn();
    render(<SecaoFilter value="" onChange={onChange} />);

    const trigger = await screen.findByLabelText('Filtrar por seção');
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Hortifruti' }));

    expect(onChange).toHaveBeenCalledWith('Hortifruti');
  });

  it('devolve string vazia quando a pessoa escolhe "Todas as seções"', async () => {
    const user = userEvent.setup();
    invokeFunction.mockResolvedValue({ data: { categorias: CATEGORIAS }, error: null });
    const onChange = vi.fn();
    render(<SecaoFilter value="Hortifruti" onChange={onChange} />);

    const trigger = await screen.findByLabelText('Filtrar por seção');
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Todas as seções' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('filtra a lista pela busca, ignorando acento e caixa', async () => {
    const user = userEvent.setup();
    invokeFunction.mockResolvedValue({ data: { categorias: CATEGORIAS }, error: null });
    render(<SecaoFilter value="" onChange={() => {}} />);

    await user.click(await screen.findByLabelText('Filtrar por seção'));
    await user.type(await screen.findByLabelText('Buscar seção'), 'BEBE');

    expect(await screen.findByRole('option', { name: 'Bebê' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hortifruti' })).not.toBeInTheDocument();
  });
});

describe('cache da taxonomia', () => {
  it('reaproveita a lista carregada (uma chamada por sessão)', async () => {
    invokeFunction.mockResolvedValue({ data: { categorias: CATEGORIAS }, error: null });

    const [a, b] = await Promise.all([carregarCategorias(), carregarCategorias()]);
    expect(a).toEqual(CATEGORIAS);
    expect(b).toEqual(CATEGORIAS);
    expect(invokeFunction).toHaveBeenCalledTimes(1);
  });
});

describe('constantes', () => {
  it('usa um valor reservado para "sem seção"', () => {
    expect(SEM_SECAO).toBe('__sem_secao__');
  });
});
