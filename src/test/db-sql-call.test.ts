import { describe, expect, it } from 'vitest';
import { resolveSqlCall } from '../../api/_lib/db';

/**
 * Regressão: `sql\`...\`` chega como array de strings (com `.raw`) e o lote como
 * array de objetos `{ query, params }`. Sem distinguir os dois, o template caía
 * no ramo de transação e o banco rejeitava o corpo da requisição.
 */
describe('resolveSqlCall', () => {
  it('interprets a tagged template as a single query', () => {
    const strings = Object.assign(['SELECT * FROM t WHERE a = ', ''], {
      raw: ['SELECT * FROM t WHERE a = ', ''],
    });
    const call = resolveSqlCall([strings, 'valor']);

    expect(call.kind).toBe('template');
    if (call.kind !== 'template') throw new Error('expected template');
    expect(call.statement.query).toBe('SELECT * FROM t WHERE a = $1');
    expect(call.statement.params).toEqual(['valor']);
  });

  it('interprets a string query as the raw form with its params', () => {
    const call = resolveSqlCall(['SELECT * FROM t WHERE a = $1', ['valor']]);

    expect(call.kind).toBe('raw');
    if (call.kind !== 'raw') throw new Error('expected raw');
    expect(call.statement.query).toBe('SELECT * FROM t WHERE a = $1');
    expect(call.statement.params).toEqual(['valor']);
  });

  it('defaults raw params to an empty array', () => {
    const call = resolveSqlCall(['SELECT 1']);

    expect(call.kind).toBe('raw');
    if (call.kind !== 'raw') throw new Error('expected raw');
    expect(call.statement.params).toEqual([]);
  });

  it('interprets an array of statements as a transactional batch', () => {
    const queries = [{ query: 'SELECT 1' }, { query: 'INSERT INTO t (a) VALUES ($1)', params: ['x'] }];
    const call = resolveSqlCall([queries, [], true]);

    expect(call.kind).toBe('batch');
    if (call.kind !== 'batch') throw new Error('expected batch');
    expect(call.queries).toHaveLength(2);
    expect(call.write).toBe(true);
  });

  it('keeps every interpolated value as its own positional parameter', () => {
    const strings = Object.assign(['SELECT * FROM t WHERE a = ', ' AND b = ', ' AND c = ', ''], {
      raw: ['SELECT * FROM t WHERE a = ', ' AND b = ', ' AND c = ', ''],
    });
    const call = resolveSqlCall([strings, 1, 'dois', true]);

    expect(call.kind).toBe('template');
    if (call.kind !== 'template') throw new Error('expected template');
    expect(call.statement.query).toBe('SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3');
    expect(call.statement.params).toEqual([1, 'dois', true]);
  });

  it('leaves a template without values as a plain query', () => {
    const strings = Object.assign(['SELECT 1'], { raw: ['SELECT 1'] });
    const call = resolveSqlCall([strings]);

    expect(call.kind).toBe('template');
    if (call.kind !== 'template') throw new Error('expected template');
    expect(call.statement.query).toBe('SELECT 1');
    expect(call.statement.params).toEqual([]);
  });
});
