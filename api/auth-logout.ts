/**
 * Logout — limpa o cookie de autenticação.
 *
 * POST /api/auth-logout
 * Body: {} (vazio)
 * Resposta: { success: true }
 */

import { requirePost, sendJson, type ApiHandler, clearAuthCookie } from './_lib/http.js';

const handler: ApiHandler = async (req, res) => {
  if (!requirePost(req, res)) return;

  clearAuthCookie(res);
  sendJson(res, { success: true });
};

export default handler;