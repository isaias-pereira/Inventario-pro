import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Loader2, Plus, Users, Clock, CalendarClock, ScanBarcode, Trash2, Check, History, ArrowLeft, ShoppingBasket, PackageX, AlertCircle, Eye, ChevronDown, ChevronUp, Download, List as ListIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import BarcodeScanner from '@/components/BarcodeScanner';
import arrastaoBg from '@/assets/arrastao-bg.webp';

interface ArrastaoSession {
  id: string;
  corredor: string;
  started_by: string;
  participants: string[];
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'finalized' | 'expired';
  total_items?: number;
  total_vencidos?: number;
}

interface ArrastaoItem {
  id: string;
  session_id: string;
  ean: number;
  codigo: number;
  descricao: string;
  validade: string;
  quantidade: number;
  scanned_by: string;
  created_at: string;
}

interface ProductResult { ean: string; codigo: string; descricao: string }

function getToken(): string | null {
  try { return localStorage.getItem('estoque_pro_token'); } catch { return null; }
}

async function invoke(action: string, body: Record<string, unknown> = {}) {
  const token = getToken();
  return supabase.functions.invoke('manage-arrastao', {
    body: { action, ...body },
    headers: { Authorization: `Bearer ${token}` },
  });
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; onFinalizeRefresh?: () => void }

