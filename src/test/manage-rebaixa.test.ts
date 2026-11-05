import { describe, expect, it } from 'vitest';
import {
  canUseRebaixa,
  normalizeMotivo,
  normalizePrice,
  normalizeQuantity,
  normalizeTipo,
  normalizeValidade,
  parseItem,
  suggestedPriceFromCost,
  validUuid,
  withCatalogCost,
} from '../../api/manage-rebaixa';

const UUID = '6f9619ff-8b86-d011-b42d-00c04fc964ff';

/** Item UN mínimo, com os campos que a tela envia. */
function unItem(overrides: Record<string, unknown> = {}) {
  return {
    ean: '7891000315507',
    codigo: '123',
    descricao: 'LEITE INTEGRAL 1L',
    tipo: 'UN',
    validade: '2026-10-30T23:59:59.000Z',
    quantidade: 4,
    ...overrides,
  };
}

/** Item KG mínimo, com o motivo obrigatório. */
function kgItem(overrides: Record<string, unknown> = {}) {
  return {
    ean: '2000000000012',
    codigo: '456',
    descricao: 'BANANA PRATA',
    tipo: 'KG',
    motivo: 'Qualidade',
    quantidade: 2.5,
    ...overrides,
  };
}

describe('permissões da rebaixa', () => {
  it('libera admin, encarregado e enc. flv', () => {
    expect(canUseRebaixa('admin')).toBe(true);
    expect(canUseRebaixa('encarregado')).toBe(true);
    expect(canUseRebaixa('enc_flv')).toBe(true);
  });

  it('recusa os demais papéis e valores vazios', () => {
    expect(canUseRebaixa('user')).toBe(false);
    expect(canUseRebaixa('promotor')).toBe(false);
    expect(canUseRebaixa('col_validade')).toBe(false);
    expect(canUseRebaixa(undefined)).toBe(false);
    expect(canUseRebaixa(null)).toBe(false);
  });
});

describe('normalizeTipo', () => {
  it('aceita KG e UN em qualquer caixa e com espaços', () => {
    expect(normalizeTipo('kg')).toBe('KG');
    expect(normalizeTipo(' UN ')).toBe('UN');
  });

  it('recusa tipos desconhecidos', () => {
    expect(normalizeTipo('CX')).toBeNull();
    expect(normalizeTipo('')).toBeNull();
    expect(normalizeTipo(undefined)).toBeNull();
    expect(normalizeTipo(10)).toBeNull();
  });
});

describe('normalizeMotivo', () => {
  it('devolve o motivo canônico sem diferenciar maiúsculas', () => {
    expect(normalizeMotivo('excesso')).toEqual({ ok: true, value: 'Excesso' });
    expect(normalizeMotivo('QUALIDADE')).toEqual({ ok: true, value: 'Qualidade' });
    expect(normalizeMotivo('excesso/qualidade')).toEqual({ ok: true, value: 'Excesso/qualidade' });
  });

  it('trata vazio como "sem motivo"', () => {
    expect(normalizeMotivo('')).toEqual({ ok: true, value: null });
    expect(normalizeMotivo(null)).toEqual({ ok: true, value: null });
    expect(normalizeMotivo(undefined)).toEqual({ ok: true, value: null });
  });

  it('recusa motivo fora da lista', () => {
    expect(normalizeMotivo('Avaria').ok).toBe(false);
    expect(normalizeMotivo(123).ok).toBe(false);
  });
});

describe('normalizeQuantity', () => {
  it('aceita número e o padrão brasileiro com vírgula', () => {
    expect(normalizeQuantity(4)).toBe(4);
    expect(normalizeQuantity('12,500')).toBe(12.5);
    expect(normalizeQuantity('12.5')).toBe(12.5);
  });

  it('arredonda para até 3 casas (kg fracionado)', () => {
    expect(normalizeQuantity('1,23456')).toBe(1.235);
  });

  it('recusa zero, negativo, texto e valores acima do limite', () => {
    expect(normalizeQuantity(0)).toBeNull();
    expect(normalizeQuantity(-1)).toBeNull();
    expect(normalizeQuantity('abc')).toBeNull();
    expect(normalizeQuantity(1_000_001)).toBeNull();
    expect(normalizeQuantity(null)).toBeNull();
  });
});

describe('normalizePrice', () => {
  it('aceita reais com vírgula, ponto e símbolo', () => {
    expect(normalizePrice('2,50')).toEqual({ ok: true, value: 2.5 });
    expect(normalizePrice('2.50')).toEqual({ ok: true, value: 2.5 });
    expect(normalizePrice('R$ 3,45')).toEqual({ ok: true, value: 3.45 });
  });

  it('trata vazio como "sem preço"', () => {
    expect(normalizePrice('')).toEqual({ ok: true, value: null });
    expect(normalizePrice(null)).toEqual({ ok: true, value: null });
  });

  it('recusa preço negativo, inválido ou acima do limite', () => {
    expect(normalizePrice('-1').ok).toBe(false);
    expect(normalizePrice('abc').ok).toBe(false);
    expect(normalizePrice(1_000_001).ok).toBe(false);
  });
});

