import { describe, expect, it } from 'vitest';
import picomatch from 'picomatch';

/**
 * O picomatch 4.0.7 (última versão publicada no npm) tem um ReDoS
 * (CVE-2026-112366 / GHSA-fc5q-39xc-vjpf): extglobs repetidos que misturam
 * `?` e `*` geram backtracking exponencial.
 *
 * O projeto usa o **4.0.8 vendorizado** (`vendor/picomatch` — 4.0.7 + PR
 * micromatch/picomatch#194) via `overrides`. Estes casos travam a correção:
 * se alguém remover o override ou o vendor, o teste quebra.
 */
const isMatch = (input: string, pattern: string) => picomatch(pattern)(input);
const sourceOf = (pattern: string) => (picomatch.makeRe(pattern) as RegExp).source;

describe('picomatch vendorizado (CVE-2026-112366)', () => {
  it('literaliza extglobs repetidos que misturam ? e *', () => {
    expect(sourceOf('+(?*a)')).toBe('^(?:\\+\\(\\?\\*a\\))$');
    expect(sourceOf('*(?*a)')).toBe('^(?:\\*\\(\\?\\*a\\))$');
    expect(sourceOf('+(*?a)')).toBe('^(?:\\+\\(\\*\\?a\\))$');
    expect(sourceOf('+(?*[ab])')).toBe('^(?:\\+\\(\\?\\*\\[ab\\]\\))$');
    expect(sourceOf('+(?*a|b)')).toBe('^(?:\\+\\(\\?\\*a\\|b\\))$');
  });

  it('não explode ao casar os padrões do advisory', () => {
    const entrada = 'a'.repeat(42) + '!';

    for (const pattern of ['+(?*a)', '*(?*a)', '+(*?a)', '+(?*a|b)']) {
      const inicio = performance.now();
      expect(isMatch(entrada, pattern)).toBe(false);
      expect(performance.now() - inicio).toBeLessThan(1000);
    }
  });

  it('trata o ? que abre o corpo do extglob como curinga (bash)', () => {
    expect(isMatch('a', '@(?)')).toBe(true);
    expect(isMatch('ab', '@(?)')).toBe(false);
    expect(isMatch('ab', '@(??)')).toBe(true);
    expect(isMatch('abc', '+(?)')).toBe(true);
    expect(isMatch('bb', '*(?)')).toBe(true);
    expect(isMatch('a', '!(?)')).toBe(false);
    expect(isMatch('ab', '!(?)')).toBe(true);
    expect(isMatch('cbz', 'c!(?)z')).toBe(false);
    expect(isMatch('cbz', 'c!(+)z')).toBe(true);
    expect(isMatch('ba', '@(?a|b)')).toBe(true);
    expect(isMatch('b', '@(?a|b)')).toBe(true);
    expect(isMatch('bb', '@(?a|b)')).toBe(false);
  });

  it('continua aceitando grupos de regex', () => {
    expect(sourceOf('@(?:a|b)')).toBe('^(?:@(?:a|b))$');
    expect(isMatch('@a', '@(?:a|b)')).toBe(true);
    expect(isMatch('a', '@(?:a|b)')).toBe(false);
    expect(isMatch('foo/cbaz', 'foo/*(?<!d)baz')).toBe(true);
    expect(isMatch('foo/cbaz', 'foo/*(?<!c)baz')).toBe(false);
  });
});
