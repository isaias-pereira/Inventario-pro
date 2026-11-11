/**
 * Escopo por loja (multi-loja).
 *
 * O SGS-PRO atende várias lojas: as regras de negócio e o catálogo de produtos
 * são os mesmos para todas, mas cada loja trata o **seu** dado operacional
 * (validade, inventário, metas, rebaixa, arrastão).
 *
 * Como o escopo é aplicado:
 *
 * - A loja vem do **JWT** (`payload.loja`), assinado no login a partir de
 *   `app_users.loja`. O navegador nunca escolhe a loja por conta própria.
 * - O admin pode trocar de loja em tempo de execução: a ação `switch_loja`
 *   (em `api/manage-users.ts`) re-assina o token com a loja escolhida, depois
 *   de validar que a loja existe e está ativa.
 * - Tokens emitidos antes do multi-loja não têm a claim `loja`; nesse caso a
 *   loja é buscada no banco (com cache em memória) e, em último caso, cai na
 *   loja padrão.
 *
 * O catálogo (`produto`, `categoria`, `produto_embalagens`...) permanece
 * compartilhado: ele não tem coluna de loja e é consultado por código/EAN.
 */

import type { Sql } from './db.js';
import type { JwtPayload } from './jwt.js';

/** Loja usada quando ainda não há escopo definido (dados herdados). */
export const DEFAULT_LOJA = 103;

/** Lojas da empresa (criadas pelas migrations). */
export const LOJAS_INICIAIS: Array<{ codigo: number; nome: string }> = [
  { codigo: 73, nome: 'Loja 73' },
  { codigo: 82, nome: 'Loja 82' },
  { codigo: 83, nome: 'Loja 83' },
  { codigo: 88, nome: 'Loja 88' },
  { codigo: 92, nome: 'Loja 92' },
  { codigo: 93, nome: 'Loja 93' },
  { codigo: 96, nome: 'Loja 96' },
  { codigo: 103, nome: 'Loja 103' },
  { codigo: 104, nome: 'Loja 104' },
  { codigo: 108, nome: 'Loja 108' },
  { codigo: 143, nome: 'Loja 143' },
  { codigo: 148, nome: 'Loja 148' },
  { codigo: 173, nome: 'Loja 173' },
];

export interface Loja {
  codigo: number;
  nome: string;
  ativo: boolean;
}

let schemaPronta = false;

/**
 * Tabela de lojas e a coluna `app_users.loja`, criadas de forma idempotente.
 *
 * A migration `db/migrations/20261111090000_add_loja.sql` é a fonte oficial do
 * schema; este passo garante que a Function continue funcionando mesmo se a
 * migration ainda não tiver sido aplicada no banco (mesmo padrão usado pelas
 * outras tabelas do projeto).
 */
export async function ensureLojaSchema(sql: Sql): Promise<void> {
  if (schemaPronta) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS public.lojas (
        codigo INTEGER PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )`;
    for (const loja of LOJAS_INICIAIS) {
      await sql`
        INSERT INTO public.lojas (codigo, nome)
        VALUES (${loja.codigo}, ${loja.nome})
        ON CONFLICT (codigo) DO NOTHING`;
    }
    await sql`ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT ${DEFAULT_LOJA}`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_loja ON public.app_users (loja)`;
    schemaPronta = true;
  } catch (error) {
    console.error('Loja schema:', error);
  }
}

/** Loja assinada no token; `null` em tokens antigos (pré multi-loja). */
export function lojaDoToken(payload: JwtPayload): number | null {
  const valor = Number(payload.loja);
  return Number.isInteger(valor) && valor > 0 ? valor : null;
}

/**
 * Loja efetiva da requisição.
 *
 * Ordem: claim do token → cadastro do usuário (tokens antigos) → loja padrão.
 */
export async function resolveLoja(sql: Sql, payload: JwtPayload): Promise<number> {
  const doToken = lojaDoToken(payload);
  if (doToken !== null) return doToken;

  const doUsuario = await lojaDoUsuario(sql, payload.sub);
  return doUsuario ?? DEFAULT_LOJA;
}

/** Cache curto para tokens antigos (evita uma consulta por requisição). */
const cacheLojaPorUsuario = new Map<string, number>();

/** Loja cadastrada do usuário (`app_users.loja`). */
export async function lojaDoUsuario(sql: Sql, username: string): Promise<number | null> {
  const emCache = cacheLojaPorUsuario.get(username);
  if (emCache !== undefined) return emCache;

  const rows = await sql`SELECT loja FROM app_users WHERE username = ${username} LIMIT 1`;
  const valor = Number(rows[0]?.loja);
  const loja = Number.isInteger(valor) && valor > 0 ? valor : null;
  cacheLojaPorUsuario.set(username, loja ?? DEFAULT_LOJA);
  return loja;
}

/** Lista as lojas cadastradas (para o seletor do admin). */
export async function listarLojas(sql: Sql): Promise<Loja[]> {
  const rows = await sql`
    SELECT codigo, nome, ativo
      FROM public.lojas
     ORDER BY codigo ASC`;
  return rows.map((row) => ({
    codigo: Number(row.codigo),
    nome: String(row.nome ?? `Loja ${row.codigo}`),
    ativo: row.ativo !== false,
  }));
}

/** A loja existe e está ativa? */
export async function lojaAtiva(sql: Sql, codigo: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1 AS ok FROM public.lojas WHERE codigo = ${codigo} AND ativo = TRUE LIMIT 1`;
  return rows.length > 0;
}

/**
 * Monta a condição de loja para as consultas com parâmetros posicionais.
 *
 * ```ts
 * const params: unknown[] = [];
 * const where = filtroLoja(params, loja, 'v');
 * // → "v.loja = $1"
 * ```
 */
export function filtroLoja(params: unknown[], loja: number, alias = ''): string {
  params.push(loja);
  const prefixo = alias ? `${alias}.` : '';
  return `${prefixo}loja = $${params.length}`;
}
