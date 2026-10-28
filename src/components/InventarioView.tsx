import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ScanBarcode, PackageX, AlertCircle, ShoppingBasket, Plus, Download, Trash2, ClipboardList, Pencil, Check, X, Loader2, Undo2, ArrowDownAZ, ArrowDown01, ArrowUp01, RefreshCw, Filter, CheckCircle2, Eye, PauseCircle, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import BarcodeScanner from '@/components/BarcodeScanner';

interface ProductResult {
  ean: string;
  codigo: string;
  descricao: string;
}

const InventarioView = () => {
  const { inventoryItems, addOrUpdateInventoryItem, clearAllInventory, updateInventoryItemQuantidade, removeInventoryItem, hasInventory, fetchInventory, currentLote, currentLoteNome, renameLote, viewingLote, listLotes, viewLote, exitViewLote, finalizeLote, suspendLote, resumeLote } = useData();
  const [lotesDialogOpen, setLotesDialogOpen] = useState(false);
  const [lotesList, setLotesList] = useState<any[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [finalizingLote, setFinalizingLote] = useState(false);
  const [suspendingLote, setSuspendingLote] = useState(false);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [loteNameInput, setLoteNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const isViewing = !!viewingLote;
  const readOnly = isViewing;

  const openLotesDialog = async () => {
    setLotesDialogOpen(true);
    setLoadingLotes(true);
    const list = await listLotes();
    setLotesList(list);
    setLoadingLotes(false);
  };

  const handleSelectLote = async (l: any) => {
    setLotesDialogOpen(false);
    if (l.status === 'suspenso') {
      const res = await resumeLote(l.numero);
      if (!res.ok) { toast.error(res.error || 'Erro ao retomar lote'); return; }
      toast.success(`Lote #${String(l.numero).padStart(3, '0')} retomado para edição`);
    } else {
      await viewLote(l.numero);
      toast.success(`Visualizando lote #${String(l.numero).padStart(3, '0')}`);
    }
  };

  const handleFinalize = async () => {
    if (finalizingLote) return;
    setFinalizingLote(true);
    const res = await finalizeLote();
    setFinalizingLote(false);
    setFinalizeDialogOpen(false);
    if (!res.ok) { toast.error(res.error || 'Erro ao finalizar'); return; }
    toast.success('Lote finalizado. Novo lote iniciado.');
  };

  const handleSuspend = async () => {
    if (suspendingLote) return;
    setSuspendingLote(true);
    const res = await suspendLote();
    setSuspendingLote(false);
    setFinalizeDialogOpen(false);
    if (!res.ok) { toast.error(res.error || 'Erro ao suspender'); return; }
    toast.success('Lote suspenso. Disponível para editar depois.');
  };

  // Ask for a name as soon as the first item of a new lote is counted
  useEffect(() => {
    if (isViewing) return;
    if (inventoryItems.length > 0 && currentLote != null && !currentLoteNome) {
      setLoteNameInput('');
      setNameDialogOpen(true);
    }
  }, [inventoryItems.length, currentLote, currentLoteNome, isViewing]);

  const handleSaveLoteName = async () => {
    const nome = loteNameInput.trim().toUpperCase();
    if (!nome) { toast.error('Informe um nome para o lote'); return; }
    setSavingName(true);
    const res = await renameLote(nome);
    setSavingName(false);
    if (!res.ok) { toast.error(res.error || 'Erro ao nomear lote'); return; }
    setNameDialogOpen(false);
    toast.success(`Lote nomeado: ${nome}`);
  };

  const { isAdmin, user, getToken } = useAuth();
  const [code, setCode] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [product, setProduct] = useState<ProductResult | null>(null);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'not_found' | 'error' | 'found'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastCounted, setLastCounted] = useState<{ descricao: string; codigo: string; quantidade: number } | null>(null);
  const [autoCount, setAutoCount] = useState(false);
  const autoCountRef = useRef(false);
  autoCountRef.current = autoCount;

  const [editingCodigo, setEditingCodigo] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removingCodigo, setRemovingCodigo] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'default' | 'alpha' | 'qty-asc' | 'qty-desc'>('alpha');

  // Undo system
  type UndoAction =
    | { type: 'add'; codigo: string; prevQuantidade: number | null }
    | { type: 'update'; codigo: string; prevQuantidade: number }
    | { type: 'remove'; item: { ean: string; codigo: string; descricao: string; quantidade: number } }
    | { type: 'clear'; items: { ean: string; codigo: string; descricao: string; quantidade: number }[] };

  const lastActionRef = useRef<UndoAction | null>(null);
  const undoingRef = useRef(false);

  const showUndoToast = useCallback((message: string) => {
    toast(message, {
      action: {
        label: 'Desfazer',
        onClick: () => handleUndo(),
      },
      duration: 10000,
    });
  }, []);

  const handleUndo = async () => {
    const action = lastActionRef.current;
    if (!action || undoingRef.current) return;
    undoingRef.current = true;
    lastActionRef.current = null;
    try {
      switch (action.type) {
        case 'add':
          if (action.prevQuantidade === null) {
            await removeInventoryItem(action.codigo);
          } else {
            await updateInventoryItemQuantidade(action.codigo, action.prevQuantidade);
          }
          break;
        case 'update':
          await updateInventoryItemQuantidade(action.codigo, action.prevQuantidade);
          break;
        case 'remove':
          await addOrUpdateInventoryItem(
            { ean: action.item.ean, codigo: action.item.codigo, descricao: action.item.descricao },
            action.item.quantidade,
            user?.username
          );
          break;
        case 'clear':
          for (const item of action.items) {
            await addOrUpdateInventoryItem(
              { ean: item.ean, codigo: item.codigo, descricao: item.descricao },
              item.quantidade,
              user?.username
            );
          }
          break;
      }
      toast.success('Ação desfeita com sucesso');
    } catch {
      toast.error('Erro ao desfazer ação');
    }
    undoingRef.current = false;
  };

  const queryProduct = async (codigo: string) => {
    const token = getToken();
    const { data, error } = await supabase.functions.invoke('query-product', {
      body: { codigo },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    return { data, error };
  };

  const handleSearch = async () => {
    if (!code.trim()) return;
    setSearchStatus('loading');
    setProduct(null);
    setErrorMsg('');
    try {
      const { data, error } = await queryProduct(code.trim());
      if (error) { setSearchStatus('error'); setErrorMsg('Erro ao conectar ao banco de dados.'); return; }
      if (data.error) { setSearchStatus('error'); setErrorMsg(data.error); return; }
      if (!data.found) { setSearchStatus('not_found'); return; }
      if (autoCountRef.current) { await autoContar(data.product); return; }
      setProduct(data.product);
      setSearchStatus('found');
    } catch {
      setSearchStatus('error');
      setErrorMsg('Erro ao conectar ao banco de dados.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const autoContar = async (prod: ProductResult) => {
    const existing = inventoryItems.find(i => i.codigo === prod.codigo);
    lastActionRef.current = { type: 'add', codigo: prod.codigo, prevQuantidade: existing ? existing.quantidade : null };
    await addOrUpdateInventoryItem({ ean: prod.ean, codigo: prod.codigo, descricao: prod.descricao }, 1, user?.username);
    setLastCounted({ descricao: prod.descricao, codigo: prod.codigo, quantidade: 1 });
    setCode(''); setQuantidade(''); setProduct(null); setSearchStatus('idle');
    showUndoToast(existing ? '+1 adicionado' : 'Item adicionado (+1)');
  };

  const handleContar = async () => {
    if (!product || quantidade.trim() === '' || submitting) return;
    const qty = Number(quantidade);
    if (qty < 0) return;
    setSubmitting(true);
    const existing = inventoryItems.find(i => i.codigo === product.codigo);
    lastActionRef.current = { type: 'add', codigo: product.codigo, prevQuantidade: existing ? existing.quantidade : null };
    await addOrUpdateInventoryItem({ ean: product.ean, codigo: product.codigo, descricao: product.descricao }, qty, user?.username);
    setLastCounted({ descricao: product.descricao, codigo: product.codigo, quantidade: qty });
    setCode(''); setQuantidade(''); setProduct(null); setSearchStatus('idle');
    showUndoToast(existing ? 'Quantidade atualizada' : 'Item adicionado ao inventário');
    setSubmitting(false);
  };

  const handleExport = () => {
    if (!hasInventory || !isAdmin) return;
    const doc = new jsPDF();
    
    doc.setFillColor(34, 120, 60);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Estoque Pro', 14, 16);
    doc.setFontSize(10);
    doc.text('Relatório de Inventário', 14, 24);
    const now = new Date();
    doc.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`, 14, 31);
    
    autoTable(doc, {
      startY: 43,
      head: [['EAN', 'Código', 'Descrição', 'Quantidade']],
      body: inventoryItems.map((i) => [i.ean, i.codigo, i.descricao, String(i.quantidade)]),
      headStyles: { fillColor: [34, 120, 60], textColor: 255, fontStyle: 'bold', lineWidth: 0.2, lineColor: [180, 180, 180] },
      bodyStyles: { lineWidth: 0.2, lineColor: [180, 180, 180] },
      alternateRowStyles: { fillColor: [245, 250, 245] },
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [180, 180, 180] },
      tableLineWidth: 0.2,
      tableLineColor: [180, 180, 180],
      columnStyles: {
        0: { cellWidth: 40, font: 'courier' },
        1: { cellWidth: 30, font: 'courier' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      },
    });
    
    const totalItems = inventoryItems.reduce((sum, i) => sum + i.quantidade, 0);
    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.text(`Total de produtos: ${inventoryItems.length}  |  Total de itens: ${totalItems}`, 14, finalY + 10);
    
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Estoque Pro - Sistema de Inventário', 14, pageHeight - 10);
    doc.text(`Página 1`, 196, pageHeight - 10, { align: 'right' });
    
    doc.save('inventario.pdf');
  };

  const searchProduct = async (scannedCode: string) => {
    setSearchStatus('loading');
    try {
      const { data, error } = await queryProduct(scannedCode);
      if (error || data.error) { setSearchStatus('error'); setErrorMsg(data?.error || 'Erro ao conectar.'); return; }
      if (!data.found) { setSearchStatus('not_found'); return; }
      if (autoCountRef.current) { await autoContar(data.product); return; }
      setProduct(data.product);
      setSearchStatus('found');
    } catch {
      setSearchStatus('error');
      setErrorMsg('Erro ao conectar ao banco de dados.');
    }
  };

  const startEdit = (item: { codigo: string; quantidade: number }) => {
    if (!isAdmin || isViewing) return;
    setEditingCodigo(item.codigo);
    setEditValue(String(item.quantidade));
  };

  const confirmEdit = async () => {
    if (!editingCodigo || !isAdmin) return;
    const val = Number(editValue);
    if (val <= 0) {
      setShowRemoveConfirm(true);
      return;
    }
    const existing = inventoryItems.find(i => i.codigo === editingCodigo);
    lastActionRef.current = { type: 'update', codigo: editingCodigo, prevQuantidade: existing?.quantidade || 0 };
    await updateInventoryItemQuantidade(editingCodigo, val);
    setEditingCodigo(null);
    setEditValue('');
    showUndoToast('Quantidade editada');
  };

  const handleConfirmRemove = async () => {
    const codigoToRemove = removingCodigo || editingCodigo;
    if (!codigoToRemove) return;
    const existing = inventoryItems.find(i => i.codigo === codigoToRemove);
    if (existing) {
      lastActionRef.current = { type: 'remove', item: { ean: existing.ean, codigo: existing.codigo, descricao: existing.descricao, quantidade: existing.quantidade } };
    }
    await removeInventoryItem(codigoToRemove);
    setShowRemoveConfirm(false);
    setRemovingCodigo(null);
    setEditingCodigo(null);
    setEditValue('');
    showUndoToast('Item removido');
  };

  const startRemoveItem = (codigo: string) => {
    setRemovingCodigo(codigo);
    setShowRemoveConfirm(true);
  };

  const cancelEdit = () => {
    setEditingCodigo(null);
    setEditValue('');
  };

  const sortedItems = [...inventoryItems].sort((a, b) => {
    switch (sortOrder) {
      case 'alpha': return a.descricao.localeCompare(b.descricao, 'pt-BR');
      case 'qty-asc': return a.quantidade - b.quantidade;
      case 'qty-desc': return b.quantidade - a.quantidade;
      default: return 0;
    }
  });

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] px-3 sm:px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-2 pb-3 backdrop-blur-md bg-black/40 border-b border-white/10">
        <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Inventário
            <span className="ml-2 text-sm font-normal text-white/70">
              ({inventoryItems.length} {inventoryItems.length === 1 ? 'item' : 'itens'}
              {isViewing
                ? ` — Lote #${String(viewingLote!.numero).padStart(3, '0')}${viewingLote!.nome ? ` ${viewingLote!.nome.toUpperCase()}` : ''} (finalizado)`
                : currentLote != null
                  ? ` — Lote #${String(currentLote).padStart(3, '0')}${currentLoteNome ? ` ${currentLoteNome.toUpperCase()}` : ''}`
                  : ''}
              )
            </span>
          </h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              title="Sincronizar inventário"
              aria-label="Sincronizar inventário"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                await fetchInventory();
                setSyncing(false);
                toast.success('Inventário sincronizado');
              }}
            >
              <RefreshCw className={`h-4 w-4 text-white ${syncing ? 'animate-spin' : ''}`} />
            </Button>
            {hasInventory && (
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as any)}>
                <SelectTrigger className="h-8 w-[88px] px-2 text-xs">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Padrão</SelectItem>
                  <SelectItem value="alpha">A → Z</SelectItem>
                  <SelectItem value="qty-desc">Maior qtd</SelectItem>
                  <SelectItem value="qty-asc">Menor qtd</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isViewing && (
              <Button onClick={exitViewLote} variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <X className="h-3.5 w-3.5" />
                Sair da consulta
              </Button>
            )}
            {hasInventory && isAdmin && !isViewing && (
              <Button onClick={handleExport} variant="outline" size="icon" className="h-8 w-8" title="Salvar PDF" aria-label="Exportar inventário em PDF">
                <Download className="h-4 w-4" />
              </Button>
            )}
            {!isViewing && (
              <Button onClick={openLotesDialog} variant="outline" size="icon" className="h-8 w-8" title="Consultar lotes" aria-label="Consultar lotes">
                <Filter className="h-4 w-4" />
              </Button>
            )}
            {hasInventory && !isViewing && (
              <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-primary" title="Finalizar / Suspender inventário" aria-label="Finalizar ou suspender inventário" disabled={finalizingLote || suspendingLote}>
                    {(finalizingLote || suspendingLote) ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Lote #{currentLote != null ? String(currentLote).padStart(3, '0') : '---'}{currentLoteNome ? ` — ${currentLoteNome.toUpperCase()}` : ''}</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Escolha uma ação para o lote atual. Suspender mantém os itens salvos para retomar depois; Finalizar encerra e inicia um novo lote.
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <Button onClick={handleSuspend} variant="outline" className="justify-start gap-2" disabled={suspendingLote || finalizingLote}>
                      <PauseCircle className="h-4 w-4 text-amber-600" />
                      Suspender (retomar depois)
                    </Button>
                    <Button onClick={handleFinalize} className="justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90" disabled={suspendingLote || finalizingLote}>
                      <CheckCircle2 className="h-4 w-4" />
                      Finalizar inventário
                    </Button>
                    <Button onClick={() => setFinalizeDialogOpen(false)} variant="ghost">Cancelar</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {hasInventory && !isViewing && currentLote != null && (
              <Button
                onClick={() => { setLoteNameInput((currentLoteNome || '').toUpperCase()); setNameDialogOpen(true); }}
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="Nomear lote"
                aria-label="Nomear lote"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {hasInventory && isAdmin && !isViewing && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Limpar inventário" aria-label="Limpar inventário">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar inventário?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Essa ação irá remover todos os itens do lote atual. Essa operação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { lastActionRef.current = { type: 'clear', items: inventoryItems.map(i => ({ ean: i.ean, codigo: i.codigo, descricao: i.descricao, quantidade: i.quantidade })) }; clearAllInventory().then(() => showUndoToast('Inventário limpo')); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Limpar tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Search (hidden when viewing finalized lote) */}
        {!isViewing && (
        <>
        <div className="flex gap-2">
          {searchStatus !== 'found' && (
            <BarcodeScanner onDetected={(scannedCode) => { setCode(scannedCode); setSearchStatus('idle'); setProduct(null); setTimeout(() => searchProduct(scannedCode), 100); }} />
          )}
          <Input
            value={code}
            onChange={(e) => { if (searchStatus === 'found') return; setCode(e.target.value.replace(/\D/g, '')); if (searchStatus !== 'idle') { setSearchStatus('idle'); setProduct(null); } }}
            onKeyDown={handleKeyDown}
            placeholder="Código do produto"
            className="text-base sm:text-lg"
            inputMode="numeric"
            autoFocus
            disabled={searchStatus === 'found' || searchStatus === 'loading'}
          />
          <Button onClick={handleSearch} disabled={!code.trim() || searchStatus === 'loading' || searchStatus === 'found'} className="gap-1.5 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-sm sm:text-base px-3 sm:px-4">
            {searchStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
            <span className="hidden sm:inline">{searchStatus === 'loading' ? 'Buscando...' : 'Consultar'}</span>
          </Button>
        </div>
        <label className="mt-2 flex items-center gap-2 cursor-pointer select-none w-fit">
          <Checkbox checked={autoCount} onCheckedChange={(v) => setAutoCount(v === true)} className="border-white data-[state=checked]:bg-primary data-[state=checked]:border-primary bg-white/10" />
          <span className="text-xs sm:text-sm text-white">Auto +1</span>
        </label>


        {lastCounted && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-white/90 px-3 py-1.5 text-xs sm:text-sm shadow-sm">
            <span className="truncate text-gray-700">
              {lastCounted.descricao}
              <span className="ml-1 text-gray-500">(cód {lastCounted.codigo})</span>
            </span>
            <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 font-bold text-primary">{lastCounted.quantidade}</span>
          </div>
        )}
        </>
        )}
        </div>

        {/* Loading indicator */}
        {searchStatus === 'loading' && (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-border bg-card p-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Buscando produto...</span>
          </div>
        )}

        {/* Search results */}
        <div className="mt-4 sm:mt-6">
          {searchStatus === 'not_found' && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/50 p-6 sm:p-8 text-center">
              <PackageX className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Produto não encontrado no banco de dados.</p>
            </div>
          )}
          {searchStatus === 'error' && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-6 sm:p-8 text-center">
              <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-destructive" />
              <p className="text-destructive text-sm sm:text-base">{errorMsg}</p>
            </div>
          )}
          {searchStatus === 'found' && product && (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-4 sm:px-6 py-3 sm:py-4">
                <ShoppingBasket className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Produto Encontrado</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border">
                {[
                  { label: 'EAN', value: product.ean },
                  { label: 'Código', value: product.codigo },
                  { label: 'Descrição', value: product.descricao },
                ].map((item) => (
                  <div key={item.label} className="bg-card px-4 sm:px-6 py-3 sm:py-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 border-t border-border px-4 sm:px-6 py-3 sm:py-4">
                <Input
                  value={quantidade}
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                    const parts = val.split('.');
                    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                    if (parts.length === 2 && parts[1].length > 3) val = parts[0] + '.' + parts[1].slice(0, 3);
                    setQuantidade(val);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleContar(); }}
                  placeholder="Qtd"
                  className="max-w-[100px] sm:max-w-[150px]"
                  inputMode="decimal"
                />
                <Button onClick={handleContar} disabled={submitting || quantidade.trim() === '' || Number(quantidade) < 0} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Contar
                </Button>
                <Button variant="outline" onClick={() => { setCode(''); setQuantidade(''); setProduct(null); setSearchStatus('idle'); }} className="gap-2">
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Inventory list */}
        {hasInventory && (
          <div className="mt-6 sm:mt-8">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-white/70" />
              <h3 className="font-semibold text-white text-sm sm:text-base">Contagem ({inventoryItems.length})</h3>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {sortedItems.map((item, index) => (
                <div key={item.codigo} className={`rounded-lg border border-white/20 p-3 bg-white`}>
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm truncate">{item.descricao}</p>
                      <p className="text-xs text-gray-500 mt-0.5">EAN: {item.ean} · Cód: {item.codigo}</p>
                    </div>
                    {isAdmin && editingCodigo === item.codigo ? (
                      <div className="flex items-center gap-1 ml-2">
                        <Input
                          value={editValue}
                          onChange={(e) => { let val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'); const parts = val.split('.'); if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join(''); if (parts.length === 2 && parts[1].length > 3) val = parts[0] + '.' + parts[1].slice(0, 3); setEditValue(val); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          className="w-16 h-8 text-center text-sm"
                          inputMode="numeric"
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={confirmEdit} aria-label="Confirmar edição da quantidade"><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={cancelEdit} aria-label="Cancelar edição da quantidade"><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 ml-2">
                        <span className="text-lg font-bold text-gray-900">{item.quantidade}</span>
                        {isAdmin && !isViewing && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => startEdit(item)} aria-label={`Editar quantidade de ${item.descricao}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => startRemoveItem(item.codigo)} aria-label={`Remover ${item.descricao} do inventário`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block rounded-xl border border-border overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-white bg-black/60">EAN</TableHead>
                    <TableHead className="text-white bg-black/60">Código</TableHead>
                    <TableHead className="text-white bg-black/60">Descrição</TableHead>
                     <TableHead className="text-right text-white bg-black/60">Quantidade</TableHead>
                     {isAdmin && !isViewing && <TableHead className="w-20 bg-black/60" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((item, index) => (
                    <TableRow key={item.codigo} className={`${index % 2 !== 0 ? 'bg-gray-50' : 'bg-white'} text-gray-900`}>
                      <TableCell className="font-mono text-sm">{item.ean}</TableCell>
                      <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {isAdmin && editingCodigo === item.codigo ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              value={editValue}
                              onChange={(e) => { let val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'); const parts = val.split('.'); if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join(''); if (parts.length === 2 && parts[1].length > 3) val = parts[0] + '.' + parts[1].slice(0, 3); setEditValue(val); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                              className="w-20 h-8 text-center text-sm"
                              inputMode="numeric"
                              autoFocus
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={confirmEdit} aria-label="Confirmar edição da quantidade"><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={cancelEdit} aria-label="Cancelar edição da quantidade"><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          item.quantidade
                        )}
                      </TableCell>
                       {isAdmin && !isViewing && (
                         <TableCell>
                           <div className="flex items-center gap-1">
                             {editingCodigo !== item.codigo && (
                               <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => startEdit(item)} aria-label={`Editar quantidade de ${item.descricao}`}>
                                 <Pencil className="h-4 w-4" />
                               </Button>
                             )}
                             {editingCodigo !== item.codigo && (
                               <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => startRemoveItem(item.codigo)} aria-label={`Remover ${item.descricao} do inventário`}>
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                             )}
                           </div>
                         </TableCell>
                       )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingCodigo
                ? 'Este item será removido do inventário. Essa operação não pode ser desfeita.'
                : 'A quantidade informada é zero. O item será removido do inventário. Deseja continuar?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setRemovingCodigo(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={nameDialogOpen} onOpenChange={(o) => { if (!savingName) setNameDialogOpen(o); }}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nome do lote #{currentLote != null ? String(currentLote).padStart(3, '0') : '---'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Defina um nome para identificar esta contagem.</p>
          <Input
            value={loteNameInput}
            onChange={(e) => setLoteNameInput(e.target.value.toUpperCase().slice(0, 60))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLoteName(); }}
            placeholder="EX.: CORREDOR 5 - MERCEARIA"
            autoFocus
          />
          <div className="mt-2 flex justify-end">
            <Button onClick={handleSaveLoteName} disabled={savingName} className="gap-2">
              {savingName && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar nome
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={lotesDialogOpen} onOpenChange={setLotesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Consultar lotes</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {loadingLotes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : lotesList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lote disponível.</p>
            ) : (
              <ul className="divide-y">
                {lotesList.map((l) => {
                  const suspenso = l.status === 'suspenso';
                  return (
                    <li key={l.numero}>
                      <button
                        onClick={() => handleSelectLote(l)}
                        className="w-full text-left py-3 px-2 hover:bg-muted flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold flex items-center gap-1.5">
                            Lote #{String(l.numero).padStart(3, '0')}{l.nome ? ` — ${l.nome.toUpperCase()}` : ''}
                            {suspenso && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {suspenso ? 'Suspenso · ' : ''}
                            {l.finalized_at ? new Date(l.finalized_at).toLocaleString('pt-BR') : (l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '—')}
                            {l.created_by ? ` · por ${l.created_by}` : ''}
                          </p>
                        </div>
                        {suspenso ? <Pencil className="h-4 w-4 text-amber-600 shrink-0" /> : <Eye className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventarioView;
