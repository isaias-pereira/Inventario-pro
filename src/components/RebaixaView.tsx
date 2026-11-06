/**
 * Tela da Rebaixa.
 *
 * O encarregado monta a lista de produtos vencendo, perdendo qualidade ou em
 * excesso, ajusta o preço final e envia a planilha ao comercial. Regras:
 * - UN usa data de vencimento; KG usa motivo (Excesso/Qualidade/Excesso-qualidade);
 * - o preço sugerido é 50% do PMZ (piso de R$ 0,99) e pode ser ajustado;
 * - a margem é calculada sobre o preço sugerido;
 * - o rascunho é salvo no servidor e o histórico guarda cada lote enviado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight,
  Copy, Download, FileSpreadsheet, History, Loader2, Lock, Mail, Package, Pencil,
  Plus, RefreshCw, Scale, Search, Share2, Star, Tag, Trash2, X,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { invokeFunction } from '@/lib/api';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import BarcodeScanner from '@/components/BarcodeScanner';

import {
  addRebaixaItems,
  clearRebaixa,
  fetchRebaixaBatchItems,
  fetchRebaixaHistory,
  fetchRebaixaList,
  formatDateTime,
  formatMargin,
  formatMoney,
  formatMoneyInput,
  formatQuantity,
  markRebaixaSent,
  marginPercent,
  motivoFromValidade,
  MOTIVOS_REBAIXA,
  parseDecimalInput,
  rebaixaCustoMap,
  rebaixaTipoMap,
  removeRebaixaItem,
  toDateInput,
  toSpreadsheetItems,
  tipoFromMotivo,
  updateRebaixaItem,
  type MotivoRebaixa,
  type RebaixaHistoryBatch,
  type RebaixaItem,
  type RebaixaTipo,
} from '@/lib/rebaixa';
import {
  createValidadeOds,
  isWeightProduct,
  saveValidadeOds,
  shareValidadeOds,
  spreadSheetFileName,
  suggestedPrice,
  type ShareOutcome,
} from '@/lib/validade-spreadsheet';
import { createValidadeCsv, csvFileName, CSV_MIME, saveValidadeCsv } from '@/lib/validade-csv';
import { browserBlocksFileShare, fileFromBytes, shareFileWithSystem } from '@/lib/system-share';
import { fetchEmailConfig, sendRebaixaEmail, type EmailConfig } from '@/lib/validade-email';
import { activeEmails, applyTemplate, defaultEmail, fetchEmails, type EmailPadrao } from '@/lib/emails';
import { daysUntil } from '@/lib/validade-notifications';
import { trackEvent } from '@/lib/analytics';

type ListFilter = 'todos' | 'UN' | 'KG';
type ValidadePeriod = '7dias' | '30dias' | 'todos';

interface ProductResult {
  ean: string;
  codigo: string;
  descricao: string;
  tipo?: string | null;
}

interface ValidadeSourceItem {
  id: string;
  ean: number | string;
  codigo: number | string;
  descricao: string;
  validade: string;
  quantidade: number;
  motivo?: string | null;
}

const PERIOD_LABELS: Record<ValidadePeriod, string> = {
  '7dias': '7 dias',
  '30dias': '30 dias',
  todos: 'Todos',
};

const MOTIVO_BADGE: Record<string, string> = {
  Excesso: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  Qualidade: 'border-orange-200 bg-orange-50 text-orange-700',
  'Excesso/qualidade': 'border-rose-200 bg-rose-50 text-rose-700',
};

/** Data local no formato do input `type="date"` para ISO. */
function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Separa a lista de destinatários por vírgula/ponto e vírgula. */
function splitEmailList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Junta destinatários sem repetir (comparação sem diferenciar maiúsculas). */
function mergeEmails(...lists: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const email of splitEmailList(list)) {
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(email);
    }
  }
  return result;
}

