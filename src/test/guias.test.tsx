import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GUIAS,
  buscarGuia,
  fotoPrincipal,
  guiaParaDescricao,
  normalizarTexto,
  urlGuia,
  type ChaveEstagio,
  type IconePasso,
} from '../data/guias';
import { IlustracaoProduto } from '../components/guias/IlustracaoProduto';
import { IlustracaoPasso } from '../components/guias/IlustracaoPasso';
import { fotoVersionada } from '../lib/fotos';
import GuiaPublico from '../pages/GuiaPublico';
import GuiasIndice from '../pages/GuiasIndice';

// O Analytics é opcional e não pode quebrar a página.
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  trackView: vi.fn(),
  startAnalytics: vi.fn(),
}));

const ICONES: IconePasso[] = ['olho', 'toque', 'cheiro', 'peso', 'som', 'casca', 'folha', 'talo'];
const CHAVES_VALIDAS: ChaveEstagio[] = ['espere', 'guardar', 'no-ponto', 'passou'];
/** Produtos que não amadurecem na banca: ficaram com 2 estágios. */
const DOIS_ESTAGIOS = ['cebola', 'cenoura', 'repolho'];
/**
 * Produto sem foto real do estado "passou" nos bancos livres: o guia ficou
 * com "espere" + "no ponto" e o alerta de passado vive na dica.
 */
const SEM_PASSADO = ['abacaxi'];

beforeEach(() => {
  cleanup();
});

