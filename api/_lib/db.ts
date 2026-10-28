import { neon } from '@neondatabase/serverless';

/**
 * Acesso ao banco Neon.
 *
 * Duas opções, ambas server-side (as credenciais nunca chegam ao navegador):
 *  1. Connector gateway do Lovable (LOVABLE_API_KEY + NEON_API_KEY) — suporta
 *     lote de comandos em uma única transação (usado no cadastro de produtos).
 *  2. Driver serverless do Neon (NEON_DATABASE_URL) — fallback quando só a
 *     URL do banco está disponível.
 */

export type Param = unknown;

export interface Statement {
  query: string;
  params?: Param[];
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

export interface BatchResult {
  results: QueryResult[];
}

export interface Sql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
  (queries: Statement[], params?: unknown[], write?: boolean): Promise<BatchResult>;
  (query: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/neon';

export function sanitizeUrl(raw: string): string {
  let url = raw.replace(/^psql\s+/, '').replace(/^["']|["']$/g, '').trim();
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('channel_binding');
    url = parsed.toString();
  } catch {
    /* mantém a URL como está */
  }
  return url;
}

/** Como a chamada de `sql` deve ser interpretada. */
export type SqlCall =
  | { kind: 'template'; statement: Statement }
  | { kind: 'raw'; statement: Statement }
  | { kind: 'batch'; queries: Statement[]; write: boolean };

/**
 * Um tagged template (`sql\`...\``) chega como array de strings marcado por
 * `.raw`; o lote chega como array de objetos `{ query, params }`. Sem essa
 * distinção a forma de template caía no ramo de transação e o banco recebia
 * um corpo inválido.
 */
function isTaggedTemplate(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && 'raw' in value;
}

/** Classifica os argumentos de `sql` em template, consulta crua ou lote. */
export function resolveSqlCall(args: unknown[]): SqlCall {
  if (typeof args[0] === 'string') {
    return { kind: 'raw', statement: { query: args[0], params: (args[1] as Param[]) ?? [] } };
  }
  if (Array.isArray(args[0]) && !isTaggedTemplate(args[0])) {
    return { kind: 'batch', queries: args[0] as Statement[], write: Boolean(args[2]) };
  }
  return {
    kind: 'template',
    statement: buildStatement(args[0] as TemplateStringsArray, args.slice(1)),
  };
}

function buildStatement(strings: TemplateStringsArray, values: unknown[]): Statement {
  let query = '';
  const params: unknown[] = [];
  strings.forEach((part, index) => {
    query += part;
    if (index < values.length) {
      params.push(values[index]);
      query += `$${params.length}`;
    }
  });
  return { query, params };
}

function gatewayHeaders(): Record<string, string> {
  const key = process.env.LOVABLE_API_KEY;
  const connection = process.env.NEON_API_KEY;
  if (!key || !connection) {
    throw new Error('Credenciais do banco ausentes (LOVABLE_API_KEY/NEON_API_KEY)');
  }
  return {
    Authorization: `Bearer ${key}`,
    'X-Connection-Api-Key': connection,
    'Content-Type': 'application/json',
  };
}

function gatewayError(status: number, code: string | undefined, message: string | undefined): Error {
  let text = 'Não foi possível consultar o banco de dados.';
  let httpStatus = 503;
  if (code === '22012') {
    text = 'O produto foi alterado ou um código/EAN já pertence a outro produto. Consulte novamente.';
    httpStatus = 409;
  } else if (String(code ?? '').startsWith('23') || code === '40001') {
    text = 'Código ou EAN em conflito. Consulte o produto novamente.';
    httpStatus = 409;
  } else if (String(code ?? '').startsWith('22')) {
    text = 'Valores inválidos para o cadastro.';
    httpStatus = 400;
  } else if (code === '28P01' || code === '28000' || /password authentication failed|endpoint cannot be found/i.test(message ?? '')) {
    text = 'A conexão do banco precisa ser atualizada pelo responsável pelo aplicativo.';
  } else if (/endpoint has been disabled|endpoint is/i.test(message ?? '')) {
    text = 'O banco está indisponível. Verifique o serviço Neon.';
  } else if (status === 429) {
    text = 'Banco ocupado. Tente novamente em instantes.';
    httpStatus = 429;
  }
  return Object.assign(new Error(text), { status: httpStatus });
}

async function gatewayQuery(statements: Statement[], write: boolean): Promise<BatchResult> {
  const single = statements.length === 1 && !write;
  const body = single ? statements[0] : { queries: statements };

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}/sql`, {
      method: 'POST',
      headers: gatewayHeaders(),
      body: JSON.stringify(body),
      ...(write ? {} : { signal: AbortSignal.timeout(30000) }),
    });
  } catch {
    throw Object.assign(new Error('O banco está temporariamente indisponível.'), { status: 503 });
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Resposta inválida do banco de dados.'), { status: 503 });
  }

  if (!response.ok) {
    const known = data as { code?: string; message?: string };
    console.error('Neon request failed', response.status, known.code);
    throw gatewayError(response.status, known.code, known.message);
  }

  if (single) {
    const result = data as QueryResult;
    return { results: [{ rows: result.rows ?? [], rowCount: result.rowCount ?? null }] };
  }
  return data as BatchResult;
}

function createDriver() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) return null;
  try {
    return neon(sanitizeUrl(url));
  } catch {
    return null;
  }
}

export function createSql(): Sql {
  const driver = createDriver();

  // O driver Neon devolve as linhas diretamente (QueryRows) quando fullResults
  // está desligado; o gateway devolve { rows, rowCount }.
  const driverRows = (result: unknown): Record<string, unknown>[] =>
    (Array.isArray(result) ? result : []) as Record<string, unknown>[];

  const run = async (...args: unknown[]): Promise<unknown> => {
    const call = resolveSqlCall(args);

    if (call.kind === 'raw') {
      if (driver) {
        return driverRows(await driver.query(call.statement.query, call.statement.params ?? []));
      }
      const batch = await gatewayQuery([call.statement], false);
      return batch.results[0]?.rows ?? [];
    }

    if (call.kind === 'batch') {
      if (driver) {
        // Uma transação: se qualquer comando falhar, tudo é revertido.
        const results = await driver.transaction((txn) =>
          call.queries.map((statement) => txn.query(statement.query, statement.params ?? [])),
        );
        return {
          results: results.map((result) => ({
            rows: driverRows(result),
            rowCount: null,
          })),
        };
      }
      return gatewayQuery(call.queries, call.write);
    }

    if (driver) {
      return driverRows(await driver.query(call.statement.query, call.statement.params ?? []));
    }
    const batch = await gatewayQuery([call.statement], false);
    return batch.results[0]?.rows ?? [];
  };

  return run as unknown as Sql;
}
