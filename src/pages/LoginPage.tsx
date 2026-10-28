import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Package, Lock, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import loginBg from '@/assets/login-bg.jpg';

const LoginPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const success = await login(username, password, remember);
    if (!success) {
      setError('Usuário ou senha inválidos.');
    }
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <img src={loginBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-primary/40 backdrop-blur-[2px]" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary shadow-lg">
            <Package className="h-8 w-8 text-secondary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary-foreground text-center">
            🛒 Estoque Pro
            <span className="mt-1 block text-sm font-normal text-primary-foreground/60">
              Sistema de Gerenciamento de Estoque
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
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
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
