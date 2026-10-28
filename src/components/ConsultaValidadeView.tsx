import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, CalendarClock, FileText, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ValidadeItem {
  id: string;
  ean: number;
  codigo: number;
  descricao: string;
  validade: string;
  status: boolean;
  created_by: string | null;
  quantidade: number;
  created_at: string | null;
}

function getToken(): string | null {
  try { return localStorage.getItem('estoque_pro_token'); } catch { return null; }
}

const ConsultaValidadeView = () => {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [selectedUser, setSelectedUser] = useState('todos');
  const [users, setUsers] = useState<string[]>([]);
  const [items, setItems] = useState<ValidadeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [detailItem, setDetailItem] = useState<ValidadeItem | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  useEffect(() => {
    const fetchUsers = async () => {
      const token = getToken();
      const { data } = await supabase.functions.invoke('manage-validade', {
        body: { action: 'list_users' },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.users) setUsers(data.users);
    };
    fetchUsers();
  }, []);

  const handleSearch = async () => {
    const hasDateRange = dataInicio && dataFim;
    const hasUser = selectedUser !== 'todos';
    const isArrastao = selectedUser === '__arrastao__';
    const hasPartialDate = (dataInicio && !dataFim) || (!dataInicio && dataFim);

    if (!hasDateRange && !hasUser) {
      toast.error('Informe um período ou selecione um usuário');
      return;
    }
    if (hasPartialDate && !hasUser) {
      toast.error('Preencha data início e fim ou selecione um usuário');
      return;
    }
    setLoading(true);
    setSearched(true);
    setPage(1);
    try {
      const token = getToken();

      if (isArrastao) {
        const bodyPayload: Record<string, string> = { action: 'consulta_all_items' };
        if (dataInicio) bodyPayload.data_inicio = dataInicio;
        if (dataFim) bodyPayload.data_fim = dataFim;
        const { data, error } = await supabase.functions.invoke('manage-arrastao', {
          body: bodyPayload,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (error) { toast.error('Erro ao consultar'); setItems([]); }
        else if (data?.error) { toast.error(data.error); setItems([]); }
        else { setItems(data?.items || []); }
      } else {
        const bodyPayload: Record<string, string> = { action: 'consulta_periodo' };
        if (dataInicio) bodyPayload.data_inicio = dataInicio;
        if (dataFim) bodyPayload.data_fim = dataFim;
        if (hasUser) bodyPayload.created_by = selectedUser;

        const { data, error } = await supabase.functions.invoke('manage-validade', {
          body: bodyPayload,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (error) { toast.error('Erro ao consultar'); setItems([]); }
        else if (data?.error) { toast.error(data.error); setItems([]); }
        else { setItems(data?.items || []); }
      }
    } catch {
      toast.error('Erro ao consultar');
      setItems([]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">

      <div className="grid grid-cols-2 gap-2 items-end">
        <div className="min-w-0">
          <label className="text-xs font-medium text-muted-foreground">Data Início</label>
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="mt-1 w-full" />
        </div>
        <div className="min-w-0">
          <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="mt-1 w-full" />
        </div>
        <div className="min-w-0">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" /> Usuário
          </label>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="__arrastao__">Arrastão</SelectItem>
              {users.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSearch} disabled={loading || (!dataInicio && !dataFim && selectedUser === 'todos')} className="gap-1.5 w-full mt-1">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Consultar
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Buscando...</span>
        </div>
      )}

      {!loading && searched && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/50 p-6 text-center">
          <CalendarClock className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
        </div>
      )}

      {!loading && items.length > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        const currentPage = Math.min(page, totalPages);
        const start = (currentPage - 1) * PAGE_SIZE;
        const visible = items.slice(start, start + PAGE_SIZE);
        return (
        <div className="space-y-1.5 w-full">
          <p className="text-xs text-muted-foreground">{items.length} registro(s) encontrado(s)</p>
          {visible.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border bg-card p-3 cursor-pointer transition-colors hover:bg-muted/30 w-full min-w-0"
              onClick={() => setDetailItem(item)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{item.descricao}</p>
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">EAN: {item.ean}</p>
                </div>
                <Badge variant={item.status ? 'outline' : 'destructive'} className="text-[10px] shrink-0">
                  {item.status ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1.5 text-xs text-muted-foreground min-w-0">
                <span className="truncate">Qtd: <span className="font-semibold text-foreground">{item.quantidade}</span></span>
                <span className="truncate text-right">Val: {new Date(item.validade).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-muted-foreground min-w-0">
                {item.created_by && <span className="truncate">Por: <span className="font-medium">{item.created_by}</span></span>}
                {item.created_at && (
                  <span className="truncate text-right">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                )}
              </div>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground">Página {currentPage} de {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="gap-1">
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        );
      })()}

      <Dialog open={!!detailItem} onOpenChange={(open) => { if (!open) setDetailItem(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Detalhes do Registro</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</p>
                <p className="text-sm font-semibold">{detailItem.descricao}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">EAN</p>
                  <p className="text-sm font-mono">{detailItem.ean}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Código</p>
                  <p className="text-sm font-mono">{detailItem.codigo}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Quantidade</p>
                  <p className="text-sm font-semibold">{detailItem.quantidade}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Validade</p>
                  <p className="text-sm font-semibold">{new Date(detailItem.validade).toLocaleDateString('pt-BR')}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</p>
                  <Badge variant={detailItem.status ? 'outline' : 'destructive'} className="text-xs mt-0.5">
                    {detailItem.status ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Registrado por</p>
                  <p className="text-sm">{detailItem.created_by || '—'}</p>
                </div>
              </div>
              {detailItem.created_at && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data de Registro</p>
                  <p className="text-sm font-semibold">{new Date(detailItem.created_at).toLocaleString('pt-BR')}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConsultaValidadeView;
