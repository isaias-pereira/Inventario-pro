import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Header, { ViewType } from '@/components/Header';
import LoginPage from '@/pages/LoginPage';
import { trackView } from '@/lib/analytics';

// Cada tela é carregada sob demanda: só entra no bundle inicial o que a
// primeira tela precisa. As telas pesadas (BaseView com xlsx, MetasView com
// recharts, Validade/Rebaixa com jsPDF) ficam em pedaços separados.
const ConsultaView = lazy(() => import('@/components/ConsultaView'));
const InventarioView = lazy(() => import('@/components/InventarioView'));
const BaseView = lazy(() => import('@/components/BaseView'));
const UserManagementView = lazy(() => import('@/components/UserManagementView'));
const AddProductView = lazy(() => import('@/components/AddProductView'));
const MetasView = lazy(() => import('@/components/MetasView'));
const ValidadeView = lazy(() => import('@/components/ValidadeView'));
const RebaixaView = lazy(() => import('@/components/RebaixaView'));
const EmailView = lazy(() => import('@/components/EmailView'));
const RevisaoSecoesView = lazy(() => import('@/components/RevisaoSecoesView'));

const ViewFallback = () => (
  <div className="flex flex-1 items-center justify-center py-16" role="status" aria-live="polite">
    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
    <span className="sr-only">Carregando tela…</span>
  </div>
);

const Index = () => {
  const { user, isAdmin, userRole } = useAuth();
  const [view, setView] = useState<ViewType>('consulta');

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
    if (userRole === 'encarregado') return v === 'validade' || v === 'rebaixa' || v === 'email';
    if (userRole === 'enc_flv') return v === 'inventario' || v === 'validade' || v === 'rebaixa';
    if (userRole === 'user') return v === 'inventario' || v === 'validade';
    if (userRole === 'promotor' || userRole === 'col_validade') return v === 'validade';
    return false;
  };

  const safeView = user ? (hasAccess(view) ? view : getDefaultView()) : 'consulta';

  // A navegação interna não muda a URL: cada tela é registrada no Analytics.
  useEffect(() => {
    if (!user) return;
    trackView(safeView);
  }, [safeView, user]);

  if (!user) return <LoginPage />;

  const viewTitles: Record<ViewType, string> = {
    consulta: 'Consulta de Produtos',
    inventario: 'Contagem de Inventário',
    metas: 'Metas e Indicadores',
    validade: 'Controle de Validade',
    rebaixa: 'Rebaixa',
    email: 'E-mail',
    base: 'Base de Dados',
    usuarios: 'Gerenciamento de Usuários',
    'add-produto': 'Adicionar Produto',
    'revisao-secoes': 'Revisão de Seções',
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-cover bg-center bg-fixed bg-no-repeat"
      style={{ backgroundImage: "url('/bg-main.jpg')" }}
    >
      <Header currentView={safeView} onNavigate={setView} />
      <h1 className="sr-only">
        {`SGS-PRO — ${viewTitles[safeView]} | Sistema de gerenciamento de Setor`}
      </h1>
      <Suspense fallback={<ViewFallback />}>
        {safeView === 'consulta' && <ConsultaView />}
        {safeView === 'inventario' && <InventarioView />}
        {safeView === 'metas' && <MetasView />}
        {safeView === 'validade' && <ValidadeView />}
        {safeView === 'rebaixa' && <RebaixaView />}
        {safeView === 'email' && <EmailView />}
        {safeView === 'base' && isAdmin && <BaseView onBack={() => setView('consulta')} />}
        {safeView === 'usuarios' && isAdmin && <UserManagementView />}
        {safeView === 'add-produto' && isAdmin && <AddProductView />}
        {safeView === 'revisao-secoes' && isAdmin && <RevisaoSecoesView />}
      </Suspense>

    </div>
  );
};

export default Index;
