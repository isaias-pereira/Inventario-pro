/**
 * Tipos compartilhados do cliente da API.
 * Separado para evitar importação circular com `api.ts`.
 */

export interface InvokeOptions {
  /** Corpo da requisição (enviado como JSON). */
  body?: unknown;
  /** Cabeçalhos adicionais. */
  headers?: Record<string, string>;
  /**
   * Tempo máximo da requisição em milissegundos (padrão: {@link DEFAULT_TIMEOUT_MS}).
   * Sem isso, uma rede que engole a requisição (proxy corporativo, firewall)
   * deixa a tela em "carregando" para sempre.
   */
  timeoutMs?: number;
  /**
   * Tentativas extras quando a falha é de rede (padrão: 0).
   *
   * O domínio do SGS-PRO resolve para mais de um IP e, em rede corporativa,
   * um deles pode estar bloqueado: a primeira conexão pendura e a segunda
   * passa. Use apenas em operações idempotentes (ex.: login), para não
   * duplicar uma gravação que já tenha chegado ao servidor.
   */
  retries?: number;
  /** Espera entre as tentativas, em milissegundos (padrão: 1200). */
  retryDelayMs?: number;
}

export interface InvokeError {
  name: string;
  message: string;
  context?: { status?: number };
  /** Código de erro interno do servidor (ex.: 'VALIDATION_ERROR', 'DB_ERROR'). */
  code?: string;
  /** Detalhes extras do erro (validação, constraints, etc.). */
  details?: Record<string, unknown>;
}

export interface InvokeResult<T = unknown> {
  data: T | null;
  error: InvokeError | null;
}

/** Códigos de erro padrão do backend para tratamento específico no frontend. */
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