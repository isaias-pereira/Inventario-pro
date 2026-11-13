import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  GUIAS,
  buscarGuia,
  guiaParaDescricao,
  normalizarTexto,
  urlGuia,
  type ChaveEstagio,
  type IconePasso,
} from '../data/guias';
import { IlustracaoProduto } from '../components/guias/IlustracaoProduto';
import { IlustracaoPasso } from '../components/guias/IlustracaoPasso';
import GuiaPublico from '../pages/GuiaPublico';
import GuiasIndice from '../pages/GuiasIndice';

// O Analytics é opcional e não pode quebrar a página.
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  trackView: vi.fn(),
  startAnalytics: vi.fn(),
}));

const ICONES: IconePasso[] = ['olho', 'toque', 'cheiro', 'peso', 'som', 'casca', 'folha', 'talo'];
const CHAVES: ChaveEstagio[] = ['espere', 'no-ponto', 'passou'];

beforeEach(() => {
  cleanup();
});

describe('conteúdo dos guias', () => {
  it('tem os 13 produtos do setor de hortifrui', () => {
    expect(GUIAS).toHaveLength(13);
    expect(GUIAS.map((g) => g.slug)).toEqual(
      expect.arrayContaining([
        'tomate',
        'banana-prata',
        'mamao-papaia',
        'abacate',
        'maca',
        'laranja',
        'melancia',
        'abacaxi',
        'batata',
        'cebola',
        'cenoura',
        'repolho',
        'alface',
      ]),
    );
  });

  it('usa slugs únicos, sem acento e sem espaço', () => {
    const slugs = GUIAS.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(normalizarTexto(slug)).toBe(slug);
    }
  });

  it('tem nome, resumo, dica e armazenamento em todos os guias', () => {
    for (const guia of GUIAS) {
      expect(guia.nome.trim().length).toBeGreaterThan(2);
      expect(guia.resumo.trim().length).toBeGreaterThan(20);
      expect(guia.dica.trim().length).toBeGreaterThan(20);
      expect(guia.armazenamento.trim().length).toBeGreaterThan(20);
    }
  });

  it('tem os 3 estágios (espere / no ponto / passou) com veredito', () => {
    for (const guia of GUIAS) {
      expect(guia.estagios).toHaveLength(3);
      expect(guia.estagios.map((e) => e.chave)).toEqual(CHAVES);
      for (const estagio of guia.estagios) {
        expect(estagio.nome.trim().length).toBeGreaterThan(2);
        expect(estagio.veredito.trim().length).toBeGreaterThan(2);
        expect(estagio.descricao.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it('tem pelo menos 3 passos com ícone válido', () => {
    for (const guia of GUIAS) {
      expect(guia.passos.length).toBeGreaterThanOrEqual(3);
      for (const passo of guia.passos) {
        expect(ICONES).toContain(passo.icone);
        expect(passo.titulo.trim().length).toBeGreaterThan(2);
        expect(passo.texto.trim().length).toBeGreaterThan(20);
      }
    }
  });
});

describe('busca de guia', () => {
  it('encontra pelo slug', () => {
    expect(buscarGuia('tomate')?.nome).toBe('Tomate');
    expect(buscarGuia('MAMAO-PAPAIA')?.nome).toBe('Mamão papaia');
  });

  it('não encontra guid inexistente nem slug vazio', () => {
    expect(buscarGuia('nao-existe')).toBeUndefined();
    expect(buscarGuia('')).toBeUndefined();
  });

  it('monta a URL pública do guia', () => {
    expect(urlGuia('tomate', 'https://exemplo.com')).toBe('https://exemplo.com/g/tomate');
  });

  it('liga a descrição do catálogo ao guia certo', () => {
    expect(guiaParaDescricao('TOMATE ITALIANO KG')?.slug).toBe('tomate');
    expect(guiaParaDescricao('BANANA PRATA NACIONAL')?.slug).toBe('banana-prata');
    expect(guiaParaDescricao('MAMÃO PAPAIA')?.slug).toBe('mamao-papaia');
    expect(guiaParaDescricao('CEBOLA')?.slug).toBe('cebola');
    expect(guiaParaDescricao('ARroz Tipo 1')?.slug).toBeUndefined();
  });
});

describe('ilustrações', () => {
  it('desenha um SVG para cada produto e estágio', () => {
    for (const guia of GUIAS) {
      for (const estagio of [0, 1, 2] as const) {
        const { container, unmount } = render(
          <IlustracaoProduto tipo={guia.tipo} estagio={estagio} />,
        );
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('viewBox')).toBe('0 0 200 200');
        unmount();
      }
    }
  });

  it('desenha todos os ícones de passo', () => {
    for (const icone of ICONES) {
      const { container, unmount } = render(<IlustracaoPasso icone={icone} />);
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });
});

describe('página pública (sem login)', () => {
  const renderPublico = (slug: string) =>
    render(
      <MemoryRouter initialEntries={[`/g/${slug}`]}>
        <Routes>
          <Route path="/g/:slug" element={<GuiaPublico />} />
        </Routes>
      </MemoryRouter>,
    );

  it('mostra o guia do produto sem pedir login', () => {
    renderPublico('tomate');
    expect(screen.getByRole('heading', { name: 'Tomate' })).toBeInTheDocument();
    expect(screen.getByText('Como escolher')).toBeInTheDocument();
    expect(screen.getByText('Dica do encarregado')).toBeInTheDocument();
    // os três estágios aparecem com o veredito
    expect(screen.getByText('Espere 2 a 3 dias')).toBeInTheDocument();
    expect(screen.getByText('Lever hoje')).toBeInTheDocument();
    expect(screen.getByText('Não leve')).toBeInTheDocument();
  });

  it('explica o que fazer quando o guia não existe', () => {
    renderPublico('nao-existe');
    expect(screen.getByText('Não encontramos esse guia')).toBeInTheDocument();
  });

  it('lista todos os produtos no índice público', () => {
    render(
      <MemoryRouter initialEntries={['/g']}>
        <Routes>
          <Route path="/g" element={<GuiasIndice />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Como escolher no ponto certo/i })).toBeInTheDocument();
    for (const guia of GUIAS) {
      expect(screen.getByText(guia.nome)).toBeInTheDocument();
    }
  });
});