/** Resumo visual da validade de um item UN. */
function validadeBadge(validade: string | null) {
  if (!validade) return { label: 'Sem validade', className: 'border-slate-200 bg-slate-100 text-slate-600' };
  const days = daysUntil(validade);
  if (days < 0) return { label: 'Vencido', className: 'border-red-200 bg-red-50 text-red-700' };
  if (days === 0) return { label: 'Vence hoje', className: 'border-red-200 bg-red-50 text-red-700' };
  if (days <= 7) return { label: `Vence em ${days} dia(s)`, className: 'border-amber-200 bg-amber-50 text-amber-700' };
  return { label: `${days} dias`, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
}

const RebaixaView = () => {
  const { userRole } = useAuth();
  const { findByCode } = useData();

  const canSendEmail = userRole === 'admin' || userRole === 'encarregado';

  const [items, setItems] = useState<RebaixaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ListFilter>('todos');

  // ── Adicionar produto ──────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [addProduct, setAddProduct] = useState<ProductResult | null>(null);
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'not_found' | 'error' | 'found'>('idle');
  const [addError, setAddError] = useState('');
  const [addQuantidade, setAddQuantidade] = useState('');
  const [addValidade, setAddValidade] = useState('');
  const [addMotivo, setAddMotivo] = useState<MotivoRebaixa | ''>('');
  const [addPmz, setAddPmz] = useState<number | null>(null);
  const [addSugerido, setAddSugerido] = useState('');
  const [addFinal, setAddFinal] = useState('');
  const [addFinalTouched, setAddFinalTouched] = useState(false);
  const [addStock, setAddStock] = useState<number | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);

  // ── Buscar na validade ─────────────────────────────────────────────
  const [showValidade, setShowValidade] = useState(false);
  const [validadeItems, setValidadeItems] = useState<ValidadeSourceItem[]>([]);
  const [validadeLoading, setValidadeLoading] = useState(false);
  const [validadeError, setValidadeError] = useState('');
  const [validadePeriod, setValidadePeriod] = useState<ValidadePeriod>('7dias');
  const [validadeSearch, setValidadeSearch] = useState('');
  const [selectedValidade, setSelectedValidade] = useState<Record<string, boolean>>({});
  const [validadeSubmitting, setValidadeSubmitting] = useState(false);

  // ── Editar item ────────────────────────────────────────────────────
  const [editing, setEditing] = useState<RebaixaItem | null>(null);
  const [editQuantidade, setEditQuantidade] = useState('');
  const [editValidade, setEditValidade] = useState('');
  const [editMotivo, setEditMotivo] = useState<MotivoRebaixa | ''>('');
  const [editSugerido, setEditSugerido] = useState('');
  const [editFinal, setEditFinal] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ── Exportação / e-mail ────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  // Texto ainda não confirmado no campo "Para" (vira chip ao pressionar Enter).
  const [emailInput, setEmailInput] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailText, setEmailText] = useState('');
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  // E-mails padrão cadastrados na aba E-mail (atalhos do envio).
  const [emailsPadrao, setEmailsPadrao] = useState<EmailPadrao[]>([]);
  const [emailsLoaded, setEmailsLoaded] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState<{ assunto: string; mensagem: string } | null>(null);
  // O usuário já editou assunto/mensagem: o padrão não pode sobrescrever.
  const [emailTouched, setEmailTouched] = useState(false);
  const emailPrefilledRef = useRef(false);

  // ── Histórico ──────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<RebaixaHistoryBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBatch, setHistoryBatch] = useState<RebaixaHistoryBatch | null>(null);
  const [historyItems, setHistoryItems] = useState<RebaixaItem[]>([]);
  const [historyItemsLoading, setHistoryItemsLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const list = await fetchRebaixaList();
      setItems(list);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar a rebaixa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const filteredItems = useMemo(
    () => (filter === 'todos' ? items : items.filter((item) => item.tipo === filter)),
    [items, filter],
  );

  const summary = useMemo(() => {
    let un = 0;
    let kg = 0;
    let total = 0;
    for (const item of items) {
      if (item.tipo === 'KG') kg += item.quantidade;
      else un += item.quantidade;
      // O resumo reflete o custo real do catálogo (PMZ), não o preço de venda.
      total += item.quantidade * (item.pmz ?? 0);
    }
    return { un, kg, total, count: items.length };
  }, [items]);

  const draftValidadeIds = useMemo(
    () => new Set(items.map((item) => item.validade_id).filter((id): id is string => Boolean(id))),
    [items],
  );

  // ── Adicionar produto ──────────────────────────────────────────────

  const resetAddForm = useCallback(() => {
    setAddCode('');
    setAddProduct(null);
    setAddStatus('idle');
    setAddError('');
    setAddQuantidade('');
    setAddValidade('');
    setAddMotivo('');
    setAddPmz(null);
    setAddSugerido('');
    setAddFinal('');
    setAddFinalTouched(false);
    setAddStock(null);
  }, []);

  const openAdd = () => {
    resetAddForm();
    setShowAdd(true);
  };

  const searchProduct = useCallback(async (value: string) => {
    const codigo = value.trim();
    if (!codigo) return;

    setAddStatus('loading');
    setAddProduct(null);
    setAddError('');
    setAddPmz(null);
    setAddSugerido('');
    setAddFinal('');
    setAddFinalTouched(false);
    setAddStock(null);

    try {
      const { data, error } = await invokeFunction('query-product', { body: { codigo } });
      if (error) {
        setAddStatus('error');
        setAddError(error.message || 'Erro ao conectar.');
        return;
      }
      if (data?.error) {
        setAddStatus('error');
        setAddError(String(data.error));
        return;
      }
      if (!data?.found || !data.product) {
        setAddStatus('not_found');
        return;
      }

      const product = data.product as ProductResult;
      setAddProduct(product);
      setAddStatus('found');

      // Estoque da consulta (quando o produto está na planilha de consulta).
      const consulta = findByCode(String(product.codigo));
      setAddStock(consulta ? consulta.estoque : null);

      // PMZ vem do catálogo; a sugestão padrão é 50% do custo (piso R$ 0,99).
      try {
        const { data: costsData } = await invokeFunction<{ costs?: Record<string, number> }>(
          'query-product',
          { body: { action: 'costs', codigos: [String(product.codigo)] } },
        );
        const cost = Number(costsData?.costs?.[String(product.codigo)]);
        if (Number.isFinite(cost) && cost > 0) {
          const suggested = Math.round(suggestedPrice(cost) * 100) / 100;
          setAddPmz(cost);
          setAddSugerido(formatMoneyInput(suggested));
          setAddFinal(formatMoneyInput(suggested));
        }
      } catch {
        /* sem custo: o usuário informa o preço manualmente */
      }
    } catch {
      setAddStatus('error');
      setAddError('Erro ao conectar ao banco de dados.');
    }
  }, [findByCode]);

  const addTipo: RebaixaTipo = addProduct && isWeightProduct(addProduct.tipo) ? 'KG' : 'UN';

  const addSuggestedValue = parseDecimalInput(addSugerido);
  const addFinalValue = parseDecimalInput(addFinal);
  const addMargin = marginPercent(addPmz, addSuggestedValue);

  const handleAddSuggested = (value: string) => {
    setAddSugerido(value);
    if (!addFinalTouched) setAddFinal(value);
  };

  const handleAddFinal = (value: string) => {
    setAddFinal(value);
    setAddFinalTouched(true);
  };

  const handlePullStock = () => {
    if (addStock === null) {
      toast.error('Estoque não encontrado na consulta');
      return;
    }
    setAddQuantidade(formatQuantity(addStock, addTipo));
  };

  const handleAdd = async () => {
    if (!addProduct || addSubmitting) return;

    const quantidade = parseDecimalInput(addQuantidade);
    if (quantidade === null || quantidade <= 0) {
      toast.error('Informe uma quantidade maior que zero');
      return;
    }
    if (addTipo === 'KG' && !addMotivo) {
      toast.error('Escolha o motivo da rebaixa');
      return;
    }
    const validadeIso = addTipo === 'UN' ? dateInputToIso(addValidade) : null;
    if (addTipo === 'UN' && !validadeIso) {
      toast.error('Informe a data de vencimento');
      return;
    }

    setAddSubmitting(true);
    try {
      const result = await addRebaixaItems([{
        ean: String(addProduct.ean),
        codigo: String(addProduct.codigo),
        descricao: addProduct.descricao,
        tipo: addTipo,
        quantidade,
        validade: validadeIso,
        motivo: addTipo === 'KG' ? addMotivo || null : null,
        pmz: addPmz,
        preco_sugerido: addSuggestedValue,
        preco_final: addFinalValue ?? addSuggestedValue,
      }]);

      if (result.added > 0) {
        toast.success('Produto adicionado à rebaixa');
        trackEvent('rebaixa_adicionar', { tipo: addTipo });
        setShowAdd(false);
        resetAddForm();
        await fetchItems();
      } else {
        toast.info('Este produto já está na rebaixa');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar produto');
    } finally {
      setAddSubmitting(false);
    }
  };

  // ── Buscar na validade ─────────────────────────────────────────────

  const loadValidade = useCallback(async () => {
    setValidadeLoading(true);
    setValidadeError('');
    try {
      const { data, error } = await invokeFunction<{ items?: ValidadeSourceItem[] }>(
        'manage-validade',
        { body: { action: 'list_all' } },
      );
      if (error) {
        setValidadeError(error.message || 'Erro ao carregar a validade');
        return;
      }
      setValidadeItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setValidadeError('Erro ao carregar a validade');
    } finally {
      setValidadeLoading(false);
    }
  }, []);

  const openValidade = () => {
    setShowValidade(true);
    setSelectedValidade({});
    setValidadeSearch('');
    setValidadePeriod('7dias');
    void loadValidade();
  };

  const validadeFiltered = useMemo(() => {
    const term = validadeSearch.trim().toLowerCase();
    return validadeItems.filter((item) => {
      if (term && !item.descricao.toLowerCase().includes(term) && !String(item.ean).includes(term)) {
        return false;
      }
      if (validadePeriod === 'todos') return true;
      const limit = validadePeriod === '7dias' ? 7 : 30;
      return daysUntil(item.validade) <= limit;
    });
  }, [validadeItems, validadeSearch, validadePeriod]);

  const selectedValidadeItems = useMemo(
    () => validadeFiltered.filter((item) => selectedValidade[item.id]),
    [validadeFiltered, selectedValidade],
  );

  const selectedValidadeTotals = useMemo(() => {
    let un = 0;
    let kg = 0;
    for (const item of selectedValidadeItems) {
      if (tipoFromMotivo(item.motivo) === 'KG') kg += Number(item.quantidade) || 0;
      else un += Number(item.quantidade) || 0;
    }
    return { un, kg };
  }, [selectedValidadeItems]);

  const toggleValidade = (item: ValidadeSourceItem) => {
    if (draftValidadeIds.has(item.id)) return;
    setSelectedValidade((current) => ({ ...current, [item.id]: !current[item.id] }));
  };

  const handleAddFromValidade = async () => {
    if (validadeSubmitting) return;
    if (selectedValidadeItems.length === 0) {
      toast.error('Selecione ao menos um produto');
      return;
    }

    setValidadeSubmitting(true);
    try {
      const result = await addRebaixaItems(selectedValidadeItems.map((item) => {
        const tipo = tipoFromMotivo(item.motivo);
        return {
          ean: String(item.ean),
          codigo: String(item.codigo),
          descricao: item.descricao,
          tipo,
          quantidade: Number(item.quantidade) || 0,
          validade: tipo === 'UN' ? item.validade : null,
          motivo: tipo === 'KG' ? motivoFromValidade(item.motivo) : null,
          validade_id: item.id,
        };
      }));

      if (result.added > 0) {
        toast.success(`${result.added} produto(s) enviado(s) para a rebaixa`);
        trackEvent('rebaixa_adicionar_validade', { itens: result.added });
        setShowValidade(false);
        setSelectedValidade({});
        await fetchItems();
      } else {
        toast.info('Os produtos selecionados já estão na rebaixa');
      }
      if (result.skipped > 0 && result.added > 0) {
        toast.info(`${result.skipped} item(ns) já estavam na rebaixa`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar produtos');
    } finally {
      setValidadeSubmitting(false);
    }
  };

  // ── Editar item ────────────────────────────────────────────────────

  const openEdit = (item: RebaixaItem) => {
    setEditing(item);
    setEditQuantidade(formatQuantity(item.quantidade, item.tipo));
    setEditValidade(toDateInput(item.validade));
    setEditMotivo(motivoFromValidade(item.motivo) ?? '');
    setEditSugerido(item.preco_sugerido !== null ? formatMoneyInput(item.preco_sugerido) : '');
    setEditFinal(item.preco_final !== null ? formatMoneyInput(item.preco_final) : '');
  };

  const editSuggestedValue = parseDecimalInput(editSugerido);
  const editMargin = marginPercent(editing?.pmz ?? null, editSuggestedValue);

  const handleEdit = async () => {
    if (!editing || editSubmitting) return;

    const quantidade = parseDecimalInput(editQuantidade);
    if (quantidade === null || quantidade <= 0) {
      toast.error('Informe uma quantidade maior que zero');
      return;
    }
    const validadeIso = editing.tipo === 'UN' ? dateInputToIso(editValidade) : null;
    if (editing.tipo === 'UN' && !validadeIso) {
      toast.error('Informe a data de vencimento');
      return;
    }
    if (editing.tipo === 'KG' && !editMotivo) {
      toast.error('Escolha o motivo da rebaixa');
      return;
    }

    setEditSubmitting(true);
    try {
      await updateRebaixaItem(editing.id, {
        quantidade,
        ...(editing.tipo === 'UN'
          ? { validade: validadeIso }
          : { motivo: editMotivo || null }),
        preco_sugerido: editSuggestedValue,
        preco_final: parseDecimalInput(editFinal),
      });
      toast.success('Item atualizado');
      setEditing(null);
      await fetchItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar item');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeRebaixaItem(id);
      toast.success('Item removido da rebaixa');
      await fetchItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover item');
    }
  };

  const handleClear = async () => {
    try {
      const removed = await clearRebaixa();
      toast.success(`${removed} item(ns) removido(s) do rascunho`);
      await fetchItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao limpar a rebaixa');
    }
  };

  // ── Planilha / compartilhamento ────────────────────────────────────

  const spreadsheetItems = useMemo(() => toSpreadsheetItems(items), [items]);
  const spreadsheetTipos = useMemo(() => rebaixaTipoMap(items), [items]);
  const spreadsheetCustos = useMemo(() => rebaixaCustoMap(items), [items]);

  const buildOds = useCallback(
    () => createValidadeOds(spreadsheetItems, spreadsheetTipos, { custos: spreadsheetCustos }),
    [spreadsheetItems, spreadsheetTipos, spreadsheetCustos],
  );

  const downloadOds = () => {
    if (items.length === 0) {
      toast.error('Nenhum produto na rebaixa');
      return;
    }
    setExporting(true);
    try {
      saveValidadeOds(buildOds());
      trackEvent('exportar_planilha', { formato: 'ods', tela: 'rebaixa', itens: items.length });
      toast.success('Planilha gerada com sucesso');
      setShowExport(false);
    } catch {
      toast.error('Erro ao gerar planilha');
    } finally {
      setExporting(false);
    }
  };

  const downloadCsv = () => {
    if (items.length === 0) {
      toast.error('Nenhum produto na rebaixa');
      return;
    }
    setExporting(true);
    try {
      const csv = createValidadeCsv(spreadsheetItems, spreadsheetTipos, { custos: spreadsheetCustos });
      saveValidadeCsv(csv);
      trackEvent('exportar_planilha', { formato: 'csv', tela: 'rebaixa', itens: items.length });
      toast.success('Planilha CSV gerada com sucesso');
      setShowExport(false);
    } catch {
      toast.error('Erro ao gerar planilha');
    } finally {
      setExporting(false);
    }
  };

  const shareSpreadsheet = () => {
    if (sharing || items.length === 0) return;

    const subject = `Solicitação de rebaixa / perecíveis — ${new Date().toLocaleDateString('pt-BR')}`;
    const text = `Segue a planilha de rebaixa com ${items.length} produto(s)`;
    setSharing(true);

    const shareCsv = () => {
      try {
        const csv = createValidadeCsv(spreadsheetItems, spreadsheetTipos, { custos: spreadsheetCustos });
        const file = fileFromBytes(csv, csvFileName(), CSV_MIME);
        void shareFileWithSystem(file, { title: subject, text }).then((outcome) => {
          setSharing(false);
          if (outcome === 'shared') {
            trackEvent('compartilhar_planilha', { formato: 'csv', tela: 'rebaixa', itens: items.length });
            toast.success('Planilha compartilhada');
            setShowExport(false);
          } else if (outcome === 'cancelled') {
            // O usuário fechou a folha do celular; o diálogo continua aberto.
          } else {
            saveValidadeCsv(csv);
            toast.success('Compartilhamento indisponível: planilha baixada', { duration: 6000 });
            setShowExport(false);
          }
        });
      } catch {
        setSharing(false);
        toast.error('Erro ao gerar planilha');
      }
    };

    const finish = (outcome: ShareOutcome) => {
      setSharing(false);
      if (outcome === 'shared') {
        trackEvent('compartilhar_planilha', { formato: 'ods', tela: 'rebaixa', itens: items.length });
        toast.success('Planilha compartilhada');
        setShowExport(false);
      } else if (outcome === 'downloaded') {
        toast.success('Compartilhamento indisponível: planilha baixada', { duration: 6000 });
        setShowExport(false);
      }
      // 'cancelled': o usuário fechou a folha do celular; o diálogo continua aberto.
    };

    // O Chromium só anexa PDF, imagens, áudio, vídeo e alguns textos: o .ods é
    // recusado. Nesse caso o CSV (planilha de verdade) é compartilhado.
    if (browserBlocksFileShare('rebaixa.ods')) {
      shareCsv();
      return;
    }

    try {
      void shareValidadeOds(buildOds(), { subject, text })
        .then((outcome) => {
          if (outcome === 'blocked') {
            shareCsv();
            return;
          }
          finish(outcome);
        })
        .catch(() => {
          setSharing(false);
          toast.error('Erro ao compartilhar planilha');
        });
    } catch {
      setSharing(false);
      toast.error('Erro ao gerar planilha');
    }
  };

  // ── E-mail ─────────────────────────────────────────────────────────

  const loadEmailConfig = useCallback(async () => {
    setEmailLoading(true);
    try {
      const config = await fetchEmailConfig();
      setEmailConfig(config);
      setEmailTo((current) => current || config.defaultTo || '');
    } catch {
      setEmailConfig({ enabled: false, provider: null, defaultTo: null, copyTo: null });
    } finally {
      setEmailLoading(false);
    }
  }, []);

  /** Texto padrão da mensagem com as variáveis já trocadas. */
  const emailTemplateValues = useMemo(() => ({
    data: new Date().toLocaleDateString('pt-BR'),
    quantidade: items.length,
    produtos: items
      .map((item) => `${item.descricao} (${formatQuantity(item.quantidade, item.tipo)})`)
      .join('; '),
  }), [items]);

  /** E-mail marcado com estrela na aba E-mail: entra sempre e não pode ser removido. */
  const fixedEmail = defaultEmail(emailsPadrao)?.email ?? null;

  /**
   * Cópia fixa do servidor: quem configurou recebe uma cópia (Cc) de todas as
   * rebaixas. Fica sempre no envio e não pode ser removida.
   */
  const copyEmail = emailConfig?.copyTo ?? null;

  /** Chips visíveis no campo "Para" (o padrão fixo vem primeiro). */
  const recipients = useMemo(
    () => mergeEmails(fixedEmail, emailTo).filter(
      (email) => !copyEmail || email.toLowerCase() !== copyEmail.toLowerCase(),
    ),
    [copyEmail, fixedEmail, emailTo],
  );

  /** Carrega os e-mails padrão cadastrados na aba E-mail (atalhos do envio). */
  const loadEmailsPadrao = useCallback(async () => {
    try {
      const data = await fetchEmails();
      setEmailsPadrao(data.emails);
      setEmailDefaults(data.defaults);
      if (!emailTouched) {
        setEmailSubject(applyTemplate(data.defaults.assunto, emailTemplateValues));
        setEmailText(applyTemplate(data.defaults.mensagem, emailTemplateValues));
      }
    } catch {
      setEmailsPadrao([]);
    } finally {
      setEmailsLoaded(true);
    }
  }, [emailTemplateValues, emailTouched]);

  /**
   * Preenche o destinatário: o e-mail padrão da aba E-mail tem prioridade;
   * sem ele, usa o padrão do servidor (REBAIXA_EMAIL_TO). Espera as duas
   * respostas para não ficar com o padrão do servidor por causa da corrida.
   */
  useEffect(() => {
    if (emailPrefilledRef.current) return;
    if (!emailsLoaded || !emailConfig) return;
    const padrao = defaultEmail(emailsPadrao);
    if (padrao) {
      // O padrão aparece como chip fixo; não duplica no campo de destinatários.
      setEmailTo((current) =>
        splitEmailList(current)
          .filter((email) => email.toLowerCase() !== padrao.email.toLowerCase())
          .join(', '),
      );
      emailPrefilledRef.current = true;
    } else if (emailConfig.defaultTo) {
      setEmailTo(emailConfig.defaultTo);
      emailPrefilledRef.current = true;
    }
  }, [emailConfig, emailsPadrao, emailsLoaded]);

  const openEmail = () => {
    setEmailSubject(`Solicitação de rebaixa / perecíveis — ${new Date().toLocaleDateString('pt-BR')}`);
    setEmailText(`Segue a planilha de rebaixa com ${items.length} produto(s)`);
    setEmailTouched(false);
    setEmailsLoaded(false);
    setEmailInput('');
    emailPrefilledRef.current = false;
    setShowEmail(true);
    void loadEmailConfig();
    void loadEmailsPadrao();
  };

  /** Soma um destinatário ao campo, sem repetir e sem duplicar o padrão fixo. */
  const addRecipient = (address: string) => {
    const clean = address.trim().replace(/[,;]+$/, '');
    if (!clean) return;
    if (fixedEmail && clean.toLowerCase() === fixedEmail.toLowerCase()) return;
    // A cópia fixa entra sozinha (em Cc) no envio do servidor.
    if (copyEmail && clean.toLowerCase() === copyEmail.toLowerCase()) return;
    setEmailTo((current) => mergeEmails(current, clean).join(', '));
  };

  const removeRecipient = (address: string) => {
    setEmailTo((current) =>
      splitEmailList(current)
        .filter((email) => email.toLowerCase() !== address.toLowerCase())
        .join(', '),
    );
  };

  /** Transforma o texto digitado (ou colado) em chip. */
  const commitEmailInput = () => {
    if (!emailInput.trim()) return;
    addRecipient(emailInput);
    setEmailInput('');
  };

  /** Atalho da aba E-mail: soma ao campo; o padrão fixo já está sempre presente. */
  const pickEmail = (address: string) => addRecipient(address);

  const sendByEmail = async () => {
    if (emailSending) return;
    if (items.length === 0) {
      toast.error('Nenhum produto na rebaixa');
      return;
    }
    // O texto ainda no input também conta como destinatário, e o padrão é sempre incluído.
    // A cópia fixa vai em Cc: o servidor garante que ela receba todos os envios.
    const to = mergeEmails(fixedEmail, emailTo, emailInput).filter(
      (email) => !copyEmail || email.toLowerCase() !== copyEmail.toLowerCase(),
    );
    if (to.length === 0 && !copyEmail) {
      toast.error('Informe o destinatário do e-mail');
      return;
    }

    setEmailSending(true);
    try {
      const result = await sendRebaixaEmail({
        to: to.join(', '),
        subject: emailSubject.trim(),
        text: emailText.trim(),
        filename: spreadSheetFileName(),
        content: buildOds(),
        itens: items.length,
      });

      // O e-mail já saiu: marca os itens como enviados e guarda o lote no histórico.
      try {
        await markRebaixaSent(items.map((item) => item.id), result.to);
      } catch {
        toast.warning('E-mail enviado, mas o histórico não foi atualizado');
      }

      trackEvent('enviar_email_planilha', { formato: 'ods', tela: 'rebaixa', itens: result.itens });
      toast.success(
        result.cc
          ? `E-mail enviado para ${result.to} (cópia para ${result.cc})`
          : `E-mail enviado para ${result.to}`,
      );
      setShowEmail(false);
      setShowExport(false);
      await fetchItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar e-mail');
    } finally {
      setEmailSending(false);
    }
  };

  // ── Histórico ──────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await fetchRebaixaHistory());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar o histórico');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = () => {
    setShowHistory(true);
    setHistoryBatch(null);
    setHistoryItems([]);
    void loadHistory();
  };

  const openHistoryBatch = async (batch: RebaixaHistoryBatch) => {
    setHistoryBatch(batch);
    setHistoryItemsLoading(true);
    try {
      setHistoryItems(await fetchRebaixaBatchItems(batch.batch_id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar os itens do lote');
    } finally {
      setHistoryItemsLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  const filterCounts = useMemo(() => ({
    todos: items.length,
    UN: items.filter((item) => item.tipo === 'UN').length,
    KG: items.filter((item) => item.tipo === 'KG').length,
  }), [items]);

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] px-3 py-6 sm:min-h-[calc(100vh-4rem)] sm:px-4 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
              <Tag className="h-5 w-5 text-sky-200 sm:h-6 sm:w-6" />
              Rebaixa
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/15">
                {summary.count} {summary.count === 1 ? 'item' : 'itens'}
              </span>
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Monte a solicitação, ajuste os preços e envie ao comercial.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
              onClick={openValidade}
            >
              <CalendarClock className="h-4 w-4" />
              <span className="hidden sm:inline">Buscar na validade</span>
              <span className="sm:hidden">Validade</span>
            </Button>
            <Button
              size="sm"
              className="h-9 gap-2 bg-white text-sky-700 shadow-sm hover:bg-sky-50"
              onClick={openAdd}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Adicionar produto</span>
              <span className="sm:hidden">Adicionar</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
              onClick={openHistory}
              title="Histórico de rebaixas"
              aria-label="Histórico de rebaixas"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
              onClick={() => setShowExport(true)}
              disabled={items.length === 0}
              title="Exportar / enviar"
              aria-label="Exportar ou enviar a rebaixa"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Resumo */}
        <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
          <div className="px-3 py-3 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]">Itens</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">{summary.count}</p>
          </div>
          <div className="px-3 py-3 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]">Quantidade</p>
            <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-900 sm:text-sm">
              {summary.un} UN
              <span className="px-1 font-normal text-slate-400">·</span>
              {formatQuantity(summary.kg, 'KG')} kg
            </p>
          </div>
          <div className="px-3 py-3 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]">
              Valor da oferta <span className="font-normal normal-case tracking-normal text-slate-400">(PMZ)</span>
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600 sm:text-xl">{formatMoney(summary.total)}</p>
          </div>
        </div>

        {/* Cabeçalho da lista */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/90">Rascunho</h3>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
              salvo automaticamente
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {(['todos', 'UN', 'KG'] as ListFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  filter === option
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'border border-white/25 bg-white/5 text-white/80 hover:bg-white/10',
                )}
              >
                {option === 'todos' ? 'Todos' : option} ({filterCounts[option]})
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-white/20 bg-white p-8">
              <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
              <span className="text-sm text-slate-500">Carregando rebaixa...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/30 bg-white/95 p-8 text-center sm:p-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100">
                <Tag className="h-6 w-6 text-sky-700" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-slate-900">
                  {items.length === 0 ? 'Nenhum produto na rebaixa' : `Nenhum produto ${filter}`}
                </p>
                <p className="text-sm text-slate-500">
                  {items.length === 0
                    ? 'Adicione um produto ou busque os itens da validade para começar.'
                    : 'Troque o filtro para ver os demais itens do rascunho.'}
                </p>
              </div>
              {items.length === 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={openValidade}>
                    <CalendarClock className="h-4 w-4" />
                    Buscar na validade
                  </Button>
                  <Button size="sm" className="gap-2" onClick={openAdd}>
                    <Plus className="h-4 w-4" />
                    Adicionar produto
                  </Button>
                </div>
              )}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isKg = item.tipo === 'KG';
              const validade = validadeBadge(item.validade);
              return (
                <div
                  key={item.id}
                  className="group flex items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-4"
                    aria-label={`Editar ${item.descricao}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                          {item.descricao}
                        </p>
                        <span
                          className={cn(
                            'rounded border px-1.5 py-0 text-[10px] font-bold uppercase leading-5',
                            isKg
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600',
                          )}
                        >
                          {item.tipo}
                        </span>
                        {isKg ? (
                          item.motivo && (
                            <span className={cn('rounded border px-1.5 py-0 text-[10px] font-semibold leading-5', MOTIVO_BADGE[item.motivo] ?? 'border-slate-200 bg-slate-50 text-slate-600')}>
                              {item.motivo}
                            </span>
                          )
                        ) : (
                          <span className={cn('rounded border px-1.5 py-0 text-[10px] font-semibold leading-5', validade.className)}>
                            {validade.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-slate-500">
                        <span className="font-mono">{item.ean}</span>
                        <span>
                          Qtd <b className="text-slate-900">{formatQuantity(item.quantidade, item.tipo)}</b>
                          {isKg ? ' kg' : ''}
                        </span>
                        {!isKg && item.validade && (
                          <span>
                            Venc. <b className="text-slate-900">{new Date(item.validade).toLocaleDateString('pt-BR')}</b>
                          </span>
                        )}
                        <span className="hidden sm:inline">PMZ <b className="text-slate-900">{formatMoney(item.pmz)}</b></span>
                        <span className="hidden sm:inline">Sug. <b className="text-slate-900">{formatMoney(item.preco_sugerido)}</b></span>
                        <span className="hidden md:inline">Margem <b className="text-slate-900">{formatMargin(item.pmz, item.preco_sugerido)}</b></span>
                      </div>
                    </div>
                    <div className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold tabular-nums text-emerald-700 ring-1 ring-emerald-200">
                      {formatMoney(item.preco_final)}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <div className="flex shrink-0 flex-col justify-center gap-0.5 border-l border-slate-200 bg-slate-50/70 px-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-sky-700 hover:bg-sky-100 hover:text-sky-700"
                      onClick={() => openEdit(item)}
                      aria-label={`Editar ${item.descricao}`}
                      title="Editar item"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:bg-red-100 hover:text-red-600"
                          aria-label={`Remover ${item.descricao}`}
                          title="Remover da rebaixa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover item?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Deseja remover &quot;{item.descricao}&quot; da lista de rebaixa?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void handleRemove(item.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Ações do rascunho */}
        {items.length > 0 && (
          <div className="mt-3 flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white">
                  <Trash2 className="h-3.5 w-3.5" />
                  Limpar rascunho
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar o rascunho?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os {items.length} item(ns) do rascunho serão removidos. O histórico de
                    rebaixas já enviadas é preservado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void handleClear()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Limpar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Rodapé de envio: só aparece quando há produto no rascunho */}
        {items.length > 0 && (
          <div className="mt-5 rounded-2xl border border-white/20 bg-white p-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Pronto para enviar</p>
                  <p className="text-xs leading-relaxed text-slate-500">
                    A planilha .ods sai com preços e quantidades preenchidos.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  className="h-9 flex-1 gap-2 sm:flex-none"
                  onClick={downloadOds}
                  disabled={items.length === 0 || exporting}
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Baixar .ods
                </Button>
                {canSendEmail && (
                  <Button
                    className="h-9 flex-1 gap-2 bg-sky-600 hover:bg-sky-700 sm:flex-none"
                    onClick={openEmail}
                    disabled={items.length === 0}
                  >
                    <Mail className="h-4 w-4" />
                    Enviar por e-mail
                  </Button>
                )}
              </div>
            </div>
            {!canSendEmail && (
              <p className="mt-2 text-[11px] text-slate-400">
                O envio por e-mail é restrito a admin e encarregado. Baixe a planilha para enviar manualmente.
              </p>
            )}
          </div>
        )}

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/50">
          <Lock className="h-3.5 w-3.5" />
          O rascunho fica salvo no servidor e o histórico guarda cada lote enviado.
        </p>
      </div>

      {/* ── Diálogo: adicionar produto ───────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!addSubmitting) setShowAdd(open); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg',
                addTipo === 'KG' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600',
              )}>
                {addTipo === 'KG' ? <Scale className="h-5 w-5" /> : <Package className="h-5 w-5" />}
              </span>
              Adicionar à rebaixa
            </DialogTitle>
            <DialogDescription>
              {addStatus === 'found'
                ? `Produto ${addTipo === 'KG' ? 'de balança · tipo KG' : 'unitário · tipo UN'}`
                : 'Busque pelo código, EAN ou use o leitor de código de barras.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              {addStatus !== 'found' && (
                <BarcodeScanner
                  onDetected={(scannedCode) => {
                    setAddCode(scannedCode);
                    setAddStatus('idle');
                    setAddProduct(null);
                    setTimeout(() => void searchProduct(scannedCode), 100);
                  }}
                />
              )}
              <Input
                value={addCode}
                onChange={(event) => {
                  if (addStatus === 'found') return;
                  setAddCode(event.target.value.replace(/\s/g, ''));
                  if (addStatus !== 'idle') {
                    setAddStatus('idle');
                    setAddProduct(null);
                    setAddError('');
                  }
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') void searchProduct(addCode); }}
                placeholder="Código do produto"
                inputMode="numeric"
                autoFocus
                disabled={addStatus === 'loading' || addStatus === 'found'}
              />
              {addStatus === 'found' ? (
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setAddCode('');
                    setAddProduct(null);
                    setAddStatus('idle');
                    setAddQuantidade('');
                    setAddValidade('');
                    setAddMotivo('');
                    setAddPmz(null);
                    setAddSugerido('');
                    setAddFinal('');
                    setAddStock(null);
                  }}
                >
                  Trocar
                </Button>
              ) : (
                <Button
                  className="shrink-0 gap-2 bg-sky-600 hover:bg-sky-700"
                  onClick={() => void searchProduct(addCode)}
                  disabled={!addCode.trim() || addStatus === 'loading'}
                >
                  {addStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar
                </Button>
              )}
            </div>

            {addStatus === 'loading' && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando produto...
              </div>
            )}
            {addStatus === 'not_found' && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Produto não encontrado no banco de dados.
              </div>
            )}
            {addStatus === 'error' && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {addError || 'Erro ao buscar o produto.'}
              </div>
            )}

            {addStatus === 'found' && addProduct && (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-sky-700 shadow-sm">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{addProduct.descricao}</p>
                    <p className="text-[11px] tabular-nums text-slate-500">
                      EAN {addProduct.ean} · Código {addProduct.codigo} ·{' '}
                      <span className={cn('font-semibold', addTipo === 'KG' ? 'text-amber-700' : 'text-slate-600')}>
                        {addTipo}
                      </span>
                    </p>
                  </div>
                  <Badge className="shrink-0 border-emerald-200 bg-emerald-100 text-emerald-700" variant="outline">
                    Encontrado
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                      Estoque ({addTipo === 'KG' ? 'kg' : 'un'})
                    </label>
                    <Input
                      value={addQuantidade}
                      onChange={(event) => setAddQuantidade(event.target.value)}
                      placeholder={addTipo === 'KG' ? '0,000' : '0'}
                      inputMode="decimal"
                      className="tabular-nums"
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-emerald-700">
                        {addStock !== null
                          ? `Consulta: ${formatQuantity(addStock, addTipo)} ${addTipo === 'KG' ? 'kg' : 'un'}`
                          : 'Sem estoque na consulta'}
                      </p>
                      <button
                        type="button"
                        onClick={handlePullStock}
                        disabled={addStock === null}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-sky-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Puxar da consulta
                      </button>
                    </div>
                  </div>

                  {addTipo === 'KG' ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                        Motivo da rebaixa <span className="text-red-500">*</span>
                      </label>
                      <Select value={addMotivo} onValueChange={(value) => setAddMotivo(value as MotivoRebaixa)}>
                        <SelectTrigger aria-label="Motivo da rebaixa">
                          <SelectValue placeholder="Selecione o motivo" />
                        </SelectTrigger>
                        <SelectContent>
                          {MOTIVOS_REBAIXA.map((motivo) => (
                            <SelectItem key={motivo} value={motivo}>{motivo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-[11px] text-amber-700">KG usa motivo — não pede data.</p>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                        Vencimento <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="date"
                        value={addValidade}
                        onChange={(event) => setAddValidade(event.target.value)}
                        aria-label="Data de vencimento"
                      />
                      <p className="mt-1 text-[11px] text-sky-700">UN usa data — não pede motivo.</p>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-slate-800">
                      PMZ <Lock className="h-3.5 w-3.5 text-slate-400" />
                    </label>
                    <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-600">
                      {formatMoney(addPmz)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">Custo do catálogo</p>
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
                      Preço sugerido
                      <button
                        type="button"
                        onClick={() => {
                          if (addPmz === null) return;
                          const suggested = formatMoneyInput(Math.round(suggestedPrice(addPmz) * 100) / 100);
                          setAddSugerido(suggested);
                          if (!addFinalTouched) setAddFinal(suggested);
                        }}
                        disabled={addPmz === null}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        50% do PMZ
                      </button>
                    </label>
                    <Input
                      value={addSugerido}
                      onChange={(event) => handleAddSuggested(event.target.value)}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="tabular-nums"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Piso de R$ 0,99</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Preço final da rebaixa</label>
                    <Input
                      value={addFinal}
                      onChange={(event) => handleAddFinal(event.target.value)}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="border-emerald-300 bg-emerald-50/40 font-bold tabular-nums text-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Margem</label>
                    <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold tabular-nums text-slate-700">
                      {addMargin === null ? '—' : `${addMargin.toFixed(1).replace('.', ',')}%`}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowAdd(false)} disabled={addSubmitting}>
              Cancelar
            </Button>
            <Button
              className="flex-1 gap-2 bg-sky-600 hover:bg-sky-700 sm:flex-none"
              onClick={() => void handleAdd()}
              disabled={addSubmitting || addStatus !== 'found'}
            >
              {addSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar à lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: buscar na validade ──────────────────────────────── */}
      <Dialog open={showValidade} onOpenChange={(open) => { if (!validadeSubmitting) setShowValidade(open); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <CalendarClock className="h-5 w-5" />
              </span>
              Buscar na validade
            </DialogTitle>
            <DialogDescription>
              Selecione os produtos que vão para a rebaixa. Itens com motivo já entram como KG.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={validadeSearch}
                onChange={(event) => setValidadeSearch(event.target.value)}
                placeholder="Filtrar por descrição ou EAN"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['7dias', '30dias', 'todos'] as ValidadePeriod[]).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setValidadePeriod(period)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                    validadePeriod === period
                      ? 'bg-sky-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {PERIOD_LABELS[period]}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-slate-400">
                {validadeFiltered.length} disponível(is)
              </span>
            </div>

            <div className="max-h-[330px] space-y-1.5 overflow-y-auto pr-0.5">
              {validadeLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando validade...
                </div>
              ) : validadeError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                  {validadeError}
                </div>
              ) : validadeFiltered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">
                  Nenhum produto na validade para este filtro.
                </div>
              ) : (
                validadeFiltered.map((item) => {
                  const tipo = tipoFromMotivo(item.motivo);
                  const already = draftValidadeIds.has(item.id);
                  const checked = Boolean(selectedValidade[item.id]) || already;
                  const validade = validadeBadge(item.validade);
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                        already
                          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                          : checked
                            ? 'border-sky-300 bg-sky-50/60'
                            : 'border-slate-200 bg-white hover:border-sky-300',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={already}
                        onChange={() => toggleValidade(item)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-sky-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className={cn('truncate text-sm font-semibold', already ? 'text-slate-500' : 'text-slate-900')}>
                            {item.descricao}
                          </p>
                          <span className={cn(
                            'rounded border px-1.5 py-0 text-[10px] font-bold uppercase leading-5',
                            tipo === 'KG'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600',
                          )}>
                            {tipo}
                          </span>
                          {tipo === 'KG' ? (
                            item.motivo && (
                              <span className={cn('rounded border px-1.5 py-0 text-[10px] font-semibold leading-5', MOTIVO_BADGE[item.motivo] ?? 'border-slate-200 bg-slate-50 text-slate-600')}>
                                {item.motivo}
                              </span>
                            )
                          ) : (
                            <span className={cn('rounded border px-1.5 py-0 text-[10px] font-semibold leading-5', validade.className)}>
                              {validade.label}
                            </span>
                          )}
                          {already && (
                            <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0 text-[10px] font-semibold leading-5 text-slate-500">
                              Já na rebaixa
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                          EAN {item.ean} · Qtd <b className="text-slate-800">{formatQuantity(Number(item.quantidade) || 0, tipo)}</b>
                          {tipo === 'KG' ? ' kg' : ''}
                          {tipo === 'UN' && item.validade
                            ? <> · Venc. <b className="text-slate-800">{new Date(item.validade).toLocaleDateString('pt-BR')}</b></>
                            : null}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-500">
                <b className="text-slate-900">{selectedValidadeItems.length} selecionado(s)</b>
                {' · '}
                {selectedValidadeTotals.kg > 0 ? `${formatQuantity(selectedValidadeTotals.kg, 'KG')} kg` : '0 kg'}
                {' / '}
                {selectedValidadeTotals.un} un
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowValidade(false)} disabled={validadeSubmitting}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="gap-2 bg-sky-600 hover:bg-sky-700"
                  onClick={() => void handleAddFromValidade()}
                  disabled={validadeSubmitting || selectedValidadeItems.length === 0}
                >
                  {validadeSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar {selectedValidadeItems.length > 0 ? selectedValidadeItems.length : ''}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: editar item ─────────────────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !editSubmitting) setEditing(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar item da rebaixa</DialogTitle>
            <DialogDescription>
              Ajuste quantidade, preço e {editing?.tipo === 'KG' ? 'motivo' : 'vencimento'}.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-slate-900">{editing.descricao}</p>
                <p className="text-[11px] tabular-nums text-slate-500">
                  EAN {editing.ean} · Código {editing.codigo} ·{' '}
                  <span className={cn('font-semibold', editing.tipo === 'KG' ? 'text-amber-700' : 'text-slate-600')}>
                    {editing.tipo}
                  </span>
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                    Quantidade ({editing.tipo === 'KG' ? 'kg' : 'un'})
                  </label>
                  <Input
                    value={editQuantidade}
                    onChange={(event) => setEditQuantidade(event.target.value)}
                    inputMode="decimal"
                    className="tabular-nums"
                  />
                </div>
                {editing.tipo === 'KG' ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Motivo</label>
                    <Select value={editMotivo} onValueChange={(value) => setEditMotivo(value as MotivoRebaixa)}>
                      <SelectTrigger aria-label="Motivo da rebaixa">
                        <SelectValue placeholder="Selecione o motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIVOS_REBAIXA.map((motivo) => (
                          <SelectItem key={motivo} value={motivo}>{motivo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800">Vencimento</label>
                    <Input
                      type="date"
                      value={editValidade}
                      onChange={(event) => setEditValidade(event.target.value)}
                      aria-label="Data de vencimento"
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-slate-800">
                    PMZ <Lock className="h-3.5 w-3.5 text-slate-400" />
                  </label>
                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-600">
                    {formatMoney(editing.pmz)}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
                    Preço sugerido
                    <button
                      type="button"
                      onClick={() => {
                        if (editing.pmz === null) return;
                        setEditSugerido(formatMoneyInput(Math.round(suggestedPrice(editing.pmz) * 100) / 100));
                      }}
                      disabled={editing.pmz === null}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      50% do PMZ
                    </button>
                  </label>
                  <Input
                    value={editSugerido}
                    onChange={(event) => setEditSugerido(event.target.value)}
                    inputMode="decimal"
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800">Preço final da rebaixa</label>
                  <Input
                    value={editFinal}
                    onChange={(event) => setEditFinal(event.target.value)}
                    inputMode="decimal"
                    className="border-emerald-300 bg-emerald-50/40 font-bold tabular-nums text-emerald-700"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800">Margem</label>
                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold tabular-nums text-slate-700">
                    {editMargin === null ? '—' : `${editMargin.toFixed(1).replace('.', ',')}%`}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setEditing(null)} disabled={editSubmitting}>
              Cancelar
            </Button>
            <Button
              className="flex-1 gap-2 bg-sky-600 hover:bg-sky-700 sm:flex-none"
              onClick={() => void handleEdit()}
              disabled={editSubmitting}
            >
              {editSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: exportar / compartilhar ─────────────────────────── */}
      <Dialog open={showExport} onOpenChange={(open) => { if (!exporting && !sharing) setShowExport(open); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar rebaixa</DialogTitle>
            <DialogDescription>
              Serão exportados <span className="font-semibold text-foreground">{items.length}</span> produto(s)
              do rascunho, com preços e quantidades.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-1">
            <button
              type="button"
              onClick={downloadOds}
              disabled={exporting}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
            >
              <FileSpreadsheet className="h-6 w-6 shrink-0 text-emerald-600" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">Planilha (ODS)</span>
                <span className="text-xs text-muted-foreground">Com fórmulas e cores — LibreOffice Calc</span>
              </span>
              {exporting && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" />}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={exporting}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
            >
              <FileSpreadsheet className="h-6 w-6 shrink-0 text-sky-600" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">Planilha (CSV)</span>
                <span className="text-xs text-muted-foreground">Abre no Calc e no Excel — para anexar no e-mail</span>
              </span>
            </button>
            {canSendEmail && (
              <button
                type="button"
                onClick={() => { setShowExport(false); openEmail(); }}
                disabled={items.length === 0}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
              >
                <Mail className="h-6 w-6 shrink-0 text-indigo-600" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">Enviar por e-mail</span>
                  <span className="text-xs text-muted-foreground">Planilha .ods anexada pelo servidor</span>
                </span>
              </button>
            )}
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowExport(false)} disabled={sharing}>
              Cancelar
            </Button>
            <Button className="flex-1 gap-2 sm:flex-none" onClick={shareSpreadsheet} disabled={sharing || items.length === 0}>
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Compartilhar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: enviar por e-mail ───────────────────────────────── */}
      <Dialog open={showEmail} onOpenChange={(open) => { if (!emailSending) setShowEmail(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Mail className="h-5 w-5" />
              </span>
              Enviar rebaixa por e-mail
            </DialogTitle>
            <DialogDescription>
              {items.length} produto(s) · planilha .ods em anexo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <label htmlFor="rebaixa-email-to" className="text-sm font-medium">Para</label>
              <div className="mt-1 flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                {copyEmail && (
                  <span
                    title={`${copyEmail} — cópia automática de todas as rebaixas (Cc)`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                  >
                    <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{copyEmail}</span>
                    <Lock className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span className="sr-only">cópia fixa</span>
                  </span>
                )}
                {recipients.map((address) => {
                  const isFixed = fixedEmail !== null && address.toLowerCase() === fixedEmail.toLowerCase();
                  return (
                    <span
                      key={address}
                      title={isFixed ? `${address} — e-mail padrão (fixo)` : address}
                      className={cn(
                        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        isFixed
                          ? 'border-sky-300 bg-sky-50 text-sky-800'
                          : 'border-slate-300 bg-slate-50 text-slate-700',
                      )}
                    >
                      {isFixed && <Star className="h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />}
                      <span className="truncate">{address}</span>
                      {isFixed ? (
                        <Lock className="h-3 w-3 shrink-0 text-sky-500" aria-hidden="true" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeRecipient(address)}
                          disabled={emailSending}
                          className="shrink-0 rounded-full p-0.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50"
                          aria-label={`Remover ${address}`}
                          title={`Remover ${address}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
                <input
                  id="rebaixa-email-to"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value.replace(/[\r\n]/g, ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
                      event.preventDefault();
                      commitEmailInput();
                    } else if (event.key === 'Backspace' && !emailInput) {
                      const list = splitEmailList(emailTo);
                      if (list.length > 0) removeRecipient(list[list.length - 1]);
                    }
                  }}
                  onBlur={commitEmailInput}
                  placeholder={recipients.length > 0 ? 'Adicionar e-mail' : 'email@empresa.com'}
                  className="h-7 min-w-[140px] flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0"
                  inputMode="email"
                  autoComplete="off"
                  disabled={emailSending}
                />
              </div>
              {activeEmails(emailsPadrao).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeEmails(emailsPadrao).map((item) => {
                    const isFixed = fixedEmail !== null && item.email.toLowerCase() === fixedEmail.toLowerCase();
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => pickEmail(item.email)}
                        disabled={emailSending || isFixed}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                          isFixed
                            ? 'border-sky-300 bg-sky-50 text-sky-800'
                            : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 disabled:opacity-50',
                        )}
                        title={isFixed ? `${item.nome} — ${item.email} (padrão fixo)` : `${item.nome} — ${item.email}`}
                      >
                        {item.padrao && <Star className="h-3 w-3 text-amber-500" />}
                        {item.nome}
                        {isFixed && <Lock className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {copyEmail
                  ? `A cópia é enviada em Cc para ${copyEmail}; o contato com estrela fica fixo no envio.`
                  : activeEmails(emailsPadrao).length > 0
                    ? 'O contato com estrela fica fixo no envio; toque nos demais atalhos ou digite e pressione Enter.'
                    : 'Separe vários destinatários por vírgula.'}
              </p>
            </div>
            <div>
              <label htmlFor="rebaixa-email-subject" className="text-sm font-medium">Assunto</label>
              <Input
                id="rebaixa-email-subject"
                value={emailSubject}
                onChange={(event) => { setEmailSubject(event.target.value); setEmailTouched(true); }}
                className="mt-1"
                disabled={emailSending}
              />
            </div>
            <div>
              <label htmlFor="rebaixa-email-text" className="text-sm font-medium">Mensagem</label>
              <textarea
                id="rebaixa-email-text"
                value={emailText}
                onChange={(event) => { setEmailText(event.target.value); setEmailTouched(true); }}
                rows={3}
                disabled={emailSending}
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
            {emailLoading && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verificando a configuração de e-mail no servidor...
              </p>
            )}
            {emailDefaults && (
              <p className="text-xs text-muted-foreground">
                Assunto e mensagem vêm do padrão da aba E-mail — dá para editar aqui.
              </p>
            )}
            {emailConfig && !emailConfig.enabled && !emailLoading && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                O envio de e-mail não está configurado no servidor. Defina{' '}
                <span className="font-mono">RESEND_API_KEY</span> ou{' '}
                <span className="font-mono">SMTP_HOST</span> nas variáveis de ambiente da Vercel.
                Enquanto isso, use o download da planilha.
              </p>
            )}
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowEmail(false)} disabled={emailSending}>
              Cancelar
            </Button>
            <Button
              className="flex-1 gap-2 bg-sky-600 hover:bg-sky-700 sm:flex-none"
              onClick={() => void sendByEmail()}
              disabled={emailSending || emailLoading || items.length === 0 || (recipients.length === 0 && !emailInput.trim() && !copyEmail)}
            >
              {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: histórico ───────────────────────────────────────── */}
      <Dialog open={showHistory} onOpenChange={(open) => { if (!open) { setShowHistory(false); setHistoryBatch(null); } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <History className="h-5 w-5" />
              </span>
              {historyBatch ? 'Itens do lote enviado' : 'Histórico de rebaixas'}
            </DialogTitle>
            <DialogDescription>
              {historyBatch
                ? `${formatDateTime(historyBatch.sent_at)} · ${historyBatch.itens} item(ns)`
                : 'Cada envio fica registrado com data, hora e quantidade de itens.'}
            </DialogDescription>
          </DialogHeader>

          {historyBatch ? (
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-slate-600" onClick={() => setHistoryBatch(null)}>
                <ChevronLeft className="h-4 w-4" />
                Voltar ao histórico
              </Button>
              {historyItemsLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando itens...
                </div>
              ) : historyItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">
                  Nenhum item neste lote.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {historyItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.descricao}</p>
                          <span className={cn(
                            'rounded border px-1.5 py-0 text-[10px] font-bold uppercase leading-5',
                            item.tipo === 'KG'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600',
                          )}>
                            {item.tipo}
                          </span>
                        </div>
                        <p className="text-[11px] tabular-nums text-slate-500">
                          Qtd {formatQuantity(item.quantidade, item.tipo)}{item.tipo === 'KG' ? ' kg' : ''}
                          {item.tipo === 'KG' && item.motivo ? ` · ${item.motivo}` : ''}
                          {item.tipo === 'UN' && item.validade
                            ? ` · Venc. ${new Date(item.validade).toLocaleDateString('pt-BR')}`
                            : ''}
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-sm font-bold tabular-nums text-emerald-700 ring-1 ring-emerald-200">
                        {formatMoney(item.preco_final)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando histórico...
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">
              Nenhuma rebaixa enviada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((batch) => (
                <button
                  key={batch.batch_id}
                  type="button"
                  onClick={() => void openHistoryBatch(batch)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {new Date(batch.sent_at).toLocaleDateString('pt-BR')}
                      <span className="ml-1 font-normal text-slate-500">
                        {new Date(batch.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">{batch.itens} item(ns)</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowHistory(false); setHistoryBatch(null); }}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RebaixaView;
