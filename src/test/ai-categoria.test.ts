import { describe, expect, it } from 'vitest';
import {
  buildCategoriaPrompt,
  parseCategoriaReview,
  resolveSecao,
  CANDIDATOS_PADRAO,
  MAX_CANDIDATOS,
  type CandidatoSecao,
  type SecaoTaxonomia,
} from '../../api/_lib/ai-categoria';

const SECOES: SecaoTaxonomia[] = [
  { codigo: '3', secao: 'Snacks e Doces' },
  { codigo: '4', secao: 'Mercearia' },
  { codigo: '8', secao: 'Hortifruti' },
  { codigo: '19', secao: 'Outros' },
];

const CANDIDATOS: CandidatoSecao[] = [
  { codigo: '111', descricao: 'MENTOS MAST 37G', secaoAtual: 'Outros' },
  { codigo: '222', descricao: 'CUPUACU KG', secaoAtual: 'Outros' },
  { codigo: '333', descricao: 'TESTE 01', secaoAtual: null },
];

describe('buildCategoriaPrompt', () => {
  it('lista as seções e os produtos candidatos', () => {
    const { system, prompt } = buildCategoriaPrompt(CANDIDATOS, SECOES);

    expect(system).toContain('Responda APENAS com um objeto JSON válido');
    expect(system).toContain('Não proponha a seção "Outros"');
    expect(prompt).toContain('Snacks e Doces');
    expect(prompt).toContain('111 | MENTOS MAST 37G | atual: Outros');
    expect(prompt).toContain('333 | TESTE 01 | atual: sem seção');
  });
});

describe('resolveSecao', () => {
  it('resolve o nome oficial ignorando caixa e espaços', () => {
    expect(resolveSecao('hortifruti', SECOES)?.codigo).toBe('8');
    expect(resolveSecao('  Mercearia ', SECOES)?.codigo).toBe('4');
  });

  it('rejeita seção que não existe na taxonomia', () => {
    expect(resolveSecao('Bebidas', SECOES)).toBeNull();
    expect(resolveSecao('', SECOES)).toBeNull();
    expect(resolveSecao(42, SECOES)).toBeNull();
  });
});

describe('parseCategoriaReview', () => {
  it('aceita as propostas válidas', () => {
    const texto = JSON.stringify({
      propostas: [
        { codigo: '111', secao: 'Snacks e Doces', confianca: 0.95 },
        { codigo: '222', secao: 'Hortifruti', confianca: 0.8 },
      ],
      avisos: ['MENTOS parece claro'],
    });

    const review = parseCategoriaReview(texto, CANDIDATOS, SECOES);

    expect(review?.propostas).toHaveLength(2);
    expect(review?.propostas[0]).toEqual({
      codigo: '111',
      descricao: 'MENTOS MAST 37G',
      secaoAtual: 'Outros',
      secao: 'Snacks e Doces',
      secaoCodigo: '3',
      confianca: 0.95,
    });
    expect(review?.avisos).toEqual(['MENTOS parece claro']);
  });

  it('descarta seção que não existe na taxonomia', () => {
    const texto = JSON.stringify({ propostas: [{ codigo: '111', secao: 'Bebidas', confianca: 1 }] });
    expect(parseCategoriaReview(texto, CANDIDATOS, SECOES)?.propostas).toHaveLength(0);
  });

  it('nunca aceita a seção genérica "Outros" como proposta', () => {
    const texto = JSON.stringify({ propostas: [{ codigo: '111', secao: 'Outros', confianca: 1 }] });
    expect(parseCategoriaReview(texto, CANDIDATOS, SECOES)?.propostas).toHaveLength(0);
  });

  it('descarta produto que não está na lista de candidatos', () => {
    const texto = JSON.stringify({ propostas: [{ codigo: '999', secao: 'Mercearia', confianca: 1 }] });
    expect(parseCategoriaReview(texto, CANDIDATOS, SECOES)?.propostas).toHaveLength(0);
  });

  it('mantém só a primeira proposta de cada produto', () => {
    const texto = JSON.stringify({
      propostas: [
        { codigo: '111', secao: 'Snacks e Doces', confianca: 0.9 },
        { codigo: '111', secao: 'Mercearia', confianca: 0.5 },
      ],
    });
    const review = parseCategoriaReview(texto, CANDIDATOS, SECOES);
    expect(review?.propostas).toHaveLength(1);
    expect(review?.propostas[0].secao).toBe('Snacks e Doces');
  });

  it('normaliza a confiança dentro de 0 a 1', () => {
    const texto = JSON.stringify({ propostas: [{ codigo: '111', secao: 'Mercearia', confianca: 85 }] });
    expect(parseCategoriaReview(texto, CANDIDATOS, SECOES)?.propostas[0].confianca).toBe(0.85);
  });

  it('devolve null quando a resposta não é JSON', () => {
    expect(parseCategoriaReview('desculpe, não sei', CANDIDATOS, SECOES)).toBeNull();
  });

  it('aceita a resposta dentro de cercas de código', () => {
    const texto = '```json\n{"propostas":[{"codigo":"111","secao":"Mercearia","confianca":0.7}]}\n```';
    expect(parseCategoriaReview(texto, CANDIDATOS, SECOES)?.propostas).toHaveLength(1);
  });
});

describe('limites do lote', () => {
  it('mantém o lote dentro do tempo medido', () => {
    expect(CANDIDATOS_PADRAO).toBeLessThanOrEqual(MAX_CANDIDATOS);
    expect(CANDIDATOS_PADRAO).toBe(20);
    expect(MAX_CANDIDATOS).toBe(30);
  });
});
