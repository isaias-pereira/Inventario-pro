/**
 * Cliente da API do backend (Serverless Functions na Vercel).
 *
 * Substitui o antigo `supabase.functions.invoke`: mesma assinatura e mesmo
 * formato de retorno (`{ data, error }`), para que os componentes e contextos
 * continuem funcionando sem mudanças de lógica.
 *
 * O token de sessão agora é um cookie HttpOnly (`estoque_pro_token`).
 * O navegador o envia automaticamente em cada requisição — não precisamos
 * lê-lo do localStorage nem enviar `Authorization: Bearer`.
 */

import type { InvokeOptions, InvokeError, InvokeResult } from './api-types.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- o corpo das respostas é JSON dinâmico */

/** Base opcional (testes/domínio externo). Vazio = mesmo origem (`/api/*`). */
function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (configured || '').replace(/\/+$/, '');
}

/**
 * Tempo máximo padrão de uma chamada à API.
 *
 * A tela do login e as demais views dependem dessa chamada: sem timeout, uma
 * rede corporativa que bloqueie o domínio do SGS-PRO trava o app em
 * "carregando" sem nunca explicar o motivo.
 */
export const DEFAULT_TIMEOUT_MS = 25_000;

/** Mensagens de rede: dizem o que aconteceu e o que fazer. */
export const NETWORK_ERROR_MESSAGE =
  'Não foi possível conectar ao servidor do SGS-PRO. Verifique a internet ou o proxy desta máquina.';
export const TIMEOUT_ERROR_MESSAGE =
  'O servidor do SGS-PRO não respondeu a tempo. A rede pode estar bloqueando o acesso — tente outra conexão (ex.: 4G/hotspot) ou peça ao TI para liberar o domínio do sistema.';

/** Erro no mesmo formato do Supabase Functions (`error.context.status`). */
function httpError(status: number, message: string): InvokeError {
  return { name: 'FunctionsHttpError', message, context: { status } };
}

/** Sinal interno de tempo esgotado (independe do `AbortError` do navegador). */
class RequestTimeoutError extends Error {
  constructor() {
    super('Tempo esgotado');
    this.name = 'RequestTimeoutError';
  }
}

export async function invokeFunction<T = any>(
  name: string,
  options: InvokeOptions = {},
): Promise<InvokeResult<T>> {
  const maxRetries = Math.max(0, options.retries ?? 0);
  const retryDelayMs = options.retryDelayMs ?? 1200;

  let result: InvokeResult<T> = {
    data: null,
    error: { name: 'FunctionsFetchError', message: NETWORK_ERROR_MESSAGE },
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    result = await invokeOnce<T>(name, options);

    // Só falhas de rede/timeout valem nova tentativa: um erro HTTP (senha
    // errada, por exemplo) repetiria sem mudar o resultado.
    const retryable = result.error?.name === 'FunctionsFetchError'
      || result.error?.name === 'FunctionsTimeoutError';
    if (!retryable || attempt === maxRetries) return result;

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  return result;
}

/** Uma tentativa de chamada à API (com timeout próprio). */
async function invokeOnce<T = any>(
  name: string,
  options: InvokeOptions,
): Promise<InvokeResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A corrida com o timer garante o fim da espera mesmo se o navegador
  // demorar (ou não obedecer) o `abort` — o `abort` só cancela a requisição.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new RequestTimeoutError());
    }, timeoutMs);
  });

  try {
    const request = fetch(`${apiBase()}/api/${name}`, {
      method: 'POST',
      credentials: 'include', // IMPORTANTE: envia o cookie HttpOnly
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(options.body ?? {}),
      signal: controller?.signal,
    });

    const response = await Promise.race([request, timeout]);

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message =
        (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)
          ? String((data as Record<string, unknown>).error)
          : '') || `Falha na requisição (${response.status})`;
      return { data: data as T, error: httpError(response.status, message) };
    }

    return { data: data as T, error: null };
  } catch (error) {
    const timedOut = error instanceof RequestTimeoutError
      || (error instanceof Error && error.name === 'AbortError');
    return {
      data: null,
      error: {
        name: timedOut ? 'FunctionsTimeoutError' : 'FunctionsFetchError',
        message: timedOut ? TIMEOUT_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE,
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Decodifica o payload de um JWT (mantido para compatibilidade com código legado).
 * Com o cookie HttpOnly, o token não está acessível no JS — esta função
 * retorna `null` a menos que um token seja passado explicitamente.
 */
export function parseJwtPayload(token: string): { sub: string; role: string; loja?: number; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      decodeURIComponent(
        Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join('')
      )
    );
    return payload;
  } catch {
    return null;
  }
}
