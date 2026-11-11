import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { invokeFunction, parseJwtPayload } from '@/lib/api';
import { limparCacheCategorias } from '@/lib/categorias';

interface User {
  username: string;
  role: 'admin' | 'user' | 'promotor' | 'encarregado' | 'col_validade' | 'enc_flv';
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
}


const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'estoque_pro_token';
const SESSION_KEY = 'estoque_pro_session';
const SESSION_DURATION_MS = 6 * 60 * 60 * 1000;

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

  const login = useCallback(async (username: string, password: string, remember = false): Promise<LoginResult> => {
    try {
      // Timeout menor que o padrão: no login a espera é curta e a mensagem
      // de rede ajuda a identificar proxy/firewall corporativo.
      const { data, error } = await invokeFunction<{
        success?: boolean;
        error?: string;
        token?: string;
        user?: User;
      }>('auth-login', {
        body: { username, password },
        timeoutMs: 15000,
      });

      if (error) return { ok: false, error: error.message };
      if (!data?.success || !data?.token || !data?.user) {
        return { ok: false, error: data?.error || 'Usuário ou senha inválidos.' };
      }

      const u: User = { username: data.user.username, role: data.user.role };
      setUser(u);

      // Store only the JWT token — role/username are derived from its signed payload
      localStorage.setItem(TOKEN_KEY, data.token);

      if (remember) {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ expiresAt: Date.now() + SESSION_DURATION_MS })
        );
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
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    // A taxonomia de seções fica em memória: a próxima sessão recarrega.
    limparCacheCategorias();
  }, []);

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
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === 'admin', userRole: user?.role ?? null, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
