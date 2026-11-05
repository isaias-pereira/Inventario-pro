import { describe, expect, it } from 'vitest';
import {
  formatMargin,
  formatMoney,
  formatMoneyInput,
  formatQuantity,
  marginPercent,
  motivoFromValidade,
  parseDecimalInput,
  rebaixaCustoMap,
  rebaixaTipoMap,
  toDateInput,
  toSpreadsheetItems,
  tipoFromMotivo,
  type RebaixaItem,
} from '../lib/rebaixa';

function item(overrides: Partial<RebaixaItem> = {}): RebaixaItem {
  return {
    id: '1',
    ean: '7891000315507',
    codigo: '123',
    descricao: 'LEITE INTEGRAL 1L',
    tipo: 'UN',
    validade: '2026-10-30T23:59:59.000Z',
    motivo: null,
    quantidade: 4,
    pmz: 5,
    preco_sugerido: 2.5,
    preco_final: 2.5,
    validade_id: null,
    created_by: 'admin',
    created_at: '2026-11-05T10:00:00.000Z',
    ...overrides,
  };
}

describe('parseDecimalInput', () => {
  it('aceita o padrão brasileiro e o ponto decimal', () => {
    expect(parseDecimalInput('12,500')).toBe(12.5);
    expect(parseDecimalInput('12.5')).toBe(12.5);
    expect(parseDecimalInput('1.234,56')).toBe(1234.56);
  });

  it('ignora símbolos de moeda e espaços', () => {
    expect(parseDecimalInput(' R$ 2,50 ')).toBe(2.5);
  });

  it('devolve null para vazio ou texto inválido', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('R$')).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('mostra kg com 3 casas e UN inteira', () => {
    expect(formatQuantity(12.5, 'KG')).toBe('12,500');
    expect(formatQuantity(4.6, 'UN')).toBe('5');
  });

  it('protege contra valores inválidos', () => {
    expect(formatQuantity(Number.NaN, 'UN')).toBe('0');
    expect(formatQuantity(Number.POSITIVE_INFINITY, 'KG')).toBe('0');
  });
});

describe('formatMoney e formatMoneyInput', () => {
  it('formata reais com vírgula', () => {
    expect(formatMoney(2.5)).toBe('R$ 2,50');
    expect(formatMoney(0)).toBe('R$ 0,00');
  });

  it('usa travessão quando não há preço', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
  });

  it('devolve o valor sem o símbolo para os inputs', () => {
    expect(formatMoneyInput(2.5)).toBe('2,50');
    expect(formatMoneyInput(89.8442)).toBe('89,84');
  });
});

describe('marginPercent e formatMargin', () => {
  it('calcula ((PMZ - sugestão) / PMZ) * 100', () => {
    expect(marginPercent(5, 2.5)).toBe(50);
    expect(marginPercent(0.53, 0.99)).toBeCloseTo(-86.79245283, 6);
  });

  it('devolve null sem custo ou sugestão', () => {
    expect(marginPercent(null, 2.5)).toBeNull();
    expect(marginPercent(5, null)).toBeNull();
    expect(marginPercent(0, 2.5)).toBeNull();
  });

  it('formata a margem com uma casa e vírgula', () => {
    expect(formatMargin(5, 2.5)).toBe('50,0%');
    expect(formatMargin(null, 2.5)).toBe('—');
  });
});

describe('motivo e tipo vindos da Validade', () => {
  it('normaliza o motivo gravado na Validade', () => {
    expect(motivoFromValidade('Excesso')).toBe('Excesso');
    expect(motivoFromValidade('qualidade')).toBe('Qualidade');
    expect(motivoFromValidade('excesso/qualidade')).toBe('Excesso/qualidade');
    expect(motivoFromValidade('Avaria')).toBeNull();
    expect(motivoFromValidade(null)).toBeNull();
  });

  it('item com motivo é KG e sem motivo é UN', () => {
    expect(tipoFromMotivo('Excesso')).toBe('KG');
    expect(tipoFromMotivo('Qualidade')).toBe('KG');
    expect(tipoFromMotivo(null)).toBe('UN');
    expect(tipoFromMotivo('')).toBe('UN');
  });
});

describe('toDateInput', () => {
  it('converte a data local para aaaa-mm-dd', () => {
    expect(toDateInput(new Date(2026, 9, 30, 12).toISOString())).toBe('2026-10-30');
  });

  it('devolve vazio sem data ou com data inválida', () => {
    expect(toDateInput(null)).toBe('');
    expect(toDateInput('data-invalida')).toBe('');
  });
});

describe('toSpreadsheetItems', () => {
  it('leva o motivo KG para a descrição da oferta', () => {
    const [row] = toSpreadsheetItems([
      item({ tipo: 'KG', validade: null, motivo: 'Qualidade', preco_final: 3.45 }),
    ]);

    expect(row).toMatchObject({
      tipo: 'KG',
      oferta: 'Qualidade',
      precoFinal: 3.45,
      validade: null,
    });
  });

  it('mantém a descrição da oferta vazia em produtos UN', () => {
    const [row] = toSpreadsheetItems([item({ motivo: null })]);

    expect(row).toMatchObject({
      tipo: 'UN',
      oferta: '',
      precoFinal: 2.5,
    });
  });
});

describe('mapas da planilha', () => {
  it('mapeia código para tipo', () => {
    expect(rebaixaTipoMap([item(), item({ codigo: '456', tipo: 'KG' })])).toEqual({
      '123': 'UN',
      '456': 'KG',
    });
  });

  it('mapeia apenas custos válidos', () => {
    expect(
      rebaixaCustoMap([
        item({ codigo: '123', pmz: 5 }),
        item({ codigo: '456', pmz: 0 }),
        item({ codigo: '789', pmz: null }),
        item({ codigo: '101', pmz: Number.NaN }),
      ]),
    ).toEqual({ '123': 5 });
  });
});
