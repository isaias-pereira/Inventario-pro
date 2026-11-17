/**
 * Autenticação consolidada (login, logout, me) em uma única Serverless
 * Function — o plano Hobby da Vercel limita o deploy a 12 funções.
 *
 * Actions (POST, campo `action`):
 * - `login`: autentica usuário/senha, define o cookie HttpOnly e devolve
 *   `{ success, user, expiresAt }` (o token nunca vai no corpo);
 * - `logout`: limpa o cookie de autenticação;
 * - `me`: devolve o usuário atual a partir do cookie HttpOnly.
 */

import bcrypt from 'bcryptjs';
import { createSql } from './_lib/db.js';
import {
  clearAuthCookie,
  parseCookies,
  readJsonBody,
  requirePost,
  sendJson,
  setAuthCookie,
  type ApiHandler,
} from './_lib/http.js';
import { authenticate, jwtSecret } from './_lib/auth.js';
import { signJwt } from './_lib/jwt.js';
import { dbTimeoutMs, TimeoutError, withTimeout } from './_lib/timeout.js';
import { DEFAULT_LOJA, ensureLojaSchema } from './_lib/loja.js';
import { checkRateLimit, resetRateLimit } from './_lib/rate-limit.js';
import { logError } from './_lib/logger.js';
import { loginSchema, validateBody } from './_lib/validation.js';

/** Duração da sessão: 6 h. */
export const SESSION_TTL_SECONDS = 6 * 3600;

/** Verifica o token do Turnstile (se configurado). */
async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // CAPTCHA opcional: sem chave, não bloqueia
  if (!token) return false;
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const result = await resp.json() as { success: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

/** Login: valida corpo, rate limit, Turnstile, bcrypt e emite o cookie. */
async function handleLogin(body: Record<string, unknown>, req: Parameters<ApiHandler>[0], res: Parameters<ApiHandler>[1]): Promise<void> {
  let usernameForLog = 'unknown';
  try {
    const validation = validateBody(loginSchema, body);
    if (validation.ok === false) {
      sendJson(res, { error: validation.error }, 400);
      return;
    }
    const { username, password, turnstileToken } = validation.data;
    usernameForLog = username;

    // Rate limit por IP + username (5 tentativas / 15 min).
    const xff = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim()
      ?? (req.headers['x-real-ip'] as string | undefined)
      ?? 'unknown';
    const rlKey = `login:${ip}:${username.toLowerCase()}`;
    const rl = await checkRateLimit(rlKey);
    if (!rl.ok) {
      sendJson(res, { error: `Muitas tentativas de login. Tente novamente em ${rl.retryAfter}s.` }, 429);
      return;
    }

    // Verifica o Turnstile (se configurado).
    const turnstileOk = await verifyTurnstile(turnstileToken);
    if (!turnstileOk) {
      sendJson(res, { error: 'Verificação de segurança falhou. Tente novamente.' }, 400);
      return;
    }

    const sql = createSql();
    try {
      await withTimeout(ensureLojaSchema(sql), dbTimeoutMs());
    } catch {
      /* a coluna `loja` pode faltar: o token usa a loja padrão */
    }

    let rows: Record<string, unknown>[];
    try {
      rows = await withTimeout(
        sql`SELECT username, password, role, loja FROM app_users WHERE username = ${username} LIMIT 1`,
        dbTimeoutMs(),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        logError(error, { action: 'login', username, stage: 'db_query' });
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

    // Login ok: reseta o rate limit para esta chave.
    await resetRateLimit(rlKey);

    // O perfil `enc_flv` deixou de existir: o token sai como `encarregado`
    // (a migration converte o cadastro; aqui é a rede de segurança).
    const role = user.role === 'enc_flv' ? 'encarregado' : user.role;

    // Loja do usuário: vem do cadastro e vai assinada no token — é o escopo
    // que o servidor aplica em todos os dados operacionais.
    const loja = Number.isInteger(Number(user.loja)) && Number(user.loja) > 0
      ? Number(user.loja)
      : DEFAULT_LOJA;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + SESSION_TTL_SECONDS;
    const token = signJwt(
      { sub: user.username, role, loja, iat: now, exp: expiresAt },
      jwtSecret(),
    );

    // Define o cookie HttpOnly (não retorna o token no body)
    setAuthCookie(res, token, { maxAge: SESSION_TTL_SECONDS });

    sendJson(res, {
      success: true,
      user: { username: user.username, role, loja },
      expiresAt,
    });
  } catch (error) {
    logError(error, { action: 'login', username: usernameForLog });
    sendJson(res, { error: 'Não foi possível falar com o banco de dados. Tente novamente em instantes.' }, 503);
  }
}

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  // Parseia os cookies uma única vez para que `getToken` funcione.
  req.cookies = parseCookies(req);

  const body = await readJsonBody<Record<string, unknown>>(req);
  const action = body.action;

  if (action === 'login') {
    await handleLogin(body, req, res);
    return;
  }

  if (action === 'logout') {
    clearAuthCookie(res);
    sendJson(res, { success: true });
    return;
  }

  if (action === 'me') {
    // `authenticate` já responde 401 quando não há token válido.
    const payload = authenticate(req, res);
    if (!payload) return;

    sendJson(res, {
      user: {
        username: payload.sub,
        role: payload.role,
        loja: payload.loja ?? null,
      },
    });
    return;
  }

  sendJson(res, { error: 'Ação inválida. Use login, logout ou me.' }, 400);
};

export default handler;