const ArrastaoView = ({ open, onOpenChange, onFinalizeRefresh }: Props) => {
  const { user, getToken: authGetToken, isAdmin } = useAuth();
  const username = user?.username || '';

  const [tab, setTab] = useState<'list' | 'session' | 'log'>('list');
  const [sessions, setSessions] = useState<ArrastaoSession[]>([]);
  const [logs, setLogs] = useState<ArrastaoSession[]>([]);
  const [activeSession, setActiveSession] = useState<ArrastaoSession | null>(null);
  const [items, setItems] = useState<ArrastaoItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newCorredor, setNewCorredor] = useState('');
  const [starting, setStarting] = useState(false);

  // Scan state
  const [code, setCode] = useState('');
  const [validade, setValidade] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [product, setProduct] = useState<ProductResult | null>(null);
  const [searchStatus, setSearchStatus] = useState<'idle'|'loading'|'not_found'|'error'|'found'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [logItems, setLogItems] = useState<Record<string, ArrastaoItem[]>>({});
  const [loadingLogItems, setLoadingLogItems] = useState<string | null>(null);
  const [listDialog, setListDialog] = useState<ArrastaoSession | null>(null);
  const [listVisibleCount, setListVisibleCount] = useState(50);
  const LIST_PAGE_SIZE = 50;

  const pollRef = useRef<number | null>(null);

  const fetchSessions = useCallback(async () => {
    const { data } = await invoke('list_active');
    if (data?.sessions) setSessions(data.sessions);
  }, []);

  const fetchLogs = useCallback(async () => {
    const { data } = await invoke('list_log');
    if (data?.sessions) setLogs(data.sessions);
  }, []);

  const fetchItems = useCallback(async (sessionId: string) => {
    const { data } = await invoke('list_items', { session_id: sessionId });
    if (data?.items) setItems(data.items);
  }, []);

  // Initial + polling
  useEffect(() => {
    if (!open) return;
    if (tab === 'list') { fetchSessions(); }
    if (tab === 'log') { fetchLogs(); }
    if (tab === 'session' && activeSession) { fetchItems(activeSession.id); }

    pollRef.current = window.setInterval(() => {
      if (tab === 'list') fetchSessions();
      if (tab === 'session' && activeSession) {
        fetchItems(activeSession.id);
        // refresh participants list + detect finalization
        invoke('list_active').then(({ data }) => {
          if (data?.sessions) {
            const updated = (data.sessions as ArrastaoSession[]).find(s => s.id === activeSession.id);
            if (updated) setActiveSession(updated);
            else {
              // Lock UI immediately, then navigate back
              setSessionEnded(true);
              toast.info('Arrastão foi finalizado');
              onFinalizeRefresh?.();
              window.setTimeout(() => {
                setTab('list'); setActiveSession(null); setItems([]); setSessionEnded(false);
              }, 1200);
            }
          }
        });
      }
    }, 3000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [open, tab, activeSession, fetchSessions, fetchLogs, fetchItems, onFinalizeRefresh]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setTab('list'); setActiveSession(null); setItems([]);
      setCode(''); setValidade(''); setQuantidade(''); setProduct(null); setSearchStatus('idle');
    }
  }, [open]);

  const handleStart = async () => {
    if (!newCorredor.trim()) { toast.error('Informe o corredor'); return; }
    setStarting(true);
    const { data, error } = await invoke('start', { corredor: newCorredor.trim() });
    setStarting(false);
    if (error || data?.error) { toast.error(data?.error || 'Erro ao iniciar'); return; }
    toast.success('Arrastão iniciado');
    setShowNew(false); setNewCorredor('');
    setActiveSession(data.session);
    setTab('session');
  };

  const handleOpenSession = async (s: ArrastaoSession, spectate = false) => {
    if (spectate) {
      setActiveSession(s);
      setTab('session');
      return;
    }
    if (!s.participants.includes(username)) {
      const { data, error } = await invoke('join', { session_id: s.id });
      if (error || data?.error) { toast.error(data?.error || 'Erro ao participar'); return; }
      toast.success('Você entrou no arrastão');
      setActiveSession(data.session);
    } else {
      setActiveSession(s);
    }
    setTab('session');
  };

  // Product search
  const queryProduct = async (codigo: string) => {
    const token = authGetToken();
    return supabase.functions.invoke('query-product', {
      body: { codigo },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
  };

  const searchProduct = async (c: string) => {
    setSearchStatus('loading'); setProduct(null); setErrorMsg('');
    try {
      const { data, error } = await queryProduct(c);
      if (error) { setSearchStatus('error'); setErrorMsg('Erro ao conectar.'); return; }
      if (data.error) { setSearchStatus('error'); setErrorMsg(data.error); return; }
      if (!data.found) { setSearchStatus('not_found'); return; }
      setProduct(data.product); setSearchStatus('found');
    } catch { setSearchStatus('error'); setErrorMsg('Erro ao conectar.'); }
  };

  const handleAddItem = async () => {
    if (!activeSession || !product || !validade || submitting) return;
    setSubmitting(true);
    const { data, error } = await invoke('add_item', {
      session_id: activeSession.id,
      item: {
        ean: Number(product.ean),
        codigo: Number(product.codigo),
        descricao: product.descricao,
        validade: new Date(validade + 'T23:59:59').toISOString(),
        quantidade: parseInt(quantidade) || 1,
      },
    });
    setSubmitting(false);
    if (error || data?.error) { toast.error(data?.error || 'Erro'); return; }
    toast.success('Item coletado');
    setCode(''); setValidade(''); setQuantidade(''); setProduct(null); setSearchStatus('idle');
    fetchItems(activeSession.id);
  };

  const handleRemoveItem = async (id: string) => {
    if (!activeSession) return;
    const { data, error } = await invoke('remove_item', { session_id: activeSession.id, item_id: id });
    if (error || data?.error) { toast.error(data?.error || 'Erro'); return; }
    fetchItems(activeSession.id);
  };

  const handleFinalize = async () => {
    if (!activeSession) return;
    setFinalizing(true);
    const { data, error } = await invoke('finalize', { session_id: activeSession.id });
    setFinalizing(false);
    if (error || data?.error) { toast.error(data?.error || 'Erro'); return; }
    toast.success(`Arrastão finalizado. ${data.transferred || 0} item(ns) enviado(s) à Validade.`);
    setActiveSession(null); setItems([]); setTab('list');
    fetchSessions();
    onFinalizeRefresh?.();
  };

  const ensureItems = async (s: ArrastaoSession) => {
    if (!logItems[s.id]) {
      setLoadingLogItems(s.id);
      const { data } = await invoke('list_items', { session_id: s.id });
      setLogItems((p) => ({ ...p, [s.id]: data?.items || [] }));
      setLoadingLogItems(null);
    }
  };

  const toggleLog = async (s: ArrastaoSession) => {
    if (expandedLog === s.id) { setExpandedLog(null); return; }
    setExpandedLog(s.id);
    await ensureItems(s);
  };

  const openList = async (s: ArrastaoSession) => {
    setListVisibleCount(LIST_PAGE_SIZE);
    setListDialog(s);
    await ensureItems(s);
  };


  const downloadPdf = async (s: ArrastaoSession, its: ArrastaoItem[]) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const dateStr = new Date(s.started_at).toLocaleDateString('pt-BR');
    const vencidos = its.filter((i) => new Date(i.validade).getTime() < Date.now()).length;

    // ===== Cabeçalho / Título =====
    doc.setFillColor(33, 37, 41);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Arrastão - Corredor: ${s.corredor}`, marginX, 14);

    // ===== Metadados =====
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Data: ${dateStr}`, marginX, 30);
    doc.text(`Total: ${its.length}   |   Vencidos: ${vencidos}`, marginX, 35);
    const participantsText = `Participantes: ${s.participants.join(', ')}`;
    const partLines = doc.splitTextToSize(participantsText, pageW - marginX * 2);
    doc.text(partLines, marginX, 40);

    // ===== Tabela =====
    const tableTop = 40 + partLines.length * 4 + 4;
    const cols = [
      { key: 'codigo', label: 'Código', x: marginX, w: 38 },
      { key: 'descricao', label: 'Descrição', x: marginX + 38, w: pageW - marginX * 2 - 38 - 28 },
      { key: 'validade', label: 'Validade', x: pageW - marginX - 28, w: 28 },
    ];
    const rowH = 7;

    const drawHeader = (y: number) => {
      doc.setFillColor(33, 37, 41);
      doc.rect(marginX, y, pageW - marginX * 2, rowH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      cols.forEach((c) => doc.text(c.label, c.x + 2, y + rowH - 2));
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
    };

    let y = tableTop;
    drawHeader(y);
    y += rowH;

    its.forEach((it, idx) => {
      if (y + rowH > pageH - 12) {
        doc.addPage();
        y = 16;
        drawHeader(y);
        y += rowH;
      }
      if (idx % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(marginX, y, pageW - marginX * 2, rowH, 'F');
      }
      const exp = new Date(it.validade).getTime() < Date.now();
      const desc = String(it.descricao);
      const descTrunc = desc.length > 55 ? desc.slice(0, 54) + '…' : desc;
      if (exp) doc.setTextColor(200, 0, 0); else doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.text(String(it.codigo), cols[0].x + 2, y + rowH - 2);
      doc.text(descTrunc, cols[1].x + 2, y + rowH - 2);
      doc.text(new Date(it.validade).toLocaleDateString('pt-BR'), cols[2].x + 2, y + rowH - 2);
      y += rowH;
    });

    // Borda da tabela
    doc.setDrawColor(200, 200, 200);
    doc.setTextColor(0, 0, 0);

    // Rodapé com paginação
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Página ${i} de ${pageCount}`, pageW - marginX, pageH - 6, { align: 'right' });
    }

    doc.save(`arrastao-${s.corredor}-${dateStr.replace(/\//g, '-')}.pdf`);
  };

  const elapsedHours = (start: string) => ((Date.now() - new Date(start).getTime()) / 3600000);
  const remainingLabel = (start: string) => {
    const remaining = 6 - elapsedHours(start);
    if (remaining <= 0) return 'Expirando';
    const h = Math.floor(remaining); const m = Math.floor((remaining - h) * 60);
    return `${h}h${m.toString().padStart(2,'0')} restantes`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-full w-screen h-[100dvh] sm:max-w-4xl sm:w-full sm:h-[90vh] p-4 sm:p-6 flex flex-col gap-4 overflow-y-auto rounded-none sm:rounded-lg"
        style={{ backgroundImage: `url(${arrastaoBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tab === 'session' && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setActiveSession(null); setTab('list'); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            Arrastão
            {tab === 'session' && activeSession && (
              <Badge variant="outline" className="ml-2">Corredor: {activeSession.corredor}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* TABS */}
        {tab !== 'session' && (
          <div className="flex gap-2 border-b">
            <button className={`px-3 py-2 text-sm font-medium ${tab==='list' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`} onClick={() => setTab('list')}>Ativos</button>
            <button className={`px-3 py-2 text-sm font-medium flex items-center gap-1 ${tab==='log' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`} onClick={() => setTab('log')}>
              <History className="h-3.5 w-3.5" /> Log
            </button>
          </div>
        )}

        {/* LIST */}
        {tab === 'list' && (
          <div className="space-y-3">
            <Button onClick={() => setShowNew(true)} className="w-full gap-2">
              <Plus className="h-4 w-4" /> Novo Arrastão
            </Button>
            {sessions.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nenhum arrastão ativo.
              </div>
            ) : sessions.map((s) => {
              const isParticipant = s.participants.includes(username);
              return (
                <div key={s.id} className="rounded-lg border bg-card p-3 cursor-pointer hover:bg-muted/30" onClick={() => handleOpenSession(s)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">Corredor: {s.corredor}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Users className="h-3 w-3" />{s.participants.join(', ')}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1"><Clock className="h-3 w-3" />{remainingLabel(s.started_at)} · {s.total_items || 0} item(ns)</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={isParticipant ? 'default' : 'secondary'} className="text-[10px]">
                        {isParticipant ? 'Abrir' : 'Participar'}
                      </Badge>
                      {isAdmin && !isParticipant && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleOpenSession(s, true); }}
                          className="inline-flex items-center gap-1 rounded-full bg-white border border-red-500/40 px-2 py-0.5 text-[10px] font-medium text-red-600 shadow-sm hover:bg-red-50"
                          title="Visualizar sem participar (admin)"
                        >
                          <Eye className="h-3 w-3" /> Espiar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* LOG */}
        {tab === 'log' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">Sem histórico.</div>
            ) : logs.map((s) => {
              const isOpen = expandedLog === s.id;
              const its = logItems[s.id] || [];
              return (
              <div key={s.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">Corredor: {s.corredor}</p>
                  <Badge variant={s.status === 'expired' ? 'destructive' : 'outline'} className="text-[10px]">{s.status === 'expired' ? 'Expirado (6h)' : 'Finalizado'}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Users className="h-3 w-3" />{s.participants.join(', ')}</p>
                <div className="flex gap-3 mt-1 text-xs">
                  <span>Total: <span className="font-semibold">{s.total_items || 0}</span></span>
                  <span className="text-destructive">Vencidos: <span className="font-semibold">{s.total_vencidos || 0}</span></span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(s.started_at).toLocaleString('pt-BR')} → {s.ended_at ? new Date(s.ended_at).toLocaleString('pt-BR') : '—'}
                </p>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => toggleLog(s)}>
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isOpen ? 'Ocultar' : 'Ver itens'}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1 bg-white text-black hover:bg-white/90" onClick={() => openList(s)}>
                      <ListIcon className="h-3.5 w-3.5" /> Lista
                    </Button>
                    {isOpen && its.length > 0 && (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => downloadPdf(s, its)}>
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-2 border-t pt-2">
                    {loadingLogItems === s.id ? (
                      <div className="flex items-center justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
                    ) : its.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">Sem itens.</p>
                    ) : (
                      <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                        <div className="grid grid-cols-[1fr_2fr_80px] gap-2 text-[10px] font-semibold text-muted-foreground px-2">
                          <span>Código</span><span>Descrição</span><span className="text-right">Validade</span>
                        </div>
                        {its.map((it) => {
                          const exp = new Date(it.validade).getTime() < Date.now();
                          return (
                            <div key={it.id} className="grid grid-cols-[1fr_2fr_80px] gap-2 items-center text-[11px] rounded-md border bg-muted/20 px-2 py-1">
                              <span className="font-mono truncate">{it.codigo}</span>
                              <span className="truncate flex items-center gap-1">{exp && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}{it.descricao}</span>
                              <span className="text-right">{new Date(it.validade).toLocaleDateString('pt-BR')}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* SESSION */}
        {tab === 'session' && activeSession && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-2 text-xs flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /><b>Responsaveis:</b> {activeSession.participants.join(', ')}</span>
              <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /><b>Data:</b> {new Date(activeSession.started_at).toLocaleDateString('pt-BR')}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{remainingLabel(activeSession.started_at)}</span>
            </div>

            {/* Search */}
            <div className="flex gap-2">
              {searchStatus !== 'found' && (
                <BarcodeScanner onDetected={(c) => { if (finalizing || sessionEnded) return; setCode(c); setSearchStatus('idle'); setProduct(null); setTimeout(() => searchProduct(c), 100); }} />
              )}
              <Input
                value={code}
                onChange={(e) => { if (searchStatus === 'found') return; setCode(e.target.value.replace(/\D/g,'')); if (searchStatus !== 'idle') { setSearchStatus('idle'); setProduct(null); } }}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.trim() && !finalizing && !sessionEnded) searchProduct(code.trim()); }}
                placeholder="Código do produto"
                inputMode="numeric"
                disabled={searchStatus === 'found' || searchStatus === 'loading' || finalizing || sessionEnded}
              />
              <Button onClick={() => searchProduct(code.trim())} disabled={!code.trim() || searchStatus === 'loading' || searchStatus === 'found' || finalizing || sessionEnded} className="gap-1">
                {searchStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
              </Button>
            </div>

            {sessionEnded && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4" /> Arrastão finalizado. Ações desabilitadas.
              </div>
            )}

            {searchStatus === 'not_found' && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground"><PackageX className="h-4 w-4" />Produto não encontrado.</div>
            )}
            {searchStatus === 'error' && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"><AlertCircle className="h-4 w-4" />{errorMsg}</div>
            )}
            {searchStatus === 'found' && product && (
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingBasket className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{product.descricao}</span>
                </div>
                <p className="text-[11px] font-mono text-muted-foreground mb-2">EAN: {product.ean}</p>
                <div className="flex flex-wrap gap-2">
                  <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="max-w-[180px]" disabled={finalizing || sessionEnded} />
                  <Input type="number" min="0" value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g,''))} placeholder="Qtd" className="max-w-[80px]" inputMode="numeric" disabled={finalizing || sessionEnded} />
                  <Button onClick={handleAddItem} disabled={submitting || !validade || finalizing || sessionEnded} className="gap-1">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Coletar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setCode(''); setProduct(null); setSearchStatus('idle'); setValidade(''); setQuantidade(''); }}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Items list */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Coletados ({items.length})</p>
              {items.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-4 text-center text-xs text-muted-foreground">Nenhum item coletado ainda.</div>
              ) : (
                <div className="space-y-1 max-h-[35vh] overflow-y-auto">
                  {items.map((it) => {
                    const isExpired = new Date(it.validade).getTime() < Date.now();
                    return (
                    <div key={it.id} className="rounded-md border bg-card px-2 py-1.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate flex items-center gap-1">
                          {isExpired && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" aria-label="Produto vencido" />}
                          {it.descricao}
                        </p>
                        <p className="text-[10px] text-muted-foreground">EAN {it.ean} · Qtd {it.quantidade} · Val {new Date(it.validade).toLocaleDateString('pt-BR')} · {it.scanned_by}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveItem(it.id)} disabled={finalizing || sessionEnded}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t">
              {activeSession.started_by === username || isAdmin ? (
                <Button onClick={handleFinalize} disabled={finalizing || sessionEnded} className="gap-2">
                  {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Finalizar Arrastão
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground italic">Apenas {activeSession.started_by} (criador) ou um admin pode finalizar.</p>
              )}
            </div>
          </div>
        )}

        {/* Modal: novo arrastão */}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Novo Arrastão</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Corredor</label>
                <Input value={newCorredor} onChange={(e) => setNewCorredor(e.target.value)} placeholder="Ex: 03 - Mercearia" className="mt-1" autoFocus />
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p><b>Pessoas:</b> {username} (você)</p>
                <p><b>Data:</b> {new Date().toLocaleDateString('pt-BR')}</p>
                <p className="text-[11px]">Limite automático: 6h.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={handleStart} disabled={starting || !newCorredor.trim()}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Iniciar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>

      {/* Dialog Lista de produtos coletados */}
      <Dialog open={!!listDialog} onOpenChange={(o) => { if (!o) { setListDialog(null); setListVisibleCount(LIST_PAGE_SIZE); } }}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              Produtos coletados {listDialog && `— Corredor: ${listDialog.corredor}`}
            </DialogTitle>
          </DialogHeader>
          {listDialog && (() => {
            const its = logItems[listDialog.id] || [];
            const vencidos = its.filter((i) => new Date(i.validade).getTime() < Date.now()).length;
            const visible = its.slice(0, listVisibleCount);
            const hasMore = its.length > visible.length;
            return (
              <div className="flex-1 overflow-hidden flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Total: <span className="font-semibold text-foreground">{its.length}</span></span>
                  <span className="text-destructive">Vencidos: <span className="font-semibold">{vencidos}</span></span>
                </div>
                {loadingLogItems === listDialog.id ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : its.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem itens coletados.</p>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto border rounded-md">
                      <div className="grid grid-cols-[110px_1fr_90px] gap-2 text-[11px] font-semibold text-muted-foreground px-3 py-2 border-b bg-muted/40 sticky top-0">
                        <span>Código</span><span>Descrição</span><span className="text-right">Validade</span>
                      </div>
                      <div className="divide-y">
                        {visible.map((it) => {
                          const exp = new Date(it.validade).getTime() < Date.now();
                          return (
                            <div key={it.id} className="grid grid-cols-[110px_1fr_90px] gap-2 items-center text-xs px-3 py-2">
                              <span className="font-mono truncate">{it.codigo}</span>
                              <span className="truncate flex items-center gap-1">{exp && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}{it.descricao}</span>
                              <span className="text-right">{new Date(it.validade).toLocaleDateString('pt-BR')}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted-foreground">Mostrando {visible.length} de {its.length}</span>
                      {hasMore && (
                        <Button size="sm" variant="outline" onClick={() => setListVisibleCount((n) => n + LIST_PAGE_SIZE)}>
                          Carregar mais
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default ArrastaoView;
