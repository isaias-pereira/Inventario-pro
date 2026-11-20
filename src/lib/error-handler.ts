/**
 * Tratamento de erro centralizado para o frontend SGS-PRO.
 *
 * Objetivos:
 * - Padronizar mensagens de erro para o usuário
 * - Categorizar erros (rede, auth, validação, servidor, desconhecido)
 * - Facilitar debug (logs estruturados)
 * - Evitar repetição de try/catch nos componentes
 */

export enum ErrorCategory {
  NETWORK = 'network',       // Sem conexão, proxy, firewall
  TIMEOUT = 'timeout',       // Servidor não respondeu a tempo
  AUTH = 'auth',             // Sessão expirada, não autorizado
  VALIDATION = 'validation', // Dados inválidos (400)
  FORBIDDEN = 'forbidden',   // Sem permissão (403)
  NOT_FOUND = 'not_found',   // Recurso não existe (404)
  SERVER = 'server',         // Erro interno (500)
  SERVICE_UNAVAILABLE = 'service_unavailable', // 503 - IA, email, etc.
  UNKNOWN = 'unknown',       // Qualquer outro
}

export interface AppError {
  category: ErrorCategory;
  message: string;           // Mensagem amigável para o usuário
  originalError?: Error;     // Erro original (para debug)
  status?: number;           // HTTP status se disponível
  context?: Record<string, unknown>; // Contexto extra
  timestamp: string;
}

/** Mapeia HTTP status para categoria de erro. */
function statusToCategory(status: number): ErrorCategory {
  if (status === 0) return ErrorCategory.NETWORK;
  if (status === 401) return ErrorCategory.AUTH;
  if (status === 403) return ErrorCategory.FORBIDDEN;
  if (status === 404) return ErrorCategory.NOT_FOUND;
  if (status === 400) return ErrorCategory.VALIDATION;
  if (status === 503) return ErrorCategory.SERVICE_UNAVAILABLE;
  if (status >= 500) return ErrorCategory.SERVER;
  return ErrorCategory.UNKNOWN;
}

/** Cria um AppError a partir do InvokeError do cliente da API. */
export function createAppError(invokeError: { name: string; message: string; context?: { status?: number } }, context?: Record<string, unknown>): AppError {
  const status = invokeError.context?.status;
  const category = status ? statusToCategory(status) : (
    invokeError.name === 'FunctionsTimeoutError' ? ErrorCategory.TIMEOUT :
    invokeError.name === 'FunctionsFetchError' ? ErrorCategory.NETWORK :
    ErrorCategory.UNKNOWN
  );

  // Mensagens amigáveis por categoria
  const friendlyMessages: Record<ErrorCategory, string> = {
    [ErrorCategory.NETWORK]: 'Não foi possível conectar ao servidor. Verifique sua internet ou se o proxy da empresa está bloqueando o acesso.',
    [ErrorCategory.TIMEOUT]: 'O servidor demorou muito para responder. Tente novamente ou use outra conexão (ex.: 4G).',
    [ErrorCategory.AUTH]: 'Sua sessão expirou. Faça login novamente.',
    [ErrorCategory.FORBIDDEN]: 'Você não tem permissão para esta ação.',
    [ErrorCategory.NOT_FOUND]: 'O recurso solicitado não foi encontrado.',
    [ErrorCategory.VALIDATION]: 'Os dados informados são inválidos.',
    [ErrorCategory.SERVER]: 'Erro interno do servidor. Tente novamente em instantes.',
    [ErrorCategory.SERVICE_UNAVAILABLE]: 'Este recurso está indisponível no momento (configuração do servidor).',
    [ErrorCategory.UNKNOWN]: 'Ocorreu um erro inesperado. Tente novamente.',
  };

  return {
    category,
    message: friendlyMessages[category] || invokeError.message,
    originalError: new Error(invokeError.message),
    status,
    context,
    timestamp: new Date().toISOString(),
  };
}