describe('normalizeValidade', () => {
  it('normaliza a data para ISO', () => {
    expect(normalizeValidade('2026-10-30T23:59:59.000Z')).toEqual({
      ok: true,
      value: '2026-10-30T23:59:59.000Z',
    });
  });

  it('trata vazio como sem data', () => {
    expect(normalizeValidade('')).toEqual({ ok: true, value: null });
    expect(normalizeValidade(undefined)).toEqual({ ok: true, value: null });
  });

  it('recusa data inválida', () => {
    expect(normalizeValidade('30/10/2026').ok).toBe(false);
    expect(normalizeValidade(20261030).ok).toBe(false);
  });
});

describe('suggestedPriceFromCost', () => {
  it('usa metade do custo', () => {
    expect(suggestedPriceFromCost(5)).toBe(2.5);
    expect(suggestedPriceFromCost(7.5)).toBe(3.75);
  });

  it('aplica o piso de R$ 0,99', () => {
    expect(suggestedPriceFromCost(0.53)).toBe(0.99);
    expect(suggestedPriceFromCost(1)).toBe(0.99);
  });

  it('usa o piso quando o custo é inválido ou ausente', () => {
    expect(suggestedPriceFromCost(0)).toBe(0.99);
    expect(suggestedPriceFromCost(-3)).toBe(0.99);
    expect(suggestedPriceFromCost(Number.NaN)).toBe(0.99);
  });
});

describe('validUuid', () => {
  it('aceita UUID e recusa o resto', () => {
    expect(validUuid(UUID)).toBe(true);
    expect(validUuid('123')).toBe(false);
    expect(validUuid(undefined)).toBe(false);
  });
});

describe('parseItem', () => {
  it('aceita UN com data de vencimento', () => {
    const result = parseItem(unItem());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.tipo).toBe('UN');
    expect(result.item.motivo).toBeNull();
    expect(result.item.validade).toBe('2026-10-30T23:59:59.000Z');
    expect(result.item.quantidade).toBe(4);
  });

  it('aceita KG com motivo e sem validade', () => {
    const result = parseItem(kgItem({ motivo: 'excesso/qualidade', validade: '2026-10-30T00:00:00.000Z' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.tipo).toBe('KG');
    expect(result.item.motivo).toBe('Excesso/qualidade');
    expect(result.item.validade).toBeNull();
  });

  it('infere o tipo quando o cliente não manda', () => {
    const comMotivo = parseItem({ ...kgItem(), tipo: undefined });
    expect(comMotivo.ok && comMotivo.item.tipo).toBe('KG');

    const semMotivo = parseItem({ ...unItem(), tipo: undefined });
    expect(semMotivo.ok && semMotivo.item.tipo).toBe('UN');
  });

  it('aceita o vínculo com a validade', () => {
    const result = parseItem(unItem({ validade_id: UUID }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.validadeId).toBe(UUID);
  });

  it('recusa produto sem EAN, código ou descrição válidos', () => {
    expect(parseItem(null).ok).toBe(false);
    expect(parseItem(unItem({ ean: 'abc' })).ok).toBe(false);
    expect(parseItem(unItem({ codigo: '' })).ok).toBe(false);
    expect(parseItem(unItem({ descricao: '   ' })).ok).toBe(false);
    expect(parseItem(unItem({ descricao: 'X'.repeat(151) })).ok).toBe(false);
  });

  it('recusa KG sem motivo e UN com motivo', () => {
    expect(parseItem(kgItem({ motivo: null })).ok).toBe(false);
    expect(parseItem(unItem({ motivo: 'Excesso' })).ok).toBe(false);
  });

  it('recusa UN sem data e data inválida', () => {
    expect(parseItem(unItem({ validade: null })).ok).toBe(false);
    expect(parseItem(unItem({ validade: '30/10/2026' })).ok).toBe(false);
  });

  it('recusa quantidade e preços inválidos', () => {
    expect(parseItem(unItem({ quantidade: 0 })).ok).toBe(false);
    expect(parseItem(unItem({ preco_sugerido: 'abc' })).ok).toBe(false);
    expect(parseItem(unItem({ preco_final: -2 })).ok).toBe(false);
  });

  it('recusa vínculo de validade que não é UUID', () => {
    expect(parseItem(unItem({ validade_id: '123' })).ok).toBe(false);
  });
});

describe('withCatalogCost', () => {
  it('completa PMZ, sugestão e preço final a partir do custo', () => {
    const parsed = parseItem(kgItem({ preco_sugerido: null, preco_final: null }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const item = withCatalogCost(parsed.item, 5);
    expect(item.pmz).toBe(5);
    expect(item.precoSugerido).toBe(2.5);
    expect(item.precoFinal).toBe(2.5);
  });

  it('respeita os preços informados pela tela', () => {
    const parsed = parseItem(kgItem({ pmz: 10, preco_sugerido: 4, preco_final: 3.5 }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const item = withCatalogCost(parsed.item, 5);
    expect(item.pmz).toBe(10);
    expect(item.precoSugerido).toBe(4);
    expect(item.precoFinal).toBe(3.5);
  });

  it('deixa os preços vazios quando não há custo nem valor informado', () => {
    const parsed = parseItem(kgItem());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const item = withCatalogCost(parsed.item, null);
    expect(item.pmz).toBeNull();
    expect(item.precoSugerido).toBeNull();
    expect(item.precoFinal).toBeNull();
  });
});
