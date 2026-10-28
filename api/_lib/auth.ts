import { bearerToken, sendJson, type ApiRequest, type ApiResponse } from './http.js';
import { verifyJwt, type JwtPayload } from './jwt.js';

/** Segredo usado para assinar/validar os tokens de sessão (HS256). */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado');
  return secret;
}

/** Valida o token da requisição; responde 401 e devolve null quando inválido. */
export function authenticate(req: ApiRequest, res: ApiResponse): JwtPayload | null {
  const token = bearerToken(req);
  if (!token) {
    sendJson(res, { error: 'Token obrigatório' }, 401);
    return null;
  }
  const payload = verifyJwt(token, jwtSecret());
  if (!payload) {
    sendJson(res, { error: 'Token inválido ou expirado' }, 401);
    return null;
  }
  return payload;
}
