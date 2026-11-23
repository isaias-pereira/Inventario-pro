/**
 * Vínculo usuário operacional → encarregado(s).
 *
 * Cada `user`, `promotor` ou `col_validade` pode estar ligado a um ou mais
 * encarregados. O encarregado vê as validades dele e as da sua equipe; o admin
 * continua root (vê tudo da loja atual).
 *
 * O vínculo fica em `public.usuario_encarregados` (N:N). A tabela é criada de
 * forma idempotente aqui — a migration
 * `db/migrations/20261113090000_encarregados_e_remove_enc_flv.sql` é a fonte
 * oficial do schema. O seed dos usuários existentes para o admin roda uma
 * única vez (marcador em `app_schema_flags`).
 */

import type { Sql } from './db.js';

/** Perfis que podem ser vinculados a encarregados. */
export const SUBORDINATE_ROLES = ['user', 'promotor', 'col_validade'] as const;

/** Perfis que podem ser responsáveis por uma equipe. */
export const SUPERVISOR_ROLES = ['encarregado', 'admin'] as const;

export function isSubordinateRole(role: unknown): boolean {
  return typeof role === 'string' && (SUBORDINATE_ROLES as readonly string[]).includes(role);
}

export function isSupervisorRole(role: unknown): boolean {
  return typeof role === 'string' && (SUPERVISOR_ROLES as readonly string[]).includes(role);
}

let schemaPronta = false;

/**
 * Garante a tabela de vínculos, os índices e o seed inicial.
 *
 * O seed liga os usuários existentes (`user`, `promotor`, `col_validade`) ao(s)
 * admin(s). Ele é controlado por um marcador para não voltar a criar vínculos
 * que o admin removeu de propósito.
 */
export async function ensureEncarregadosSchema(sql: Sql): Promise<void> {
  if (schemaPronta) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS public.app_schema_flags (
        flag TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS public.usuario_encarregados (
        id BIGSERIAL PRIMARY KEY,
        usuario TEXT NOT NULL
          REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE,
        encarregado TEXT NOT NULL
          REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE,
        loja INTEGER NOT NULL
          REFERENCES public.lojas(codigo) ON UPDATE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT usuario_encarregados_nao_self CHECK (usuario <> encarregado)
      )`;

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_encarregados_unique
        ON public.usuario_encarregados (usuario, encarregado)`;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_usuario_encarregados_encarregado
        ON public.usuario_encarregados (loja, encarregado)`;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_usuario_encarregados_usuario
        ON public.usuario_encarregados (loja, usuario)`;

    // O perfil enc_flv deixou de existir: quem tinha vira encarregado.
    await sql`UPDATE public.app_users SET role = 'encarregado' WHERE role = 'enc_flv'`;

    // Seed único: usuários existentes passam a ter o(s) admin(s) como
    // encarregado(s). O admin é root e continua vendo tudo.
    await sql`
      WITH flag AS (
        INSERT INTO public.app_schema_flags (flag)
        VALUES ('encarregados_admin_seed')
        ON CONFLICT (flag) DO NOTHING
        RETURNING flag
      )
      INSERT INTO public.usuario_encarregados (usuario, encarregado, loja)
      SELECT u.username, a.username, u.loja
        FROM public.app_users u
        JOIN public.app_users a ON a.role = 'admin'
       WHERE u.role IN ('user', 'promotor', 'col_validade')
         AND EXISTS (SELECT 1 FROM flag)
      ON CONFLICT (usuario, encarregado) DO NOTHING`;

    schemaPronta = true;
  } catch (error) {
    console.error('Encarregados schema:', error);
  }
}

/** Encarregados vinculados a um usuário, na loja informada. */
export async function encarregadosDoUsuario(
  sql: Sql,
  usuario: string,
  loja: number,
): Promise<string[]> {
  const rows = await sql`
    SELECT encarregado
      FROM public.usuario_encarregados
     WHERE usuario = ${usuario} AND loja = ${loja}
     ORDER BY encarregado`;
  return rows.map((row) => String(row.encarregado));
}

/** Usuários da equipe de um encarregado, na loja informada. */
export async function usuariosDaEquipe(
  sql: Sql,
  encarregado: string,
  loja: number,
): Promise<string[]> {
  const rows = await sql`
    SELECT usuario
      FROM public.usuario_encarregados
     WHERE encarregado = ${encarregado} AND loja = ${loja}
     ORDER BY usuario`;
  return rows.map((row) => String(row.usuario));
}

/** Ordena nomes de usuário, mantendo o dono do escopo em primeiro lugar. */
function ordenarUsuarios(nomes: Iterable<string>, primeiro?: string): string[] {
  const unicos = [...new Set(nomes)].filter((nome) => nome !== primeiro);
  unicos.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return primeiro ? [primeiro, ...unicos] : unicos;
}

/**
 * Escopo de **leitura** da Validade.
 *
 * - `admin` → `null` (root: vê a loja inteira);
 * - `col_validade` → só as próprias coletas (perfil restrito);
 * - demais perfis → ele mesmo + vínculos diretos (supervisores e
 *   subordinados) + colegas da mesma equipe + encarregados que compartilham
 *   pelo menos um subordinado.
 *
 * A regra é derivada **somente** de `usuario_encarregados`, nunca do perfil.
 * Se a consulta falhar, o erro sobe: o endpoint falha fechado em vez de
 * liberar a loja inteira.
 */
