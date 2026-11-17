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
}

export interface InvokeResult<T = unknown> {
  data: T | null;
  error: InvokeError | null;
}