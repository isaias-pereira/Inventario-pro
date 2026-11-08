import { useAuth } from '@/contexts/AuthContext';
import { LogOut, ClipboardList, Target, Database, Users, ChevronDown, CalendarClock, ScanBarcode, PackagePlus, Tag, Mail, Tags } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export type ViewType = 'consulta' | 'inventario' | 'base' | 'usuarios' | 'metas' | 'validade' | 'rebaixa' | 'add-produto' | 'email' | 'revisao-secoes';

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
    { key: 'rebaixa' as const, label: 'Rebaixa', icon: Tag, roles: ['admin', 'encarregado', 'enc_flv'] },
  ];

  const mainNavItems = allNavItems.filter(item => userRole && item.roles.includes(userRole));

  const adminItems = [
    { key: 'base' as const, label: 'Base de Dados', icon: Database },
    { key: 'usuarios' as const, label: 'Usuários', icon: Users },
    { key: 'add-produto' as const, label: 'Adicionar Produto', icon: PackagePlus },
    { key: 'revisao-secoes' as const, label: 'Revisão de Seções', icon: Tags },
  ];

  // E-mail padrão das rebaixas: admin cadastra, encarregado consulta.
  const emailItems = [{ key: 'email' as const, label: 'E-Mail', icon: Mail }];
  const showEmailItems = isAdmin || userRole === 'encarregado';

  const handleNav = (view: ViewType) => {
    onNavigate(view);
  };

  return (
    <header className="border-b border-primary/20 bg-primary shadow-lg">
      <div className="mx-auto flex h-14 sm:h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button onClick={() => handleNav('consulta')} className="whitespace-nowrap text-base sm:text-lg font-bold text-primary-foreground hover:opacity-80 transition-opacity cursor-pointer" aria-label="SGS-PRO — ir para a página inicial">SGS-PRO</button>
          {user?.username && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-4 w-px shrink-0 bg-primary-foreground/30" aria-hidden="true" />
              <span
                className="max-w-[80px] truncate text-sm text-primary-foreground/85 sm:max-w-[180px]"
                title={user.username}
              >
                {user.username}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {mainNavItems.map((item) => (
            <Button
              key={item.key}
              variant={currentView === item.key ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleNav(item.key)}
              className={`h-7 w-7 sm:h-9 sm:w-9 ${currentView !== item.key ? 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground' : ''}`}
              title={item.label}
              aria-label={item.label}
              aria-current={currentView === item.key ? 'page' : undefined}

            >
              <item.icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
            </Button>
          ))}

          <NotificationBell onNavigateToValidade={() => onNavigate('validade')} />

          <div className="mx-1 h-6 w-px bg-primary-foreground/20" />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground sm:h-9 sm:w-9" title={user?.username} aria-label={`Menu do usuário${user?.username ? ` ${user.username}` : ''}`}>
                <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5 text-sm font-medium">
                {user?.username}
                {userRole && <span className="ml-1 text-xs opacity-60">({userRole === 'admin' ? 'admin' : userRole === 'encarregado' ? 'encarregado' : userRole === 'enc_flv' ? 'enc. flv' : userRole === 'promotor' ? 'promotor' : userRole === 'col_validade' ? 'col. validade' : 'usuário'})</span>}
              </div>
              <DropdownMenuSeparator />
              {showEmailItems && (
                <>
                  {emailItems.map((item) => (
                    <DropdownMenuItem
                      key={item.key}
                      onClick={() => handleNav(item.key)}
                      className={`gap-2 cursor-pointer ${currentView === item.key ? 'bg-accent font-medium' : ''}`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                  {isAdmin && <DropdownMenuSeparator />}
                </>
              )}
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
