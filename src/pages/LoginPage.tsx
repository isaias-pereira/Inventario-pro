import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, User, Loader2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import loginBg from '@/assets/login-bg.jpg';

/** Mensagens de rede: a tela mostra o que fazer em vez de "Entrando..." infinito. */
const NETWORK_HINTS = [
  'sem resposta do servidor',
  'não foi possível conectar',
  'não respondeu a tempo',
  'banco de dados indisponível',
];

function isNetworkProblem(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_HINTS.some((hint) => lower.includes(hint));
}

const LoginPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOffline(false);
    setLoading(true);
    const result = await login(username, password, remember);
    if (!result.ok) {
      const message = result.error || 'Não foi possível entrar.';
      setError(message);
      setOffline(isNetworkProblem(message));
    }
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <img src={loginBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-primary/40 backdrop-blur-[2px]" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg">
            <img src="/sgs-icon.png" alt="SGS" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary-foreground text-center">
            SGS-PRO
            <span className="mt-1 block text-sm font-normal text-primary-foreground/60">
              Sistema de gerenciamento de Setor
            </span>
          </h1>

        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border/20 bg-card p-8 shadow-2xl"
        >
          <div className="mb-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-card-foreground">Usuário</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Digite seu usuário"
                  className="pl-10"
                  autoFocus
                  required
                  disabled={loading}
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-card-foreground">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="pl-10"
                  required
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            <label htmlFor="remember" className="text-sm text-card-foreground cursor-pointer select-none">
              Lembrar-me
            </label>
          </div>

          {error && (
            <div
              className={`mb-4 rounded-lg p-3 text-sm ${
                offline ? 'bg-amber-500/15 text-amber-700' : 'bg-destructive/10 text-destructive'
              }`}
              role="alert"
            >
              <p className="flex items-start gap-2">
                {offline && <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                <span>{error}</span>
              </p>
              {offline && (
                <div className="mt-2 space-y-1 pl-6 text-xs opacity-90">
                  <p>
                    Esta tela abre mesmo sem internet (o app é instalado como PWA), mas o SGS-PRO
                    precisa falar com o servidor para conferir o usuário e buscar os dados.
                  </p>
                  <p>
                    Use o 4G/hotspot do celular ou peça ao TI para liberar o domínio{' '}
                    <span className="font-mono">inventario-pro-one.vercel.app</span>.
                  </p>
                </div>
              )}
            </div>
          )}

          <Button type="submit" className="w-full bg-blue-600 text-white hover:bg-blue-700" disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando...</> : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