/** Cria AppError a partir de uma exceção genérica. */
export function createAppErrorFromException(err: unknown, context?: Record<string, unknown>): AppError {
  if (err instanceof Error) {
    // Tenta extrair status do erro se for do tipo fetch
    const status = (err as { context?: { status?: number } }).context?.status;
    return createAppError({
      name: err.name,
      message: err.message,
      context: { status },
    }, context);
  }
  return {
    category: ErrorCategory.UNKNOWN,
    message: 'Erro desconhecido',
    originalError: err instanceof Error ? err : new Error(String(err)),
    context,
    timestamp: new Date().toISOString(),
  };
}

/** Log estruturado para console (desenvolvimento) e serviços de monitoramento. */
export function logError(appError: AppError, extraContext?: Record<string, unknown>): void {
  const logEntry = {
    level: 'error',
    category: appError.category,
    message: appError.message,
    status: appError.status,
    timestamp: appError.timestamp,
    stack: appError.originalError?.stack,
    context: {
      ...appError.context,
      ...extraContext,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      url: typeof window !== 'undefined' ? window.location.href : 'server',
    },
  };

  // Em produção, envia para serviço de monitoramento (ex.: Sentry, Datadog)
  // Aqui apenas loga no console com formato JSON para facilitar parsing
  if (typeof console !== 'undefined') {
    console.error('[SGS-PRO Error]', JSON.stringify(logEntry));
  }
}

/**
 * Hook para tratamento de erro em componentes.
 *
 * Uso:
 *   const { handleError, handleApiCall } = useErrorHandler();
 *
 *   try {
 *     await handleApiCall(() => invokeFunction('minha-funcao', { body: {...} }));
 *   } catch (e) {
 *     handleError(e, { acao: 'salvar_produto' });
 *   }
 */
export function useErrorHandler() {
  // Em um hook real, isso viraria um estado reativo com toast
  // Aqui exportamos as funções puras para uso direto

  return {
    /** Trata um erro e mostra toast (requer sonner no contexto). */
    handleError: (err: unknown, context?: Record<string, unknown>) => {
      const appError = createAppErrorFromException(err, context);
      logError(appError);
      return appError;
    },

    /** Executa uma função assíncrona e trata erros automaticamente. */
    async handleApiCall<T>(fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T | null> {
      try {
        return await fn();
      } catch (err) {
        const appError = createAppErrorFromException(err, context);
        logError(appError);
        return null;
      }
    },

    /** Verifica se é erro de rede/timeout (para retry automático). */
    isRetryable: (err: unknown): boolean => {
      const appError = createAppErrorFromException(err);
      return appError.category === ErrorCategory.NETWORK || appError.category === ErrorCategory.TIMEOUT;
    },

    /** Verifica se é erro de autenticação (para redirecionar login). */
    isAuthError: (err: unknown): boolean => {
      const appError = createAppErrorFromException(err);
      return appError.category === ErrorCategory.AUTH;
    },
  };
}

/** Utilitário para usar fora de componentes React (ex.: em libs). */
export const errorHandler = {
  create: createAppErrorFromException,
  log: logError,
  isRetryable: (err: unknown) => createAppErrorFromException(err).category === ErrorCategory.NETWORK || createAppErrorFromException(err).category === ErrorCategory.TIMEOUT,
  isAuthError: (err: unknown) => createAppErrorFromException(err).category === ErrorCategory.AUTH,
};

/** Wrapper para invokeFunction que já trata e loga erros. */
export async function safeInvoke<T = any>(
  name: string,
  options: import('./api').InvokeOptions = {},
  context?: Record<string, unknown>
): Promise<{ data: T | null; error: AppError | null }> {
  const { invokeFunction } = await import('./api');
  const result = await invokeFunction<T>(name, options);

  if (result.error) {
    const appError = createAppError(result.error, { function: name, ...context });
    logError(appError);
    return { data: null, error: appError };
  }

  return { data: result.data, error: null };
}