import bcrypt from 'bcryptjs';
import { createSql } from './_lib/db.js';
import { requirePost, readJsonBody, sendJson, type ApiHandler } from './_lib/http.js';
import { jwtSecret } from './_lib/auth.js';
import { signJwt } from './_lib/jwt.js';
import { dbTimeoutMs, TimeoutError, withTimeout } from './_lib/timeout.js';
import { DEFAULT_LOJA, ensureLojaSchema } from './_lib/loja.js';

/** Duração padrão da sessão (6 h) e da sessão com "Lembrar-me" (7 dias). */
export const SESSION_TTL_SECONDS = 6 * 3600;
export const REMEMBER_TTL_SECONDS = 7 * 24 * 3600;

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  try {
    const { username, password, remember } = await readJsonBody<{
      username?: string;
      password?: string;
      remember?: boolean;
    }>(req);
    if (!username || !password) {
      sendJson(res, { error: 'Usuário e senha são obrigatórios' }, 400);
      return;
    }

    const sql = createSql();
    // A tabela de lojas e a coluna `app_users.loja` precisam existir para o
    // token sair com o escopo da loja. A criação é idempotente e tolerante a
    // falha: se o banco não responder, o login segue com a loja padrão.
    try {
      await withTimeout(ensureLojaSchema(sql), dbTimeoutMs());
    } catch {
      /* a coluna `loja` pode faltar: o token usa a loja padrão */
    }
    // Sem limite de tempo, uma consulta travada segura o navegador em
    // "carregando" até a Vercel derrubar a Function.
    let rows: Record<string, unknown>[];
    try {
      rows = await withTimeout(
        sql`SELECT username, password, role, loja FROM app_users WHERE username = ${username} LIMIT 1`,
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

    const user = rows[0] as { username: string; password: string; role: string; loja?: number };
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      sendJson(res, { success: false, error: 'Usuário ou senha inválidos' });
      return;
    }

    // Loja do usuário: vem do cadastro e vai assinado no token — é o escopo
    // que o servidor aplica em todos os dados operacionais.
    const loja = Number.isInteger(Number(user.loja)) && Number(user.loja) > 0
      ? Number(user.loja)
      : DEFAULT_LOJA;

    const now = Math.floor(Date.now() / 1000);
    // Com "Lembrar-me" a sessão dura 7 dias: assim o app abre direto no
    // computador da empresa sem passar pelo login (o caminho frágil quando a
    // rede corporativa bloqueia o domínio).
    const ttl = remember === true ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS;
    const expiresAt = now + ttl;
    const token = signJwt(
      { sub: user.username, role: user.role, loja, iat: now, exp: expiresAt },
      jwtSecret(),
    );

    sendJson(res, {
      success: true,
      user: { username: user.username, role: user.role, loja },
      token,
      expiresAt,
    });
  } catch (error) {
    console.error('Login error:', error);
    // Falha de conexão com o banco (Neon): responde 503 para que o app
    // diferencie "banco fora do ar" de "senha errada".
    sendJson(res, { error: 'Não foi possível falar com o banco de dados. Tente novamente em instantes.' }, 503);
  }
};

export default handler;
