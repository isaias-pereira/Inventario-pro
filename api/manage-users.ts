/**
 * Usuários do sistema (multi-loja).
 *
 * Cada usuário pertence a uma loja (`app_users.loja`). O admin pode trocar
 * de loja em tempo de execução pela ação `switch_loja`: o servidor valida se a
 * loja existe e está ativa e re-assina o token com a nova loja — o navegador
 * nunca escolhe o escopo por conta própria.
 *
 * Ações (POST):
 * - `list`: lista os usuários (admin);
 * - `add`: cadastra um usuário numa loja (admin);
 * - `update`: altera perfil, senha e loja de um usuário (admin);
 * - `delete`: remove um usuário (admin);
 * - `list_lojas`: lista as lojas ativas (qualquer usuário logado);
 * - `switch_loja`: troca a loja do token do admin (admin).
 */

import bcrypt from 'bcryptjs';
import { createSql } from './_lib/db.js';
import { authenticate } from './_lib/auth.js';
import { jwtSecret } from './_lib/auth.js';
import { signJwt } from './_lib/jwt.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { DEFAULT_LOJA, ensureLojaSchema, listarLojas, lojaAtiva } from './_lib/loja.js';

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
      const users = await sql`
        SELECT id, username, role, loja, created_at
          FROM app_users
         ORDER BY created_at ASC`;
      sendJson(res, { users });
      return;
    }

    if (action === 'add') {
      if (!newUser?.username || !newUser?.password) {
        sendJson(res, { error: 'Usuário e senha são obrigatórios' }, 400);
        return;
      }

      const loja = await lojaDoCadastro(sql, newUser.loja);
      if (loja === null) {
        sendJson(res, { error: 'Loja inválida ou inativa' }, 400);
        return;
      }

      const hashedPw = await bcrypt.hash(newUser.password, 10);

      try {
        await sql`
          INSERT INTO app_users (username, password, role, loja)
          VALUES (${newUser.username}, ${hashedPw}, ${newUser.role || 'user'}, ${loja})`;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('duplicate') || message.includes('unique')) {
          sendJson(res, { error: 'Este usuário já existe' }, 400);
          return;
        }
        throw error;
      }

      sendJson(res, { success: true });
      return;
    }

    if (action === 'update') {
      if (!newUser?.username || !newUser?.role) {
        sendJson(res, { error: 'Usuário e perfil são obrigatórios' }, 400);
        return;
      }

      const loja = await lojaDoCadastro(sql, newUser.loja);
      if (loja === null) {
        sendJson(res, { error: 'Loja inválida ou inativa' }, 400);
        return;
      }

      if (newUser.password) {
        const hashedPw = await bcrypt.hash(newUser.password, 10);
        await sql`
          UPDATE app_users
             SET role = ${newUser.role}, loja = ${loja}, password = ${hashedPw}
           WHERE username = ${newUser.username}`;
      } else {
        await sql`
          UPDATE app_users
             SET role = ${newUser.role}, loja = ${loja}
           WHERE username = ${newUser.username}`;
      }

      sendJson(res, { success: true });
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

      await sql`DELETE FROM app_users WHERE username = ${newUser.username}`;
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
 * Sem valor, assume a loja padrão (103) — é o caso dos cadastros feitos
 * antes do multi-loja. Com valor, precisa existir e estar ativa.
 */
async function lojaDoCadastro(sql: ReturnType<typeof createSql>, valor: unknown): Promise<number | null> {
  if (valor === undefined || valor === null || valor === '') return DEFAULT_LOJA;
  const loja = Number(valor);
  if (!Number.isInteger(loja) || loja <= 0) return null;
  return (await lojaAtiva(sql, loja)) ? loja : null;
}

export default handler;
