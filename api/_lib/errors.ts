/**
 * Respostas de erro padronizadas para o backend.
 *
 * Fornece helpers para criar erros com códigos consistentes que o
 * frontend pode tratar de forma específica (retry, redirect, toast, etc.).
 */

import { sendJson, type ApiResponse } from './http.js';

/** Códigos de erro padrão do SGS-PRO. */
export enum ServerErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  FOREIGN_KEY_VIOLATION = 'FOREIGN_KEY_VIOLATION',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  DB_ERROR = 'DB_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** Mapeia códigos de erro do Postgres (SQLSTATE) para códigos do SGS-PRO. */
export function pgErrorToServerCode(pgCode: string): ServerErrorCode {
  switch (pgCode) {
    case '23505': // unique_violation
      return ServerErrorCode.DUPLICATE_ENTRY;
    case '23503': // foreign_key_violation
      return ServerErrorCode.FOREIGN_KEY_VIOLATION;
    case '23502': // not_null_violation
    case '23514': // check_violation
      return ServerErrorCode.VALIDATION_ERROR;
    case 'P0001': // raise_exception (nossos RAISE)
      return ServerErrorCode.INTERNAL_ERROR;
    default:
      if (pgCode.startsWith('23')) return ServerErrorCode.DB_ERROR;
      if (pgCode.startsWith('22')) return ServerErrorCode.VALIDATION_ERROR; // data_exception
      return ServerErrorCode.DB_ERROR;
  }
}

/** Cria resposta de erro padronizada. */
export function createErrorResponse(
  message: string,
  code: ServerErrorCode,
  status: number,
  details?: Record<string, unknown>
): { error: string; code: ServerErrorCode; details?: Record<string, unknown> } {
  return { error: message, code, details };
}

/** Envia erro de validação (400). */
export function sendValidationError(
  res: ApiResponse,
  message: string,
  details?: Record<string, unknown>
): void {
  sendJson(res, createErrorResponse(message, ServerErrorCode.VALIDATION_ERROR, 400, details), 400);
}

/** Envia erro de duplicidade (409). */
export function sendDuplicateError(
  res: ApiResponse,
  message: string,
  details?: Record<string, unknown>
): void {
  sendJson(res, createErrorResponse(message, ServerErrorCode.DUPLICATE_ENTRY, 409, details), 409);
}

/** Envia erro de recurso não encontrado (404). */
export function sendNotFoundError(
  res: ApiResponse,
  message: string = 'Recurso não encontrado',
  details?: Record<string, unknown>
): void {
  sendJson(res, createErrorResponse(message, ServerErrorCode.NOT_FOUND, 404, details), 404);
}

/** Envia erro de não autorizado (401). */
export function sendUnauthorizedError(
  res: ApiResponse,
  message: string = 'Sessão expirada ou inválida',
  details?: Record<string, unknown>
): void {
  sendJson(res, createErrorResponse(message, ServerErrorCode.UNAUTHORIZED, 401, details), 401);
}

/** Envia erro de proibido (403). */
export function sendForbiddenError(
  res: ApiResponse,
  message: string = 'Sem permissão para esta ação',
  details?: Record<string, unknown>
): void {
  sendJson(res, createErrorResponse(message, ServerErrorCode.FORBIDDEN, 403, details), 403);
}

/** Envia erro de serviço indisponível (503). */
export function sendServiceUnavailableError(
  res: ApiResponse,
  message: string,
  details?: Record<string, unknown>
): void {
  sendJson(res, createErrorResponse(message, ServerErrorCode.SERVICE_UNAVAILABLE, 503, details), 503);
}

/** Envia erro de rate limit (429). */
export function sendRateLimitError(
  res: ApiResponse,
  message: string,
  retryAfter?: number
): void {
  const details = retryAfter ? { retryAfter } : undefined;
  sendJson(res, createErrorResponse(message, ServerErrorCode.RATE_LIMITED, 429, details), 429);
}

/** Envia erro interno do servidor (500). */
export function sendInternalError(
  res: ApiResponse,
  message: string = 'Erro interno do servidor',
  details?: Record<string, unknown>
): void {
  sendJson(res, createErrorResponse(message, ServerErrorCode.INTERNAL_ERROR, 500, details), 500);
}

/** Envia erro de banco de dados (500 ou mapeado). */
export function sendDbError(
  res: ApiResponse,
  err: unknown,
  defaultMessage = 'Erro ao acessar o banco de dados'
): void {
  if (err instanceof Error && 'code' in err) {
    const pgCode = String((err as { code: string }).code);
    const serverCode = pgErrorToServerCode(pgCode);

    // Duplicidade → 409
    if (serverCode === ServerErrorCode.DUPLICATE_ENTRY) {
      sendDuplicateError(res, 'Este registro já existe', { pgCode });
      return;
    }
    // FK violation → 400
    if (serverCode === ServerErrorCode.FOREIGN_KEY_VIOLATION) {
      sendValidationError(res, 'Referência inválida: verifique os dados informados', { pgCode });
      return;
    }
    // Validation → 400
    if (serverCode === ServerErrorCode.VALIDATION_ERROR) {
      sendValidationError(res, 'Dados inválidos', { pgCode });
      return;
    }
  }

  sendInternalError(res, defaultMessage);
}

/** Wrapper para try/catch que já trata e envia o erro padronizado. */
export async function withErrorHandling<T>(
  res: ApiResponse,
  fn: () => Promise<T>,
  context?: string
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    // Log do erro com contexto
    const ctx = context ? { action: context } : undefined;
    console.error('[API Error]', context ?? 'unknown', err);

    // Tenta mapear erro do Postgres
    if (err instanceof Error && 'code' in err) {
      sendDbError(res, err);
      return null;
    }

    // Erro genérico
    sendInternalError(res);
    return null;
  }
}

/** Helper para validação Zod que já envia erro padronizado. */
export function validateAndSend<T>(
  res: ApiResponse,
  schema: { safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: (string | number)[]; message: string }> }; data?: T } },
  body: unknown
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details: Record<string, string> = {};
    for (const issue of result.error!.issues) {
      details[issue.path.join('.')] = issue.message;
    }
    sendValidationError(res, 'Dados inválidos', details);
    return null;
  }
  return result.data!;
}