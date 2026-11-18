/**
 * Estado do lote aberto no cabeçalho do Inventário.
 *
 * Cobre o bug do lote que ficava "fixo": a resposta sem lote (`lote_numero:
 * null`) precisa zerar o número e o nome, e não manter os anteriores.
 */
import { describe, expect, it } from 'vitest';
import { loteAbertoDaResposta } from '@/lib/inventory';

describe('lote aberto do Inventário', () => {
  it('lê número e nome do lote aberto', () => {
    expect(loteAbertoDaResposta({ lote_numero: 29, lote_nome: 'TESTE CX FD SC' }))
      .toEqual({ numero: 29, nome: 'TESTE CX FD SC' });
  });

  it('zera o lote quando a API responde sem lote aberto', () => {
    expect(loteAbertoDaResposta({ lote_numero: null, lote_nome: null }))
      .toEqual({ numero: null, nome: null });
    expect(loteAbertoDaResposta({}))
      .toEqual({ numero: null, nome: null });
    expect(loteAbertoDaResposta(null)).toEqual({ numero: null, nome: null });
    expect(loteAbertoDaResposta(undefined)).toEqual({ numero: null, nome: null });
  });

  it('não aceita número em texto nem nome em branco', () => {
    expect(loteAbertoDaResposta({ lote_numero: '29' as unknown as number, lote_nome: '   ' }))
      .toEqual({ numero: null, nome: null });
  });
});
