import bcrypt from 'bcryptjs';
import { createSql } from './_lib/db.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { jwtSecret } from './_lib/auth.js';
import { signJwt } from './_lib/jwt.js';
import { dbTimeoutMs, TimeoutError, withTimeout } from './_lib/timeout.js';

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const { username, password } = await readJsonBody<{ username?: string; password?: string }>(req);
    if (!username || !password) {
      sendJson(res, { error: 'Usuário e senha são obrigatórios' }, 400);
      return;
    }

    const sql = createSql();
    // Sem limite de tempo, uma consulta travada segura o navegador em
    // "carregando" até a Vercel derrubar a Function.
    let rows: Record<string, unknown>[];
    try {
      rows = await withTimeout(
        sql`SELECT username, password, role FROM app_users WHERE username = ${username} LIMIT 1`,
        dbTimeoutMs(),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        console.error('Login timeout:', error);
        sendJson(res, { error: 'Banco de dados indisponível no momento. Tente novamente em instantes.' }, 503);
        return;
      }
      throw error;
    }

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
    // Falha de conexão com o banco (Neon): responde 503 para que o app
    // diferencie "banco fora do ar" de "senha errada".
    sendJson(res, { error: 'Não foi possível falar com o banco de dados. Tente novamente em instantes.' }, 503);
  }
};

export default handler;
