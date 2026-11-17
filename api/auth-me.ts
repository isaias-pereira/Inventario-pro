/**
 * Retorna o usuário atual a partir do cookie HttpOnly.
 *
 * GET /api/auth-me
 * Resposta: { user: { username, role, loja } } | { user: null }
 */

import { authenticate } from './_lib/auth.js';
import { requirePost, sendJson, type ApiHandler, type ApiRequest, type ApiResponse } from './_lib/http.js';

const handler: ApiHandler = async (req, res) => {
  // Aceita GET e POST (para compatibilidade)
  if (req.method === 'OPTIONS') {
    sendJson(res, {}, 204);
    return;
  }

  try {
    const payload = authenticate(req, res);
    if (!payload) {
      sendJson(res, { user: null });
      return;
    }

    sendJson(res, {
      user: {
        username: payload.sub,
        role: payload.role,
        loja: payload.loja ?? null,
      },
    });
  } catch (error) {
    sendJson(res, { user: null });
  }
};

export default handler;