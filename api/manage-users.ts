/**
 * Usuários do sistema (multi-loja).
 *
 * Cada usuário pertence a uma loja (`app_users.loja`). O admin pode trocar
 * de loja em tempo de execução pela ação `switch_loja`: o servidor valida se a
 * loja existe e está ativa e re-assina o token com a nova loja — o navegador
 * nunca escolhe o escopo por conta própria.
 *
 * Ações (POST):
 * - `list`: lista os usuários da loja atual, com os encarregados vinculados (admin);
 * - `list_encarregados`: encarregados/admin da loja atual para o seletor (admin);
 * - `add`: cadastra um usuário numa loja (admin);
 * - `update`: altera perfil, senha, loja e encarregados de um usuário (admin);
 * - `delete`: remove um usuário (admin);
 * - `list_lojas`: lista as lojas ativas (qualquer usuário logado);
 * - `switch_loja`: troca a loja do token do admin (admin).
 *
 * O perfil `enc_flv` deixou de existir: quem tinha foi convertido em
 * `encarregado` pela migration. Cadastro/edição com esse perfil é recusado.
 */

import bcrypt from 'bcryptjs';
import { createSql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { jwtSecret } from './_lib/auth.js';
import { signJwt } from './_lib/jwt.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { DEFAULT_LOJA, ensureLojaSchema, listarLojas, lojaAtiva, resolveLoja } from './_lib/loja.js';
import {
  ensureEncarregadosSchema,
  isSubordinateRole,
  resolverEncarregados,
  substituirEncarregados,
} from './_lib/encarregados.js';

/** Perfis aceitos no cadastro/edição (o `enc_flv` não existe mais). */
export const USER_ROLES = ['admin', 'user', 'promotor', 'encarregado', 'col_validade'] as const;

/** Normaliza o perfil; devolve `null` quando não é um perfil válido. */
export function normalizeRole(value: unknown): string | null {
  const role = String(value ?? '').trim();
  return (USER_ROLES as readonly string[]).includes(role) ? role : null;
}

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload) return;

    const { action, newUser } = await readJsonBody<{ action?: string; newUser?: any }>(req);
    const sql = createSql();
    await ensureLojaSchema(sql);

    // Lista de lojas: qualquer usuário logado pode consultar (o header usa
    // para mostrar o nome da loja e o admin para o seletor).
    if (action === 'list_lojas') {
      const lojas = await listarLojas(sql);
      sendJson(res, { lojas });
      return;
    }

    if (!payload.role || payload.role !== 'admin') {
      sendJson(res, { error: 'Acesso negado. Somente administradores.' }, 403);
      return;
    }
    const adminUsername = payload.sub;

    // Tabela de vínculos e seed inicial (uma vez por instância).
    await ensureEncarregadosSchema(sql);

    // Troca de loja: re-assina o token com a loja escolhida.
    if (action === 'switch_loja') {
      const loja = Number((newUser as any)?.loja);
      if (!Number.isInteger(loja) || loja <= 0) {
        sendJson(res, { error: 'Loja inválida' }, 400);
        return;
      }
      if (!(await lojaAtiva(sql, loja))) {
        sendJson(res, { error: 'Loja não encontrada ou inativa' }, 400);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      // Mantém o prazo de validade que ainda resta no token atual; se ele
      // estiver prestes a vencer, abre uma sessão nova.
      const restante = payload.exp - now;
      const exp = restante > 60 ? payload.exp : now + 6 * 3600;
      const token = signJwt(
        { sub: payload.sub, role: payload.role, loja, iat: now, exp },
        jwtSecret(),
      );
      sendJson(res, {
        success: true,
        token,
        expiresAt: exp,
        user: { username: payload.sub, role: payload.role, loja },
      });
      return;
    }

    if (action === 'list') {
      // Cada loja vê apenas os acessos dela: a lista sai da loja do token
      // (a loja que o admin está usando agora), nunca de todas as lojas.
      const loja = await resolveLoja(sql, payload);
      const users = await sql`
        SELECT id, username, role, loja, created_at
          FROM app_users
         WHERE loja = ${loja}
         ORDER BY created_at ASC`;
      // Vínculos usuário → encarregado(s) da loja atual, agrupados por usuário.
      const vinculos = await sql`
        SELECT usuario, encarregado
          FROM public.usuario_encarregados
         WHERE loja = ${loja}
         ORDER BY usuario, encarregado`;
      const porUsuario = new Map<string, string[]>();
      for (const row of vinculos) {
        const usuario = String(row.usuario);
        const lista = porUsuario.get(usuario) ?? [];
        lista.push(String(row.encarregado));
        porUsuario.set(usuario, lista);
      }
      sendJson(res, {
        users: users.map((user) => ({
          ...user,
          encarregados: porUsuario.get(String(user.username)) ?? [],
        })),
      });
      return;
    }

    // Encarregados (e admins, que são root) da loja atual para o seletor de
    // vínculo da tela de Usuários.
    if (action === 'list_encarregados') {
      const loja = await resolveLoja(sql, payload);
      const encarregados = await sql`
        SELECT username, role, loja
          FROM app_users
         WHERE loja = ${loja} AND role IN ('encarregado', 'admin')
         ORDER BY role DESC, username ASC`;
      sendJson(res, { encarregados });
      return;
    }

    if (action === 'add') {
      if (!newUser?.username || !newUser?.password) {
        sendJson(res, { error: 'Usuário e senha são obrigatórios' }, 400);
        return;
      }

      const role = normalizeRole(newUser.role || 'user');
      if (!role) {
        sendJson(res, { error: 'Perfil inválido' }, 400);
        return;
      }

      // Sem loja informada, o acesso nasce na loja do token (a loja atual do
      // admin) — nunca na loja padrão global.
      const loja = await lojaDoCadastro(sql, newUser.loja, await resolveLoja(sql, payload));
      if (loja === null) {
        sendJson(res, { error: 'Loja inválida ou inativa' }, 400);
        return;
      }

      // user/promotor/col_validade precisam de ao menos um encarregado; sem
      // escolha explícita, o admin que cadastra vira o responsável.
      const vinculo = await resolverEncarregados(sql, role, newUser.encarregados, loja, adminUsername);
      if (!vinculo.ok) {
        sendJson(res, { error: vinculo.error }, 400);
        return;
      }

      const hashedPw = await bcrypt.hash(newUser.password, 10);

      try {
        await sql`
          INSERT INTO app_users (username, password, role, loja)
          VALUES (${newUser.username}, ${hashedPw}, ${role}, ${loja})`;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('duplicate') || message.includes('unique')) {
          sendJson(res, { error: 'Este usuário já existe' }, 400);
          return;
        }
        throw error;
      }

      await substituirEncarregados(sql, String(newUser.username), vinculo.value, loja);

      sendJson(res, { success: true, encarregados: vinculo.value });
      return;
    }

    if (action === 'update') {
      if (!newUser?.username || !newUser?.role) {
        sendJson(res, { error: 'Usuário e perfil são obrigatórios' }, 400);
        return;
      }

      const role = normalizeRole(newUser.role);
      if (!role) {
        sendJson(res, { error: 'Perfil inválido' }, 400);
        return;
      }

      // O admin só altera acessos da loja em que está: a lista da tela já é
      // filtrada e o servidor repete a checagem.
      const lojaAtual = await resolveLoja(sql, payload);
      const alvo = await sql`SELECT username, role, loja FROM app_users WHERE username = ${newUser.username} LIMIT 1`;
      if (alvo.length === 0) {
        sendJson(res, { error: 'Usuário não encontrado' }, 404);
        return;
      }
      if (Number(alvo[0].loja) !== lojaAtual) {
        sendJson(res, { error: 'Usuário pertence a outra loja' }, 403);
        return;
      }

      const loja = await lojaDoCadastro(sql, newUser.loja, lojaAtual);
      if (loja === null) {
        sendJson(res, { error: 'Loja inválida ou inativa' }, 400);
        return;
      }

      const vinculo = await resolverEncarregados(sql, role, newUser.encarregados, loja, adminUsername);
      if (!vinculo.ok) {
        sendJson(res, { error: vinculo.error }, 400);
        return;
      }

      if (newUser.password) {
        const hashedPw = await bcrypt.hash(newUser.password, 10);
        await sql`
          UPDATE app_users
             SET role = ${role}, loja = ${loja}, password = ${hashedPw}
           WHERE username = ${newUser.username}`;
      } else {
        await sql`
          UPDATE app_users
             SET role = ${role}, loja = ${loja}
           WHERE username = ${newUser.username}`;
      }

      // Perfil sem vínculo (admin/encarregado) não mantém vínculos antigos.
      await substituirEncarregados(
        sql,
        String(newUser.username),
        isSubordinateRole(role) ? vinculo.value : [],
        loja,
      );

      sendJson(res, { success: true, encarregados: isSubordinateRole(role) ? vinculo.value : [] });
      return;
    }

    if (action === 'delete') {
      if (!newUser?.username) {
        sendJson(res, { error: 'Usuário é obrigatório' }, 400);
        return;
      }
      if (newUser.username === adminUsername) {
        sendJson(res, { error: 'Não é possível remover seu próprio usuário' }, 400);
        return;
      }

      const loja = await resolveLoja(sql, payload);
      const removidos = await sql`DELETE FROM app_users WHERE username = ${newUser.username} AND loja = ${loja} RETURNING username`;
      if (removidos.length === 0) {
        sendJson(res, { error: 'Usuário não encontrado nesta loja' }, 404);
        return;
      }
      sendJson(res, { success: true });
      return;
    }

    sendJson(res, { error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('Manage users error:', error);
    sendJson(res, { error: 'Erro interno do servidor' }, 500);
  }
};

/**
 * Loja informada no cadastro de usuário.
 *
 * Sem valor, assume a loja do token (a loja atual do admin) — é o caso dos
 * cadastros feitos antes do multi-loja. Com valor, precisa existir e estar
 * ativa.
 */
async function lojaDoCadastro(
  sql: ReturnType<typeof createSql>,
  valor: unknown,
  padrao: number = DEFAULT_LOJA,
): Promise<number | null> {
  if (valor === undefined || valor === null || valor === '') return padrao;
  const loja = Number(valor);
  if (!Number.isInteger(loja) || loja <= 0) return null;
  return (await lojaAtiva(sql, loja)) ? loja : null;
}

export default handler;
