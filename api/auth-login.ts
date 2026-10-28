import bcrypt from 'bcryptjs';
import { createSql } from './_lib/db';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http';
import { jwtSecret } from './_lib/auth';
import { signJwt } from './_lib/jwt';

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const { username, password } = await readJsonBody<{ username?: string; password?: string }>(req);
    if (!username || !password) {
      sendJson(res, { error: 'Usuário e senha são obrigatórios' }, 400);
      return;
    }

    const sql = createSql();
    const rows = await sql`SELECT username, password, role FROM app_users WHERE username = ${username} LIMIT 1`;
    if (rows.length === 0) {
      sendJson(res, { success: false, error: 'Usuário ou senha inválidos' });
      return;
    }

    const user = rows[0] as { username: string; password: string; role: string };
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      sendJson(res, { success: false, error: 'Usuário ou senha inválidos' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(
      { sub: user.username, role: user.role, iat: now, exp: now + 6 * 3600 },
      jwtSecret(),
    );

    sendJson(res, { success: true, user: { username: user.username, role: user.role }, token });
  } catch (error) {
    console.error('Login error:', error);
    sendJson(res, { error: 'Erro interno do servidor' }, 500);
  }
};

export default handler;
