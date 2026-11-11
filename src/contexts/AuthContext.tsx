import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { invokeFunction, parseJwtPayload } from '@/lib/api';
import { limparCacheCategorias } from '@/lib/categorias';

interface User {
  username: string;
  role: 'admin' | 'user' | 'promotor' | 'encarregado' | 'col_validade' | 'enc_flv';
  /** Loja do usuário (multi-loja). Vem assinado no token. */
  loja?: number;
}

/** Loja cadastrada no sistema (para o seletor do admin). */
export interface Loja {
  codigo: number;
  nome: string;
  ativo: boolean;
}

/** Resultado do login: além do sucesso, traz o motivo da falha. */
interface LoginResult {
  ok: boolean;
  /** Mensagem pronta para exibir (ex.: "Usuário ou senha inválidos."). */
  error?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string, remember?: boolean) => Promise<LoginResult>;
  logout: () => void;
  isAdmin: boolean;
  userRole: 'admin' | 'user' | 'promotor' | 'encarregado' | 'col_validade' | 'enc_flv' | null;
  getToken: () => string | null;
  /** Loja atual do usuário (vem do token). */
  loja: number | null;
  /** Lojas cadastradas (preenchido para o admin). */
  lojas: Loja[];
  /** Troca a loja do admin em tempo de execução (re-assina o token). */
  switchLoja: (codigo: number) => Promise<{ ok: boolean; error?: string }>;
}


const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'estoque_pro_token';
const SESSION_KEY = 'estoque_pro_session';
/** Janela da sessão com "Lembrar-me" (7 dias, igual ao token do servidor). */
const REMEMBER_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function loadSession(): { user: User; token: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    const payload = parseJwtPayload(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }

    // Optional "remember me" expiry window
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const session = JSON.parse(raw);
        if (session.expiresAt && Date.now() > session.expiresAt) {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(TOKEN_KEY);
          return null;
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }

    // Derive identity strictly from the cryptographically signed JWT —
    // never from unsigned localStorage JSON (prevents role forgery).
    return {
      user: {
        username: payload.sub,
        role: payload.role as User['role'],
        loja: typeof payload.loja === 'number' ? payload.loja : undefined,
      },
      token,
    };
  } catch {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => loadSession()?.user ?? null);
  const [lojas, setLojas] = useState<Loja[]>([]);

  const login = useCallback(async (username: string, password: string, remember = false): Promise<LoginResult> => {
    try {
      // Timeout menor que o padrão: no login a espera é curta e a mensagem
      // de rede ajuda a identificar proxy/firewall corporativo. Uma nova
      // tentativa é segura aqui (consultar credenciais não grava nada) e
      // ajuda quando o domínio resolve para um IP bloqueado na rede.
      const { data, error } = await invokeFunction<{
        success?: boolean;
        error?: string;
        token?: string;
        expiresAt?: number;
        user?: User;
      }>('auth-login', {
        body: { username, password, remember },
        timeoutMs: 15000,
        retries: 1,
        retryDelayMs: 1200,
      });

      if (error) return { ok: false, error: error.message };
      if (!data?.success || !data?.token || !data?.user) {
        return { ok: false, error: data?.error || 'Usuário ou senha inválidos.' };
      }

      const u: User = {
        username: data.user.username,
        role: data.user.role,
        loja: typeof data.user.loja === 'number' ? data.user.loja : undefined,
      };
      setUser(u);

      // Store only the JWT token — role/username are derived from its signed payload
      localStorage.setItem(TOKEN_KEY, data.token);

      // Com "Lembrar-me", a sessão vale 7 dias (o servidor emite o token com
      // essa validade). Sem ele, a sessão segue o token (6 h) e a chave antiga
      // é removida para não manter uma janela de login maior que a do token.
      if (remember) {
        const expiresAt = data.expiresAt
          ? data.expiresAt * 1000
          : Date.now() + REMEMBER_DURATION_MS;
        localStorage.setItem(SESSION_KEY, JSON.stringify({ expiresAt }));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Não foi possível entrar.',
      };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setLojas([]);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    // A taxonomia de seções fica em memória: a próxima sessão recarrega.
    limparCacheCategorias();
  }, []);

  /**
   * Troca a loja em tempo de execução (admin).
   *
   * O servidor re-assina o token com a loja escolhida — o navegador não
   * escolhe o escopo por conta própria. Depois da troca a página recarrega
   * para que todas as telas voltem a buscar os dados da nova loja.
   */
  const switchLoja = useCallback(async (codigo: number): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { data, error } = await invokeFunction<{
        success?: boolean;
        error?: string;
        token?: string;
        user?: User;
      }>('manage-users', {
        body: { action: 'switch_loja', newUser: { loja: codigo } },
      });

      if (error) return { ok: false, error: error.message };
      if (!data?.success || !data?.token || !data?.user) {
        return { ok: false, error: data?.error || 'Não foi possível trocar a loja.' };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setUser({
        username: data.user.username,
        role: data.user.role,
        loja: typeof data.user.loja === 'number' ? data.user.loja : codigo,
      });
      // Recarrega para limpar os dados da loja anterior em memória.
      window.location.reload();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Não foi possível trocar a loja.',
      };
    }
  }, []);

  // O admin precisa da lista de lojas para o seletor do header.
  useEffect(() => {
    if (user?.role !== 'admin') {
      setLojas([]);
      return;
    }
    let cancelado = false;
    void (async () => {
      const { data } = await invokeFunction<{ lojas?: Loja[] }>('manage-users', {
        body: { action: 'list_lojas' },
      });
      if (!cancelado && Array.isArray(data?.lojas)) setLojas(data.lojas);
    })();
    return () => {
      cancelado = true;
    };
  }, [user?.role]);

  const getToken = useCallback((): string | null => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    // Check expiry
    const payload = parseJwtPayload(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_KEY);
      setUser(null);
      return null;
    }

    return token;
  }, []);

  // Check session expiry periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        const payload = parseJwtPayload(token);
        if (!payload || payload.exp * 1000 < Date.now()) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(SESSION_KEY);
          setUser(null);
        }
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAdmin: user?.role === 'admin',
        userRole: user?.role ?? null,
        getToken,
        loja: user?.loja ?? null,
        lojas,
        switchLoja,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
