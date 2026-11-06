import { describe, expect, it } from 'vitest';
import { estimateBase64Bytes, MAX_IMAGE_DIMENSION, targetSize } from '@/lib/ai-image';

describe('Preparação da foto da etiqueta', () => {
  it('estima o tamanho decodificado do base64', () => {
    expect(estimateBase64Bytes('')).toBe(0);
    expect(estimateBase64Bytes('AAAA')).toBe(3);
    expect(estimateBase64Bytes('AAA=')).toBe(2);
  });

  it('limita o lado maior mantendo a proporção', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(4000, 2000)).toEqual({ width: MAX_IMAGE_DIMENSION, height: 800 });
    expect(targetSize(1000, 4000)).toEqual({ width: 400, height: MAX_IMAGE_DIMENSION });
  });

  it('não quebra com dimensões desconhecidas', () => {
    expect(targetSize(0, 0)).toEqual({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION });
  });
});
