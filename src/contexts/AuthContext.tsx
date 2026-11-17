import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { invokeFunction } from '@/lib/api';
import { limparCacheCategorias } from '@/lib/categorias';

/** Perfis do SGS-PRO (o `enc_flv` deixou de existir). */
export type UserRole = 'admin' | 'user' | 'promotor' | 'encarregado' | 'col_validade';

interface User {
  username: string;
  role: UserRole;
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
  login: (username: string, password: string, turnstileToken?: string) => Promise<LoginResult>;
  logout: () => void;
  isAdmin: boolean;
  userRole: UserRole | null;
  /** Loja atual do usuário (vem do token). */
  loja: number | null;
  /** Lojas cadastradas (preenchido para o admin). */
  lojas: Loja[];
  /** Troca a loja do admin em tempo de execução (re-assina o token). */
  switchLoja: (codigo: number) => Promise<{ ok: boolean; error?: string }>;
}


const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = 'estoque_pro_user';

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as User;
    // O perfil `enc_flv` deixou de existir: limpa sessão antiga.
    if (String(user.role) === 'enc_flv') {
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return user;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

/** Chama /api/auth-me para restaurar a sessão a partir do cookie HttpOnly. */
async function fetchMe(): Promise<User | null> {
  try {
    const { data, error } = await invokeFunction<{ user: User | null }>('auth-me');
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => loadUser());
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydration: restaura sessão do cookie no primeiro render
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const u = await fetchMe();
      if (!cancelado) {
        if (u) {
          setUser(u);
          localStorage.setItem(USER_KEY, JSON.stringify(u));
        } else {
          setUser(null);
          localStorage.removeItem(USER_KEY);
        }
        setHydrated(true);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const login = useCallback(async (username: string, password: string, turnstileToken?: string): Promise<LoginResult> => {
    try {
      const { data, error } = await invokeFunction<{
        success?: boolean;
        error?: string;
        expiresAt?: number;
        user?: User;
      }>('auth', {
        body: { action: 'login', username, password, turnstileToken },
        timeoutMs: 15000,
        retries: 1,
        retryDelayMs: 1200,
      });

      if (error) return { ok: false, error: error.message };
      if (!data?.success || !data?.user) {
        return { ok: false, error: data?.error || 'Usuário ou senha inválidos.' };
      }

      const u: User = {
        username: data.user.username,
        role: String(data.user.role) === 'enc_flv' ? 'encarregado' : data.user.role,
        loja: typeof data.user.loja === 'number' ? data.user.loja : undefined,
      };
      setUser(u);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Não foi possível entrar.',
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await invokeFunction('auth', { body: { action: 'logout' } });
    } finally {
      setUser(null);
      setLojas([]);
      localStorage.removeItem(USER_KEY);
      limparCacheCategorias();
    }
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
        user?: User;
      }>('manage-users', {
        body: { action: 'switch_loja', newUser: { loja: codigo } },
      });

      if (error) return { ok: false, error: error.message };
      if (!data?.success || !data?.user) {
        return { ok: false, error: data?.error || 'Não foi possível trocar a loja.' };
      }

      const u: User = {
        username: data.user.username,
        role: data.user.role,
        loja: typeof data.user.loja === 'number' ? data.user.loja : codigo,
      };
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u);
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
    return () => { cancelado = true; };
  }, [user?.role]);

  // Não expõe getToken: o token está no cookie HttpOnly e o navegador o envia automaticamente.
  // Se algum código legado chamar getToken(), retorna null (força migração).
  const getToken = useCallback((): string | null => null, []);

  // Não renderiza filhos até a hidratação terminar (evita flash de "não logado").
  if (!hydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAdmin: user?.role === 'admin',
        userRole: user?.role ?? null,
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
