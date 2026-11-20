/**
 * Hook React para tratamento de erro em chamadas à API.
 *
 * Substitui os blocos try/catch repetitivos nos componentes.
 * Integra com `sonner` (toast) e o logger centralizado.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  ErrorCategory,
  type AppError,
  createAppErrorFromException,
  logError,
  safeInvoke,
  type InvokeOptions,
} from '@/lib/error-handler';

interface UseApiErrorOptions {
  /** Mensagem de sucesso (opcional). */
  successMessage?: string;
  /** Se deve mostrar toast de erro (padrão: true). */
  showErrorToast?: boolean;
  /** Contexto extra para o log. */
  context?: Record<string, unknown>;
  /** Callback ao sucesso. */
  onSuccess?: (data: unknown) => void;
  /** Callback ao erro. */
  onError?: (error: AppError) => void;
}

interface UseApiErrorResult<T> {
  /** Função para executar a chamada à API. */
  execute: (name: string, options?: InvokeOptions) => Promise<T | null>;
  /** Último erro (se houver). */
  error: AppError | null;
  /** Se está executando. */
  loading: boolean;
}

/**
 * Hook principal para chamadas à API com tratamento de erro automático.
 *
 * Exemplo:
 *   const { execute, loading, error } = useApiError();
 *
 *   const salvar = async () => {
 *     const result = await execute('minha-funcao', { body: { ... } });
 *     if (result) { ... }
 *   };
 */
export function useApiError<T = any>(options: UseApiErrorOptions = {}): UseApiErrorResult<T> {
  const {
    successMessage,
    showErrorToast = true,
    context = {},
    onSuccess,
    onError,
  } = options;

  // Estado simples via closure (para não depender de useState em lib)
  // Em componentes reais, use useState se precisar re-renderizar
  let loading = false;
  let error: AppError | null = null;

  const execute = useCallback(async (name: string, invokeOptions?: InvokeOptions): Promise<T | null> => {
    loading = true;
    error = null;

    try {
      const result = await safeInvoke<T>(name, invokeOptions, context);

      if (result.error) {
        error = result.error;
        if (showErrorToast) {
          toast.error(error.message, {
            description: error.status ? `Status ${error.status}` : undefined,
          });
        }
        onError?.(error);
        return null;
      }

      if (successMessage) {
        toast.success(successMessage);
      }
      onSuccess?.(result.data);
      return result.data;
    } catch (err) {
      const appError = createAppErrorFromException(err, context);
      error = appError;
      logError(appError);

      if (showErrorToast) {
        toast.error(appError.message);
      }
      onError?.(appError);
      return null;
    } finally {
      loading = false;
    }
  }, [successMessage, showErrorToast, context, onSuccess, onError]);

  return { execute, error, loading };
}

/**
 * Hook para ações simples que só precisam de toast de sucesso/erro.
 * Não retorna dados, apenas executa e avisa.
 */
export function useApiAction(options: UseApiErrorOptions = {}) {
  const { execute, loading, error } = useApiError<unknown>({
    ...options,
    successMessage: options.successMessage || 'Operação realizada com sucesso',
  });

  return { execute, loading, error };
}

/**
 * Hook para chamadas que podem falhar por rede/timeout e devem sugerir retry.
 */
export function useApiWithRetry<T = any>(options: UseApiErrorOptions = {}) {
  const { execute, loading, error } = useApiError<T>({
    ...options,
    showErrorToast: true,
  });

  const executeWithRetry = useCallback(async (
    name: string,
    invokeOptions?: InvokeOptions,
    maxRetries = 2
  ): Promise<T | null> => {
    let lastError: AppError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await execute(name, invokeOptions);
      if (result !== null) return result;

      // Se não for erro de rede/timeout, não tenta novamente
      if (error && ![ErrorCategory.NETWORK, ErrorCategory.TIMEOUT].includes(error.category)) {
        return null;
      }
      lastError = error;

      // Espera antes de tentar novamente (backoff exponencial simples)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    if (lastError && options.showErrorToast !== false) {
      toast.error(`${lastError.message} (tentamos ${maxRetries + 1}x)`);
    }
    return null;
  }, [execute, error, options.showErrorToast]);

  return { execute: executeWithRetry, loading, error };
}

/** Helper para mostrar toast de erro padronizado sem usar hook. */
export function showApiError(err: unknown, context?: Record<string, unknown>): AppError {
  const { createAppErrorFromException, logError } = require('@/lib/error-handler');
  const appError = createAppErrorFromException(err, context);
  logError(appError);
  toast.error(appError.message);
  return appError;
}

/** Helper para toast de sucesso padronizado. */
export function showSuccess(message: string, description?: string): void {
  toast.success(message, { description });
}

/** Helper para toast de aviso padronizado. */
export function showWarning(message: string, description?: string): void {
  toast.warning(message, { description });
}

/** Helper para toast de info padronizado. */
export function showInfo(message: string, description?: string): void {
  toast.info(message, { description });
}