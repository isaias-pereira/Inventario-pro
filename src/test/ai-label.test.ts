import { describe, expect, it } from 'vitest';
import {
  mergeLabelWithProduct,
  normalizeLabel,
  parseConfidence,
  parseExpiryDate,
  parseIdentifier,
  parseJsonObject,
  parseTipo,
} from '../../api/_lib/ai-label';

describe('Leitura de etiqueta por IA', () => {
  it('lê a validade nos formatos que aparecem na etiqueta', () => {
    expect(parseExpiryDate('2027-03-12')).toBe('2027-03-12');
    expect(parseExpiryDate('12/03/2027')).toBe('2027-03-12');
    expect(parseExpiryDate('12-03-27')).toBe('2027-03-12');
    expect(parseExpiryDate('12.03.2027')).toBe('2027-03-12');
    expect(parseExpiryDate('Vence 05/11/2026')).toBe('2026-11-05');
    expect(parseExpiryDate('12 de março de 2027')).toBe('2027-03-12');
  });

  it('usa o padrão brasileiro em data ambígua e recusa data impossível', () => {
    expect(parseExpiryDate('03/04/2027')).toBe('2027-04-03');
    expect(parseExpiryDate('31/02/2027')).toBeNull();
    expect(parseExpiryDate('sem data')).toBeNull();
  });

  it('aceita timestamp ISO', () => {
    expect(parseExpiryDate('2027-03-12T23:59:59.000Z')).toBe('2027-03-12');
  });

  it('extrai o código de barras mesmo com ruído no texto', () => {
    expect(parseIdentifier('7891000315507')).toBe('7891000315507');
    expect(parseIdentifier('EAN: 789 1000 3155 07')).toBe('7891000315507');
    expect(parseIdentifier('abc')).toBeNull();
    expect(parseIdentifier('123')).toBeNull();
  });

  it('normaliza o tipo do produto', () => {
    expect(parseTipo('KG')).toBe('KG');
    expect(parseTipo('balança')).toBe('KG');
    expect(parseTipo('UN')).toBe('UN');
    expect(parseTipo(null, 'BANANA NANICA KG')).toBe('KG');
    expect(parseTipo(null, 'LEITE INTEGRAL UHT')).toBeNull();
  });

  it('normaliza a confiança do modelo', () => {
    expect(parseConfidence(0.8)).toBe(0.8);
    expect(parseConfidence(80)).toBe(0.8);
    expect(parseConfidence('alta')).toBe(0.9);
    expect(parseConfidence(undefined)).toBe(0.5);
  });

  it('extrai o JSON mesmo com cercas de código e texto em volta', () => {
    expect(parseJsonObject('```json\n{"ean":"123"}\n```')).toEqual({ ean: '123' });
    expect(parseJsonObject('Aqui está: {"ean":"123"} — pronto')).toEqual({ ean: '123' });
    expect(parseJsonObject('{"descricao":"a { b } c"}')).toEqual({ descricao: 'a { b } c' });
    expect(parseJsonObject('sem json')).toBeNull();
  });

  it('normaliza a leitura e avisa o que não foi lido com segurança', () => {
    const label = normalizeLabel({
      ean: '7891000315507',
      descricao: 'banana nanica kg',
      validade: '12/03/2027',
      quantidade: 6,
      tipo: 'kg',
      confianca: 0.9,
    });
    expect(label.ean).toBe('7891000315507');
    expect(label.descricao).toBe('BANANA NANICA KG');
    expect(label.validade).toBe('2027-03-12');
    expect(label.quantidade).toBe(6);
    expect(label.tipo).toBe('KG');
    expect(label.confianca).toBe(0.9);
    expect(label.avisos).toHaveLength(0);
  });

  it('avisa quando a validade não é reconhecida', () => {
    const label = normalizeLabel({ ean: '7891000315507', validade: 'quinta feira' });
    expect(label.validade).toBeNull();
    expect(label.avisos.join(' ')).toContain('validade');
  });

  it('descarta quantidade fora do intervalo e normaliza a descrição', () => {
    const label = normalizeLabel({ descricao: 'x'.repeat(200), quantidade: 0 });
    expect(label.descricao).toHaveLength(150);
    expect(label.quantidade).toBeNull();
  });

  it('o catálogo manda em código, descrição e tipo', () => {
    const label = normalizeLabel({ ean: '111', descricao: 'NOME SUJO', tipo: 'UN' });
    const merged = mergeLabelWithProduct(label, {
      ean: '222',
      codigo: '333',
      descricao: 'NOME LIMPO',
      tipo: 'KG',
    });
    expect(merged).toEqual({ ean: '222', codigo: '333', descricao: 'NOME LIMPO', tipo: 'KG' });
  });

  it('sem produto no catálogo, a leitura da IA é preservada', () => {
    const label = normalizeLabel({ ean: '7891000315507', descricao: 'BANANA', tipo: 'KG' });
    const merged = mergeLabelWithProduct(label, null);
    expect(merged.ean).toBe('7891000315507');
    expect(merged.descricao).toBe('BANANA');
    expect(merged.tipo).toBe('KG');
  });
});