export async function escopoDeValidade(
  sql: Sql,
  usuario: string,
  role: unknown,
  loja: number,
): Promise<string[] | null> {
  if (role === 'admin') return null;
  if (role === 'col_validade') return [usuario];

  await ensureEncarregadosSchema(sql);

  const rows = await sql`
    WITH meus_supervisores AS (
      SELECT encarregado AS nome
        FROM public.usuario_encarregados
       WHERE usuario = ${usuario} AND loja = ${loja}
    ),
    meus_subordinados AS (
      SELECT usuario AS nome
        FROM public.usuario_encarregados
       WHERE encarregado = ${usuario} AND loja = ${loja}
    ),
    colegas AS (
      SELECT DISTINCT ue2.usuario AS nome
        FROM public.usuario_encarregados ue1
        JOIN public.usuario_encarregados ue2
          ON ue2.encarregado = ue1.encarregado
         AND ue2.loja = ue1.loja
       WHERE ue1.usuario = ${usuario} AND ue1.loja = ${loja}
    ),
    co_supervisores AS (
      SELECT DISTINCT ue2.encarregado AS nome
        FROM public.usuario_encarregados ue1
        JOIN public.usuario_encarregados ue2
          ON ue2.usuario = ue1.usuario
         AND ue2.loja = ue1.loja
       WHERE ue1.encarregado = ${usuario} AND ue1.loja = ${loja}
    )
    SELECT ${usuario}::text AS nome
    UNION
    SELECT nome FROM meus_supervisores
    UNION
    SELECT nome FROM meus_subordinados
    UNION
    SELECT nome FROM colegas
    UNION
    SELECT nome FROM co_supervisores
  `;

  return ordenarUsuarios([usuario, ...rows.map((row) => String(row.nome))], usuario);
}

/**
 * Escopo de **escrita** da Validade.
 *
 * Mantém a regra histórica: admin escreve em tudo da loja; encarregado
 * escreve apenas nos itens dele e da equipe **direta**. A visão entre
 * co-supervisores é só de leitura.
 */
export async function escopoDeEscrita(
  sql: Sql,
  usuario: string,
  role: unknown,
  loja: number,
): Promise<string[] | null> {
  if (role === 'admin') return null;
  await ensureEncarregadosSchema(sql);
  return ordenarUsuarios([usuario, ...(await usuariosDaEquipe(sql, usuario, loja))], usuario);
}

/**
 * Substitui os vínculos de um usuário operacional.
 *
 * A lista enviada é a fonte da verdade: o que não estiver nela é removido.
 * O username é único no mundo, então a limpeza não precisa de loja.
 */
export async function substituirEncarregados(
  sql: Sql,
  usuario: string,
  encarregados: string[],
  loja: number,
): Promise<void> {
  await sql`DELETE FROM public.usuario_encarregados WHERE usuario = ${usuario}`;
  for (const encarregado of [...new Set(encarregados)]) {
    if (!encarregado || encarregado === usuario) continue;
    await sql`
      INSERT INTO public.usuario_encarregados (usuario, encarregado, loja)
      VALUES (${usuario}, ${encarregado}, ${loja})
      ON CONFLICT (usuario, encarregado) DO NOTHING`;
  }
}

export interface ResolverEncarregadosResult {
  ok: boolean;
  /** Encarregados validados (vazio quando `ok` é falso). */
  value: string[];
  /** Mensagem pronta para a tela (quando `ok` é falso). */
  error?: string;
}

/**
 * Normaliza e valida a lista de encarregados de um usuário operacional.
 *
 * - Perfis que não são `user`/`promotor`/`col_validade` não têm vínculo.
 * - Lista vazia usa o `padrao` (o admin que está cadastrando/editando).
 * - Admin pode ser responsável por qualquer loja (é root); encarregado precisa
 *   ser da mesma loja do usuário.
 */
export async function resolverEncarregados(
  sql: Sql,
  role: unknown,
  raw: unknown,
  loja: number,
  padrao: string,
): Promise<ResolverEncarregadosResult> {
  if (!isSubordinateRole(role)) return { ok: true, value: [] };

  const lista = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const nomes = [...new Set(
    lista
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  )];

  if (nomes.length === 0 && padrao) nomes.push(padrao);
  if (nomes.length === 0) {
    return { ok: false, value: [], error: 'Selecione ao menos um encarregado para o usuário.' };
  }

  const rows = await sql`
    SELECT username, role, loja
      FROM public.app_users
     WHERE username = ANY(${nomes}::text[])`;

  const encontrados = new Map(
    rows.map((row) => [String(row.username), row]),
  );

  for (const nome of nomes) {
    const row = encontrados.get(nome);
    if (!row) {
      return { ok: false, value: [], error: `Encarregado não encontrado: ${nome}` };
    }
    const roleDoResponsavel = String(row.role ?? '');
    if (!isSupervisorRole(roleDoResponsavel)) {
      return { ok: false, value: [], error: `${nome} não é encarregado nem admin.` };
    }
    // O admin é root e pode ser responsável por qualquer loja.
    if (roleDoResponsavel !== 'admin' && Number(row.loja) !== loja) {
      return { ok: false, value: [], error: `O encarregado ${nome} não pertence à loja atual.` };
    }
  }

  return { ok: true, value: nomes };
}
