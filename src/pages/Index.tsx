import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Header, { ViewType } from '@/components/Header';
import ConsultaView from '@/components/ConsultaView';
import InventarioView from '@/components/InventarioView';
import BaseView from '@/components/BaseView';
import UserManagementView from '@/components/UserManagementView';
import AddProductView from '@/components/AddProductView';
import MetasView from '@/components/MetasView';
import ValidadeView from '@/components/ValidadeView';
import LoginPage from '@/pages/LoginPage';

const Index = () => {
  const { user, isAdmin, userRole } = useAuth();
  const [view, setView] = useState<ViewType>('consulta');

  if (!user) return <LoginPage />;

  // Determine default view based on role
  const getDefaultView = (): ViewType => {
    if (userRole === 'promotor' || userRole === 'col_validade') return 'validade';
    if (userRole === 'user') return 'inventario';
    if (userRole === 'enc_flv') return 'inventario';
    if (userRole === 'encarregado') return 'validade';
    return 'consulta';
  };

  // Check if user has access to the current view
  const hasAccess = (v: ViewType): boolean => {
    if (userRole === 'admin') return true;
    if (userRole === 'encarregado') return v === 'validade';
    if (userRole === 'enc_flv') return v === 'inventario' || v === 'validade';
    if (userRole === 'user') return v === 'inventario' || v === 'validade';
    if (userRole === 'promotor' || userRole === 'col_validade') return v === 'validade';
    return false;
  };

  const safeView = hasAccess(view) ? view : getDefaultView();

  const viewTitles: Record<ViewType, string> = {
    consulta: 'Consulta de Produtos',
    inventario: 'Contagem de Inventário',
    metas: 'Metas e Indicadores',
    validade: 'Controle de Validade',
    base: 'Base de Dados',
    usuarios: 'Gerenciamento de Usuários',
    'add-produto': 'Adicionar Produto',
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-cover bg-center bg-fixed bg-no-repeat"
      style={{ backgroundImage: "url('/bg-main.jpg')" }}
    >
      <Header currentView={safeView} onNavigate={setView} />
      <h1 className="sr-only">
        {`Estoque Pro — ${viewTitles[safeView]} | Painel de Controle de Estoque`}
      </h1>
      {safeView === 'consulta' && <ConsultaView />}
      {safeView === 'inventario' && <InventarioView />}
      {safeView === 'metas' && <MetasView />}
      {safeView === 'validade' && <ValidadeView />}
      {safeView === 'base' && isAdmin && <BaseView onBack={() => setView('consulta')} />}
      {safeView === 'usuarios' && isAdmin && <UserManagementView />}
      {safeView === 'add-produto' && isAdmin && <AddProductView />}

    </div>
  );
};

export default Index;
