import { describe, expect, it } from 'vitest';
import { calcularIndicadores, type FichaFlv } from '@/lib/flv';
import { podeAcessarView } from '@/lib/permissoes';

function ficha(defeitos: FichaFlv['defeitos']): FichaFlv {
  return {
    codigo: 'FP-REC-TEST-C',
    titulo: 'TESTE FLV',
    grupo: 'Legumes',
    pagina_pdf: 1,
    revisao: '01',
    data_revisao: '21/07/2026',
    fonte: 'Fort Atacadista — apostila de fichas técnicas FLV',
    pontos_atencao: [],
    codigos: [{ tipo: 'ENTRADA', codigo: '123456' }],
    defeitos,
  };
}

const base = ficha([
  { ordem: 0, grupo: 'PODRIDAO', nome: 'Podridão', cat1: 1, cat2: null, detalhe: 'Bolor e mofo.' },
  { ordem: 1, grupo: 'GRAVE', nome: 'Dano Mecânico', cat1: 3, cat2: null, detalhe: null },
  { ordem: 2, grupo: 'LEVE', nome: 'Sujidade', cat1: 10, cat2: null, detalhe: null },
]);

describe('calcularIndicadores da ficha FLV', () => {
  it('sugere aprovado quando nenhum defeito passa do CAT I', () => {
    const resultado = calcularIndicadores(base, 100, { 0: 1, 1: 3, 2: 10 });
    expect(resultado.sugestao).toBe('aprovado');
    expect(resultado.violacoes).toHaveLength(0);
    expect(resultado.itens[0].percentual).toBe(1);
  });

  it('sugere rejeitado quando podridão passa do CAT I', () => {
    const resultado = calcularIndicadores(base, 100, { 0: 2 });
    expect(resultado.sugestao).toBe('rejeitado');
    expect(resultado.violacoes[0].nome).toBe('Podridão');
  });

  it('sugere rebaixa quando um defeito grave passa do CAT I', () => {
    const resultado = calcularIndicadores(base, 50, { 1: 2 });
    expect(resultado.sugestao).toBe('rebaixa');
    expect(resultado.itens[1].percentual).toBe(4);
  });

  it('sugere ressalva quando só defeito leve passa do CAT I', () => {
    const resultado = calcularIndicadores(base, 100, { 2: 11 });
    expect(resultado.sugestao).toBe('ressalva');
  });

  it('ignora tolerâncias ausentes (cat1 null)', () => {
    const semLimite = ficha([
      { ordem: 0, grupo: 'LEVE', nome: 'X', cat1: null, cat2: null, detalhe: null },
    ]);
    const resultado = calcularIndicadores(semLimite, 10, { 0: 10 });
    expect(resultado.itens[0].dentro).toBeNull();
    expect(resultado.sugestao).toBe('aprovado');
  });
});

describe('permissão da tela Recebimento FLV', () => {
  it('libera admin e encarregado e bloqueia os demais', () => {
    expect(podeAcessarView('admin', false, 'recebimento')).toBe(true);
    expect(podeAcessarView('encarregado', false, 'recebimento')).toBe(true);
    expect(podeAcessarView('encarregado', true, 'recebimento')).toBe(true);
    expect(podeAcessarView('user', false, 'recebimento')).toBe(false);
    expect(podeAcessarView('col_validade', false, 'recebimento')).toBe(false);
  });
});