describe('conteúdo dos guias', () => {
  it('tem os 13 produtos do setor de hortifrui', () => {
    expect(GUIAS).toHaveLength(13);
    expect(GUIAS.map((g) => g.slug)).toEqual(
      expect.arrayContaining([
        'tomate',
        'banana-nanica',
        'mamao-formosa',
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

  it('tem os estágios coerentes com a regra de maturação', () => {
    for (const guia of GUIAS) {
      const chaves = guia.estagios.map((e) => e.chave);
      for (const chave of chaves) expect(CHAVES_VALIDAS).toContain(chave);
      expect(new Set(chaves).size).toBe(chaves.length);

      if (DOIS_ESTAGIOS.includes(guia.slug)) {
        // não amadurecem na banca: "pode guardar" + "passou"
        expect(chaves).toEqual(['guardar', 'passou']);
      } else if (SEM_PASSADO.includes(guia.slug)) {
        // sem foto real do estado passado: "espere" + "no ponto"
        expect(chaves).toEqual(['espere', 'no-ponto']);
      } else {
        expect(chaves).toHaveLength(3);
        expect(['espere', 'guardar']).toContain(chaves[0]);
        expect(chaves[1]).toBe('no-ponto');
        expect(chaves[2]).toBe('passou');
      }

      for (const estagio of guia.estagios) {
        expect(estagio.nome.trim().length).toBeGreaterThan(2);
        expect(estagio.veredito.trim().length).toBeGreaterThan(2);
        expect(estagio.descricao.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it('nunca manda o cliente embora da loja', () => {
    // regra do encarregado: o guia ajuda a escolher melhor, não recusa a compra
    const proibido = /não leve|não levar|não compre|não pegue|não leve|avoid/i;
    for (const guia of GUIAS) {
      for (const estagio of guia.estagios) {
        expect(estagio.veredito).not.toMatch(proibido);
        expect(estagio.descricao).not.toMatch(proibido);
      }
      for (const passo of guia.passos) {
        expect(passo.texto).not.toMatch(proibido);
      }
      expect(guia.dica).not.toMatch(proibido);
      expect(guia.armazenamento).not.toMatch(proibido);
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
    expect(buscarGuia('MAMAO-FORMOSA')?.nome).toBe('Mamão formosa');
  });

  it('normaliza acento e cedilha no slug (QR digitado à mão)', () => {
    expect(buscarGuia('maça')?.slug).toBe('maca');
    expect(buscarGuia('mamão-formosa')?.slug).toBe('mamao-formosa');
    expect(buscarGuia('  MAÇA  ')?.slug).toBe('maca');
    expect(buscarGuia('banana-nanica')?.slug).toBe('banana-nanica');
  });

  it('abre o mamão formosa também pelo slug antigo do QR impresso', () => {
    expect(buscarGuia('mamao-formosa')?.nome).toBe('Mamão formosa');
    expect(buscarGuia('mamao-papaia')?.slug).toBe('mamao-formosa');
    expect(buscarGuia('MAMAO-PAPAIA')?.nome).toBe('Mamão formosa');
  });

  it('liga a descrição do catálogo ao guia do mamão formosa', () => {
    expect(guiaParaDescricao('MAMÃO FORMOSA')?.slug).toBe('mamao-formosa');
  });

  it('o guia não promete a foto de um produto podre no estágio passado', () => {
    // regra do setor: o cliente não vê produto em decomposição na etiqueta
    const proibido = /podre|apodrec|bolor|mofo|fungo|putref/i;
    for (const guia of GUIAS) {
      for (const estagio of guia.estagios) {
        expect(`${estagio.nome} ${estagio.descricao}`).not.toMatch(proibido);
      }
    }
  });

  it('não encontra guid inexistente nem slug vazio', () => {
    expect(buscarGuia('nao-existe')).toBeUndefined();
    expect(buscarGuia('')).toBeUndefined();
  });

  it('abre o guia da banana nanica também pelo slug antigo do QR impresso', () => {
    expect(buscarGuia('banana-nanica')?.nome).toBe('Banana nanica');
    expect(buscarGuia('banana-prata')?.slug).toBe('banana-nanica');
    expect(buscarGuia('BANANA-PRATA')?.nome).toBe('Banana nanica');
  });

  it('monta a URL pública do guia', () => {
    expect(urlGuia('tomate', 'https://exemplo.com')).toBe('https://exemplo.com/g/tomate');
  });

  it('liga a descrição do catálogo ao guia certo', () => {
    expect(guiaParaDescricao('TOMATE ITALIANO KG')?.slug).toBe('tomate');
    expect(guiaParaDescricao('BANANA NANICA')?.slug).toBe('banana-nanica');
    expect(guiaParaDescricao('BANANA PRATA NACIONAL')?.slug).toBe('banana-nanica');
    expect(guiaParaDescricao('MAMÃO PAPAIA')?.slug).toBe('mamao-formosa');
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

describe('fotos dos produtos', () => {
  it('todos os estágios têm foto e o arquivo existe no projeto', () => {
    for (const guia of GUIAS) {
      for (const estagio of guia.estagios) {
        expect(estagio.foto, `sem foto: ${guia.slug}/${estagio.chave}`).toBeTruthy();
        expect(estagio.foto).toMatch(/^\/guias\/[a-z-]+-\d+\.webp$/);
        const arquivo = resolve(process.cwd(), 'public', estagio.foto.replace(/^\//, ''));
        expect(existsSync(arquivo), `foto ausente: ${estagio.foto}`).toBe(true);
      }
    }
  });

  it('a foto de capa é a do estado "no ponto"', () => {
    for (const guia of GUIAS) {
      const noPonto = guia.estagios.find((e) => e.chave === 'no-ponto') ?? guia.estagios[0];
      expect(fotoPrincipal(guia)).toBe(noPonto.foto);
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
    expect(screen.getByText('Dica Extra')).toBeInTheDocument();
    // os três estágios aparecem com o veredito
    expect(screen.getByText('Espere 2 a 3 dias')).toBeInTheDocument();
    expect(screen.getByText('Leve hoje')).toBeInTheDocument();
    expect(screen.getByText('Prefira outro')).toBeInTheDocument();
  });

  it('abre com o cartão do produto: foto, família e nome', () => {
    renderPublico('tomate');
    const capa = screen.getByRole('region', { name: 'Tomate' });
    expect(within(capa).getByRole('heading', { level: 1, name: 'Tomate' })).toBeInTheDocument();
    expect(within(capa).getByText('Legumes')).toBeInTheDocument();
    expect(within(capa).getByAltText('Tomate no ponto certo')).toBeInTheDocument();
    expect(within(capa).getByText(GUIAS.find((g) => g.slug === 'tomate')!.resumo)).toBeInTheDocument();
  });

  it('destaca o bloco "Como escolher" com um cartão por passo', () => {
    renderPublico('tomate');
    const bloco = screen.getByRole('region', { name: 'Como escolher' });
    // Um item de lista por passo, com o número da ordem.
    expect(within(bloco).getAllByRole('listitem')).toHaveLength(4);
    expect(within(bloco).getByText('Olhe a cor')).toBeInTheDocument();
    expect(within(bloco).getByText('01')).toBeInTheDocument();
    expect(within(bloco).getByText('04')).toBeInTheDocument();
  });

  it('mostra a banana como nanica, inclusive no link antigo do QR', () => {
    renderPublico('banana-nanica');
    expect(screen.getByRole('heading', { name: 'Banana nanica' })).toBeInTheDocument();
    cleanup();
    renderPublico('banana-prata');
    expect(screen.getByRole('heading', { name: 'Banana nanica' })).toBeInTheDocument();
  });

  it('usa "pode guardar" nos produtos que não amadurecem na banca', () => {
    renderPublico('batata');
    expect(screen.getByText('Pode guardar')).toBeInTheDocument();
    expect(screen.getByText('Cozinhe hoje')).toBeInTheDocument();
    expect(screen.getByText('Prefira outra')).toBeInTheDocument();
  });

  it('explica o que fazer quando o guia não existe', () => {
    renderPublico('nao-existe');
    expect(screen.getByText('Não encontramos esse guia')).toBeInTheDocument();
  });

  it('mostra a foto do produto (e não um desenho)', () => {
    renderPublico('tomate');
    const capa = screen.getByAltText('Tomate no ponto certo');
    expect(capa).toHaveAttribute('src', fotoVersionada('/guias/tomate-2.webp'));
    expect(screen.getByAltText('Tomate: Verde e firme')).toHaveAttribute(
      'src',
      fotoVersionada('/guias/tomate-1.webp'),
    );
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
