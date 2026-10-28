/**
 * Cliente da API do backend (Serverless Functions na Vercel).
 *
 * Substitui o antigo `supabase.functions.invoke`: mesma assinatura e mesmo
 * formato de retorno (`{ data, error }`), para que os componentes e contextos
 * continuem funcionando sem mudanças de lógica.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- o corpo das respostas é JSON dinâmico */

const TOKEN_KEY = 'estoque_pro_token';

/** Base opcional (testes/domínio externo). Vazio = mesmo origem (`/api/*`). */
function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (configured || '').replace(/\/+$/, '');
}

export interface InvokeOptions {
  /** Corpo da requisição (enviado como JSON). */
  body?: unknown;
  /** Cabeçalhos adicionais. */
  headers?: Record<string, string>;
  /** Token de sessão (por padrão lê o token salvo no login). */
  token?: string | null;
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

function sessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Erro no mesmo formato do Supabase Functions (`error.context.status`). */
function httpError(status: number, message: string): InvokeError {
  return { name: 'FunctionsHttpError', message, context: { status } };
}

/**
 * Chama uma função do backend: `invokeFunction('manage-validade', { body })`.
 * Envia o token da sessão no cabeçalho `Authorization: Bearer`.
 */
export async function invokeFunction<T = any>(
  name: string,
  options: InvokeOptions = {},
): Promise<InvokeResult<T>> {
  const token = options.token === undefined ? sessionToken() : options.token;

  try {
    const response = await fetch(`${apiBase()}/api/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body: JSON.stringify(options.body ?? {}),
    });

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
  } catch {
    return { data: null, error: { name: 'FunctionsFetchError', message: 'Não foi possível conectar ao servidor' } };
  }
}

/**
 * Decodifica o payload de um JWT (usado para checar validade e papel do usuário
 * no cliente). Assume payload em base64, com suporte a UTF-8.
 */
export function parseJwtPayload(token: string): { sub: string; role: string; exp: number } | null {
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
