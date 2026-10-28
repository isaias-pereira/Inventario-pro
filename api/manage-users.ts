import bcrypt from 'bcryptjs';
import { createSql } from './_lib/db';
import { authenticate } from './_lib/auth';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http';

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const payload = authenticate(req, res);
    if (!payload || payload.role !== 'admin') {
      sendJson(res, { error: 'Acesso negado. Somente administradores.' }, 403);
      return;
    }
    const adminUsername = payload.sub;

    const { action, newUser } = await readJsonBody<{ action?: string; newUser?: any }>(req);
    const sql = createSql();

    if (action === 'list') {
      const users = await sql`SELECT id, username, role, created_at FROM app_users ORDER BY created_at ASC`;
      sendJson(res, { users });
      return;
    }

    if (action === 'add') {
      if (!newUser?.username || !newUser?.password) {
        sendJson(res, { error: 'Usuário e senha são obrigatórios' }, 400);
        return;
      }

      const hashedPw = await bcrypt.hash(newUser.password, 10);

      try {
        await sql`INSERT INTO app_users (username, password, role) VALUES (${newUser.username}, ${hashedPw}, ${newUser.role || 'user'})`;
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

      if (newUser.password) {
        const hashedPw = await bcrypt.hash(newUser.password, 10);
        await sql`UPDATE app_users SET role = ${newUser.role}, password = ${hashedPw} WHERE username = ${newUser.username}`;
      } else {
        await sql`UPDATE app_users SET role = ${newUser.role} WHERE username = ${newUser.username}`;
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

export default handler;
