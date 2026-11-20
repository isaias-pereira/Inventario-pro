import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import LoginPage from '@/pages/LoginPage';
import { trackView } from '@/lib/analytics';
import { podeAcessarView, viewInicial, type ViewType } from '@/lib/permissoes';

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
const GuiasAdminView = lazy(() => import('@/components/GuiasAdminView'));

const ViewFallback = () => (
  <div className="flex flex-1 items-center justify-center py-16" role="status" aria-live="polite">
    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
    <span className="sr-only">Carregando tela…</span>
  </div>
);

const Index = () => {
  const { user, isAdmin, isDono, userRole } = useAuth();
  // O encarregado (dono ou não) continua pousando na Validade; o dono só
  // ganhou acesso às áreas extras, não mudou a tela inicial.
  const [view, setView] = useState<ViewType>(() => viewInicial(userRole));

  const safeView = user
    ? (podeAcessarView(userRole, isDono, view) ? view : viewInicial(userRole))
    : 'consulta';

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
    'guias': 'Guias & QR Code',
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
        {safeView === 'base' && (isAdmin || isDono) && <BaseView onBack={() => setView('consulta')} />}
        {safeView === 'usuarios' && (isAdmin || userRole === 'encarregado') && <UserManagementView />}
        {safeView === 'add-produto' && (isAdmin || userRole === 'encarregado') && (
          <AddProductView canEdit={isAdmin} />
        )}
        {safeView === 'revisao-secoes' && (isAdmin || isDono) && <RevisaoSecoesView />}
        {safeView === 'guias' && (isAdmin || userRole === 'encarregado') && <GuiasAdminView />}
      </Suspense>

    </div>
  );
};

export default Index;
