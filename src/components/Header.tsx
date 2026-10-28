import { useAuth } from '@/contexts/AuthContext';
import { LogOut, ShoppingCart, ClipboardList, Target, Database, Users, ChevronDown, CalendarClock, ScanBarcode, PackagePlus } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export type ViewType = 'consulta' | 'inventario' | 'base' | 'usuarios' | 'metas' | 'validade' | 'add-produto';

interface HeaderProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
}


const Header = ({ currentView, onNavigate }: HeaderProps) => {
  const { user, logout, isAdmin, userRole } = useAuth();
  

  const allNavItems = [
    { key: 'consulta' as const, label: 'Consulta', icon: ScanBarcode, roles: ['admin'] },
    { key: 'inventario' as const, label: 'Inventário', icon: ClipboardList, roles: ['admin', 'user', 'enc_flv'] },
    { key: 'metas' as const, label: 'Metas', icon: Target, roles: ['admin'] },
    { key: 'validade' as const, label: 'Validade', icon: CalendarClock, roles: ['admin', 'user', 'promotor', 'encarregado', 'col_validade', 'enc_flv'] },
  ];

  const mainNavItems = allNavItems.filter(item => userRole && item.roles.includes(userRole));

  const adminItems = [
    { key: 'base' as const, label: 'Base de Dados', icon: Database },
    { key: 'usuarios' as const, label: 'Usuários', icon: Users },
    { key: 'add-produto' as const, label: 'Adicionar Produto', icon: PackagePlus },
  ];

  const handleNav = (view: ViewType) => {
    onNavigate(view);
  };

  return (
    <header className="border-b border-primary/20 bg-primary shadow-lg">
      <div className="mx-auto flex h-14 sm:h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => handleNav('consulta')} className="text-base sm:text-lg font-bold text-primary-foreground hover:opacity-80 transition-opacity cursor-pointer" aria-label="Estoque Pro — ir para a página inicial">Estoque Pro</button>
        </div>

        <div className="flex items-center gap-1">
          {mainNavItems.map((item) => (
            <Button
              key={item.key}
              variant={currentView === item.key ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleNav(item.key)}
              className={`h-8 w-8 sm:h-9 sm:w-9 ${currentView !== item.key ? 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground' : ''}`}
              title={item.label}
              aria-label={item.label}
              aria-current={currentView === item.key ? 'page' : undefined}

            >
              <item.icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          ))}

          <NotificationBell onNavigateToValidade={() => onNavigate('validade')} />

          <div className="mx-1 h-6 w-px bg-primary-foreground/20" />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground" title={user?.username} aria-label={`Menu do usuário${user?.username ? ` ${user.username}` : ''}`}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5 text-sm font-medium">
                {user?.username}
                {userRole && <span className="ml-1 text-xs opacity-60">({userRole === 'admin' ? 'admin' : userRole === 'encarregado' ? 'encarregado' : userRole === 'enc_flv' ? 'enc. flv' : userRole === 'promotor' ? 'promotor' : userRole === 'col_validade' ? 'col. validade' : 'usuário'})</span>}
              </div>
              <DropdownMenuSeparator />
              {isAdmin && (
                <>
                  {adminItems.map((item) => (
                    <DropdownMenuItem
                      key={item.key}
                      onClick={() => handleNav(item.key)}
                      className={`gap-2 cursor-pointer ${currentView === item.key ? 'bg-accent font-medium' : ''}`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={logout} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

    </header>
  );
};

export default Header;
