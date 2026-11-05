import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { invokeFunction } from '@/lib/api';
import {
  ScanBarcode, PackageX, AlertCircle, ShoppingBasket, Loader2, CalendarClock, Trash2, Bell, AlertTriangle, Clock, Pencil, Filter, Brush, Share2, FileSpreadsheet, FileText, Scale, ChevronRight, Boxes, CalendarDays, User, Check, Mail, Tag,
} from 'lucide-react';

import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import BarcodeScanner from '@/components/BarcodeScanner';
import { Badge } from '@/components/ui/badge';
import ConsultaValidadeView from '@/components/ConsultaValidadeView';
import ArrastaoView from '@/components/ArrastaoView';
import { DEFAULT_ALERT_DAYS, daysUntil } from '@/lib/validade-notifications';
import {
  createValidadeOds,
  isWeightProduct,
  saveValidadeOds,
  shareValidadeOds,
  spreadSheetFileName,
  type ShareOutcome,
} from '@/lib/validade-spreadsheet';
import { fetchProductTipos } from '@/lib/validade-tipos';
import { fetchProductCustos } from '@/lib/validade-custos';
import { browserBlocksFileShare, fileFromBytes, shareFileWithSystem } from '@/lib/system-share';
import { createValidadeCsv, csvFileName, CSV_MIME, saveValidadeCsv } from '@/lib/validade-csv';
import { fetchEmailConfig, sendRebaixaEmail, type EmailConfig } from '@/lib/validade-email';
import { addRebaixaItems, motivoFromValidade, tipoFromMotivo } from '@/lib/rebaixa';
import { trackEvent } from '@/lib/analytics';

/** MIME do PDF, aceito pela folha de compartilhamento do Chrome. */
const PDF_MIME = 'application/pdf';


interface ProductResult {
  ean: string;
  codigo: string;
  descricao: string;
  tipo?: string | null;
}

interface ValidadeItem {
  id: string;
  ean: number;
  codigo: number;
  descricao: string;
  validade: string;
  status: boolean;
  created_by: string | null;
  quantidade: number;
  motivo?: string | null;
}

/** Motivos de rebaixa para produtos de balança (KG). */
const MOTIVOS_KG = ['Excesso', 'Qualidade'] as const;
type MotivoKg = (typeof MOTIVOS_KG)[number];

function getToken(): string | null {
  try { return localStorage.getItem('estoque_pro_token'); } catch { return null; }
}

async function invokeWithToken(functionName: string, body: Record<string, unknown>) {
  const token = getToken();
  if (!token) return { data: null, error: new Error('No token') };
  return invokeFunction(functionName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
}

type FilterType = 'hoje' | '7dias' | '30dias' | 'todos';

const FILTER_LABELS: Record<FilterType, string> = {
  todos: 'Todos',
  hoje: 'Hoje',
  '7dias': '7 dias',
  '30dias': '30 dias',
};

const ValidadeView = () => {
  const { user, getToken: authGetToken, isAdmin, userRole } = useAuth();
  const canSendToRebaixa = userRole === 'admin' || userRole === 'encarregado' || userRole === 'enc_flv';
  const canSendEmail = isAdmin || userRole === 'encarregado';
  const [code, setCode] = useState('');
  const [validade, setValidade] = useState('');
  const [motivo, setMotivo] = useState<MotivoKg | ''>('');
  const [product, setProduct] = useState<ProductResult | null>(null);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'not_found' | 'error' | 'found'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ValidadeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<ValidadeItem[]>([]);
const [filter, setFilter] = useState<FilterType>('todos');
  const [quantidade, setQuantidade] = useState('');
  const [editingItem, setEditingItem] = useState<ValidadeItem | null>(null);
  const [editValidade, setEditValidade] = useState<Date | undefined>(undefined);
  const [editQuantidade, setEditQuantidade] = useState('0');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [detailItem, setDetailItem] = useState<ValidadeItem | null>(null);
  const [showConsulta, setShowConsulta] = useState(false);
  const [showArrastao, setShowArrastao] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPlanilha, setDownloadingPlanilha] = useState(false);
  const [sharingPlanilha, setSharingPlanilha] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  /** Diálogo de envio por e-mail (planilha .ods anexada pelo servidor). */
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailText, setEmailText] = useState('');
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  /** Tipos e custos já buscados para a planilha, prontos para o compartilhamento. */
  const spreadsheetCache = useRef<{
    key: string;
    tipos: Record<string, string>;
    custos: Record<string, number>;
  } | null>(null);

  /** Busca tipos e custos da lista; usado pelo download e pelo compartilhamento. */
  const loadSpreadsheetData = useCallback(async (key: string) => {
    const token = authGetToken() ?? getToken();
    const codigos = key.split(',');
    const [tipos, custos] = await Promise.all([
      fetchProductTipos(codigos, token),
      fetchProductCustos(codigos, token),
    ]);
    return { tipos, custos };
  }, [authGetToken]);

  const [alertDays, setAlertDays] = useState(() => {
    try { const v = localStorage.getItem('validade_alert_days'); return v ? parseInt(v, 10) : DEFAULT_ALERT_DAYS; } catch { return DEFAULT_ALERT_DAYS; }
  });
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [tempAlertDays, setTempAlertDays] = useState(alertDays);

  const fetchItems = useCallback(async () => {
    const { data, error } = await invokeWithToken('manage-validade', { action: 'list_all' });
    if (!error && data?.items) {
      setItems(data.items);
      // Filter notifications: within configured alert days
      const now = new Date();
      const alertLimit = new Date(now);
      alertLimit.setDate(alertLimit.getDate() + alertDays);
      alertLimit.setHours(23, 59, 59, 999);
      // Produtos com motivo (balança/KG) não vencem: entram só na lista de rebaixa.
      const notif = data.items.filter((i: ValidadeItem) => !i.motivo && new Date(i.validade) <= alertLimit);
      setNotifications(notif);
    }
    setLoading(false);
  }, [alertDays]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Show notification toast on mount if there are items expiring
  useEffect(() => {
    if (notifications.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiringToday = notifications.filter(i => {
        const d = new Date(i.validade);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      });
      const expiringSoon = notifications.filter(i => {
        const d = new Date(i.validade);
        d.setHours(0, 0, 0, 0);
        return d.getTime() > today.getTime();
      });

      if (expiringToday.length > 0) {
        toast.error(`⚠️ ${expiringToday.length} produto(s) vencem HOJE!`, { duration: 8000 });
      }
      if (expiringSoon.length > 0) {
        toast.warning(`🔔 ${expiringSoon.length} produto(s) vencem em até ${alertDays} dia(s)`, { duration: 6000 });
      }
    }
  }, [notifications]);

  const queryProduct = async (codigo: string) => {
    const token = authGetToken();
    const { data, error } = await invokeFunction('query-product', {
      body: { codigo },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    return { data, error };
  };

  const handleSearch = async () => {
    if (!code.trim()) return;
    setSearchStatus('loading');
    setProduct(null);
    setValidade('');
    setMotivo('');
    setErrorMsg('');
    try {
      const { data, error } = await queryProduct(code.trim());
      if (error) { setSearchStatus('error'); setErrorMsg('Erro ao conectar.'); return; }
      if (data.error) { setSearchStatus('error'); setErrorMsg(data.error); return; }
      if (!data.found) { setSearchStatus('not_found'); return; }
      setProduct(data.product);
      setSearchStatus('found');
    } catch {
      setSearchStatus('error');
      setErrorMsg('Erro ao conectar ao banco de dados.');
    }
  };

  const searchProduct = async (scannedCode: string) => {
    setSearchStatus('loading');
    setValidade('');
    setMotivo('');
    try {
      const { data, error } = await queryProduct(scannedCode);
      if (error || data.error) { setSearchStatus('error'); setErrorMsg(data?.error || 'Erro ao conectar.'); return; }
      if (!data.found) { setSearchStatus('not_found'); return; }
      setProduct(data.product);
      setSearchStatus('found');
    } catch {
      setSearchStatus('error');
      setErrorMsg('Erro ao conectar ao banco de dados.');
    }
  };

  const handleAdd = async () => {
    if (!product || submitting) return;
    // Produto de balança (KG) não tem vencimento: registra-se o motivo do rebaixa.
    const peso = isWeightProduct(product.tipo);
    if (peso ? !motivo : !validade) return;
    setSubmitting(true);
    try {
      const { error } = await invokeWithToken('manage-validade', {
        action: 'add',
        item: {
          ean: Number(product.ean),
          codigo: Number(product.codigo),
          descricao: product.descricao,
          validade: peso
            ? new Date(new Date().setHours(23, 59, 59, 0)).toISOString()
            : new Date(validade + 'T23:59:59').toISOString(),
          quantidade: parseInt(quantidade) || 0,
          motivo: peso ? motivo : null,
        },
      });
      if (!error) {
        toast.success('Validade registrada com sucesso');
        setCode(''); setValidade(''); setMotivo(''); setQuantidade(''); setProduct(null); setSearchStatus('idle');
        await fetchItems();
      } else {
        toast.error('Erro ao registrar validade');
      }
    } catch {
      toast.error('Erro ao registrar validade');
    }
    setSubmitting(false);
  };

  const handleRemove = async (id: string) => {
    const { error } = await invokeWithToken('manage-validade', { action: 'remove', id });
    if (!error) {
      toast.success('Item removido');
      await fetchItems();
    } else {
      toast.error('Erro ao remover');
    }
  };

  /** Envia um item da Validade para o rascunho da Rebaixa. */
  const sendToRebaixa = async (item: ValidadeItem) => {
    // Item com motivo entra como KG (a data da Validade é ignorada); sem
    // motivo, entra como UN e mantém o vencimento.
    const motivo = motivoFromValidade(item.motivo);
    const tipo = tipoFromMotivo(item.motivo);
    try {
      const result = await addRebaixaItems([{
        ean: String(item.ean),
        codigo: String(item.codigo),
        descricao: item.descricao,
        tipo,
        quantidade: Number(item.quantidade) || 0,
        validade: tipo === 'UN' ? item.validade : null,
        motivo,
        validade_id: item.id,
      }]);
      if (result.added > 0) {
        toast.success('Item enviado para a rebaixa');
      } else {
        toast.info('Item já está na rebaixa');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar para a rebaixa');
    }
  };

  const openEdit = (item: ValidadeItem) => {
    setEditingItem(item);
    setEditValidade(new Date(item.validade));
    setEditQuantidade(String(item.quantidade));
  };

  const handleEdit = async () => {
    if (!editingItem || !editValidade || editSubmitting) return;
    setEditSubmitting(true);
    try {
      const { error } = await invokeWithToken('manage-validade', {
        action: 'update',
        id: editingItem.id,
        validade: new Date(editValidade.setHours(23, 59, 59)).toISOString(),
        quantidade: parseInt(editQuantidade) || 0,
      });
      if (!error) {
        toast.success('Validade atualizada');
        setEditingItem(null);
        await fetchItems();
      } else {
        toast.error('Erro ao atualizar');
      }
    } catch {
      toast.error('Erro ao atualizar');
    }
    setEditSubmitting(false);
  };

  const getValidadeStatus = (validade: string) => {
    const diffDays = daysUntil(validade);

    if (diffDays < 0) return { label: 'Vencido', variant: 'destructive' as const, icon: AlertTriangle };
    if (diffDays === 0) return { label: 'Vence Hoje', variant: 'destructive' as const, icon: AlertTriangle };
    if (diffDays <= 2) return { label: `${diffDays}d restante(s)`, variant: 'secondary' as const, icon: Clock };
    return { label: `${diffDays}d`, variant: 'outline' as const, icon: CalendarClock };
  };

  const filteredItems = useMemo(() => items.filter((item) => {
    const diffDays = daysUntil(item.validade);

    switch (filter) {
      case 'hoje': return diffDays <= 0;
      case '7dias': return diffDays <= 7;
      case '30dias': return diffDays <= 30;
      default: return true;
    }
  }), [items, filter]);

  /** Identifica a lista atual: se os códigos mudam, o cache de tipos/custos é refeito. */
  const spreadsheetCodesKey = useMemo(
    () => filteredItems.map((item) => String(item.codigo)).join(','),
    [filteredItems],
  );

  // O celular só abre a folha de compartilhamento dentro do gesto do usuário.
  // Por isso tipos e custos são buscados assim que o diálogo abre, e não no clique.
  useEffect(() => {
    if (!showDownloadDialog || spreadsheetCodesKey === '') return;
    if (spreadsheetCache.current?.key === spreadsheetCodesKey) return;

    let active = true;

    void loadSpreadsheetData(spreadsheetCodesKey)
      .then(({ tipos, custos }) => {
        if (active) spreadsheetCache.current = { key: spreadsheetCodesKey, tipos, custos };
      })
      // Falha aqui não impede o clique: o compartilhamento tenta buscar de novo.
      .catch(() => undefined);

    return () => { active = false; };
  }, [showDownloadDialog, spreadsheetCodesKey, loadSpreadsheetData]);

  const filterOptions: { key: FilterType; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'hoje', label: 'Hoje' },
    { key: '7dias', label: '7 dias' },
    { key: '30dias', label: '30 dias' },
  ];

  /** Monta o relatório de validade em PDF e devolve os bytes. */
  const createValidadePdf = async (): Promise<Uint8Array> => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const now = new Date();

    const sorted = [...filteredItems].sort(
      (a, b) => new Date(a.validade).getTime() - new Date(b.validade).getTime(),
    );
    const expired = sorted.filter((i) => daysUntil(i.validade) < 0).length;
    const expiringToday = sorted.filter((i) => daysUntil(i.validade) === 0).length;

    // ===== Cabeçalho / Título =====
    doc.setFillColor(33, 37, 41);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Controle de Validade', marginX, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Estoque Pro', pageW - marginX, 14, { align: 'right' });

    // ===== Metadados =====
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${format(now, 'dd/MM/yyyy HH:mm')}`, marginX, 30);
    const summary = [
      `Filtro: ${FILTER_LABELS[filter]}`,
      `Total: ${sorted.length}`,
      `Vencidos: ${expired}`,
      `Vencem hoje: ${expiringToday}`,
    ].join('   |   ');
    const summaryLines = doc.splitTextToSize(summary, pageW - marginX * 2);
    doc.text(summaryLines, marginX, 35);

    // ===== Tabela =====
    const tableTop = 35 + summaryLines.length * 4 + 3;
    const columns = [
      { label: 'Código', x: marginX, w: 20 },
      { label: 'EAN', x: marginX + 20, w: 26 },
      { label: 'Descrição', x: marginX + 46, w: 72 },
      { label: 'Qtd', x: marginX + 118, w: 12 },
      { label: 'Validade', x: marginX + 130, w: 22 },
      { label: 'Status', x: marginX + 152, w: 30 },
    ];
    const rowH = 7;

    const drawHeader = (y: number) => {
      doc.setFillColor(33, 37, 41);
      doc.rect(marginX, y, pageW - marginX * 2, rowH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      columns.forEach((c) => doc.text(c.label, c.x + 2, y + rowH - 2));
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
    };

    let y = tableTop;
    drawHeader(y);
    y += rowH;

    sorted.forEach((item, idx) => {
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

      const diffDays = daysUntil(item.validade);
      const status = item.motivo ? item.motivo : getValidadeStatus(item.validade).label;
      if (item.motivo) doc.setTextColor(0, 0, 0);
      else if (diffDays <= 0) doc.setTextColor(200, 0, 0);
      else if (diffDays <= alertDays) doc.setTextColor(204, 102, 0);
      else doc.setTextColor(0, 0, 0);

      const desc = String(item.descricao);
      const descTrunc = desc.length > 38 ? desc.slice(0, 37) + '…' : desc;

      doc.setFontSize(8);
      doc.text(String(item.codigo), columns[0].x + 2, y + rowH - 2);
      doc.text(String(item.ean), columns[1].x + 2, y + rowH - 2);
      doc.text(descTrunc, columns[2].x + 2, y + rowH - 2);
      doc.text(String(item.quantidade), columns[3].x + 2, y + rowH - 2);
      doc.text(item.motivo ? '—' : new Date(item.validade).toLocaleDateString('pt-BR'), columns[4].x + 2, y + rowH - 2);
      doc.text(status, columns[5].x + 2, y + rowH - 2);
      y += rowH;
    });

    // ===== Rodapé com paginação =====
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(8);
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Página ${i} de ${pageCount}`, pageW - marginX, pageH - 6, { align: 'right' });
    }

    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
  };

  /** Nome do arquivo PDF com a data de hoje. */
  const pdfFileName = (date = new Date()) => `validade-${format(date, 'yyyy-MM-dd')}.pdf`;

  /** Baixa os bytes do PDF no aparelho. */
  const savePdfBytes = (bytes: Uint8Array) => {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: PDF_MIME }));
    const link = document.createElement('a');
    link.href = url;
    link.download = pdfFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = async () => {
    if (downloadingPdf) return;
    if (filteredItems.length === 0) {
      toast.error('Nenhum produto na lista para exportar');
      return;
    }
    setDownloadingPdf(true);
    try {
      const bytes = await createValidadePdf();
      savePdfBytes(bytes);
      trackEvent('exportar_pdf', { itens: filteredItems.length });
      toast.success('PDF gerado com sucesso');
    } catch {
      toast.error('Erro ao gerar PDF');
    }
    setDownloadingPdf(false);
  };

  const downloadSpreadsheet = async () => {
    if (downloadingPlanilha) return;
    if (filteredItems.length === 0) {
      toast.error('Nenhum produto na lista para exportar');
      return;
    }
    setDownloadingPlanilha(true);
    try {
      const cached = spreadsheetCache.current?.key === spreadsheetCodesKey
        ? spreadsheetCache.current
        : null;
      const { tipos, custos } = cached ?? await loadSpreadsheetData(spreadsheetCodesKey);
      if (!cached) spreadsheetCache.current = { key: spreadsheetCodesKey, tipos, custos };
      const ods = createValidadeOds(filteredItems, tipos, { custos });
      saveValidadeOds(ods);
      trackEvent('exportar_planilha', { formato: 'ods', itens: filteredItems.length });
      toast.success('Planilha gerada com sucesso');
      setShowDownloadDialog(false);
    } catch {
      toast.error('Erro ao gerar planilha');
    }
    setDownloadingPlanilha(false);
  };

  /** Baixa a planilha em CSV (abre no LibreOffice Calc e no Excel). */
  const downloadCsv = async () => {
    if (downloadingPlanilha) return;
    if (filteredItems.length === 0) {
      toast.error('Nenhum produto na lista para exportar');
      return;
    }
    setDownloadingPlanilha(true);
    try {
      const cached = spreadsheetCache.current?.key === spreadsheetCodesKey
        ? spreadsheetCache.current
        : null;
      const { tipos, custos } = cached ?? await loadSpreadsheetData(spreadsheetCodesKey);
      if (!cached) spreadsheetCache.current = { key: spreadsheetCodesKey, tipos, custos };
      const csv = createValidadeCsv(filteredItems, tipos, { custos });
      saveValidadeCsv(csv);
      trackEvent('exportar_planilha', { formato: 'csv', itens: filteredItems.length });
      toast.success('Planilha CSV gerada com sucesso');
      setShowDownloadDialog(false);
    } catch {
      toast.error('Erro ao gerar planilha');
    }
    setDownloadingPlanilha(false);
  };

  /**
   * Abre o compartilhamento do celular (WhatsApp, Gmail, Thunderbird…) com a
   * planilha. Se o cache estiver pronto, o arquivo é gerado e compartilhado no
   * mesmo gesto, que é o que o navegador móvel exige. Sem suporte, baixa a
   * planilha.
   */
  const shareSpreadsheet = () => {
    if (sharingPlanilha) return;
    if (filteredItems.length === 0) {
      toast.error('Nenhum produto na lista para compartilhar');
      return;
    }

    const itemsToShare = filteredItems;
    const key = spreadsheetCodesKey;
    const cached = spreadsheetCache.current?.key === key ? spreadsheetCache.current : null;
    const subject = `Solicitação de rebaixa / perecíveis — ${new Date().toLocaleDateString('pt-BR')}`;
    const text = `Segue a planilha de rebaixa com ${itemsToShare.length} produto(s)`;
    setSharingPlanilha(true);

    /**
     * Compartilha a planilha em CSV: formato aceito pelo Chrome e que abre
     * direto no LibreOffice Calc e no Excel.
     */
    const shareCsv = (tipos: Record<string, string>, custos: Record<string, number>) => {
      try {
        const csv = createValidadeCsv(itemsToShare, tipos, { custos });
        const file = fileFromBytes(csv, csvFileName(), CSV_MIME);
        void shareFileWithSystem(file, { title: subject, text }).then((outcome) => {
          setSharingPlanilha(false);
          if (outcome === 'shared') {
            trackEvent('compartilhar_planilha', { formato: 'csv', itens: itemsToShare.length });
            toast.success('Planilha compartilhada');
            setShowDownloadDialog(false);
          } else if (outcome === 'cancelled') {
            // O usuário fechou a folha do celular; o diálogo continua aberto.
          } else {
            saveValidadeCsv(csv);
            toast.success('Compartilhamento indisponível: planilha baixada', { duration: 6000 });
            setShowDownloadDialog(false);
          }
        });
      } catch {
        setSharingPlanilha(false);
        toast.error('Erro ao gerar planilha');
      }
    };

    const finish = (outcome: ShareOutcome) => {
      setSharingPlanilha(false);
      if (outcome === 'shared') {
        trackEvent('compartilhar_planilha', { formato: 'ods', itens: itemsToShare.length });
        toast.success('Planilha compartilhada');
        setShowDownloadDialog(false);
      } else if (outcome === 'downloaded') {
        toast.success('Compartilhamento indisponível: planilha baixada', { duration: 6000 });
        setShowDownloadDialog(false);
      }
      // 'cancelled': o usuário fechou a folha do celular; o diálogo continua aberto.
    };

    const runShare = (tipos: Record<string, string>, custos: Record<string, number>) => {
      // O Chromium só anexa PDF, imagens, áudio, vídeo e texto: o .ods é
      // recusado. Nesse caso enviamos o CSV, que é uma planilha de verdade
      // (abre no LibreOffice Calc e no Excel) e o navegador aceita.
      if (browserBlocksFileShare('rebaixa.ods')) {
        shareCsv(tipos, custos);
        return;
      }
      try {
        const ods = createValidadeOds(itemsToShare, tipos, { custos });
        // Sem `await` antes: o celular precisa do gesto do usuário para abrir a folha.
        void shareValidadeOds(ods, { subject, text })
          .then((outcome) => {
            // O navegador recusou o .ods: manda o CSV, que ele aceita.
            if (outcome === 'blocked') {
              shareCsv(tipos, custos);
              return;
            }
            finish(outcome);
          })
          .catch(() => {
            setSharingPlanilha(false);
            toast.error('Erro ao compartilhar planilha');
          });
      } catch {
        setSharingPlanilha(false);
        toast.error('Erro ao gerar planilha');
      }
    };

    if (cached) {
      runShare(cached.tipos, cached.custos);
      return;
    }

    // Cache frio (diálogo recém-aberto): busca os dados e compartilha em seguida.
    void loadSpreadsheetData(key)
      .then(({ tipos, custos }) => {
        spreadsheetCache.current = { key, tipos, custos };
        runShare(tipos, custos);
      })
      .catch(() => {
        setSharingPlanilha(false);
        toast.error('Erro ao preparar planilha');
      });
  };

  /** Lê do servidor se o envio de e-mail está disponível e quem é o destinatário. */
  const loadEmailConfig = useCallback(async () => {
    setEmailLoading(true);
    try {
      const config = await fetchEmailConfig();
      setEmailConfig(config);
      // Só preenche quando o campo está vazio: não sobrescreve o que o usuário digitou.
      setEmailTo((current) => current || config.defaultTo || '');
    } catch {
      setEmailConfig({ enabled: false, provider: null, defaultTo: null });
    }
    setEmailLoading(false);
  }, []);

  /** Abre o diálogo de e-mail já com assunto e mensagem preenchidos. */
  const openEmailDialog = () => {
    const count = filteredItems.length;
    setEmailSubject(`Solicitação de rebaixa / perecíveis — ${new Date().toLocaleDateString('pt-BR')}`);
    setEmailText(`Segue a planilha de rebaixa com ${count} produto(s)`);
    setShowEmailDialog(true);
    void loadEmailConfig();
  };

  /**
   * Envia a planilha (.ods) por e-mail: os bytes vão ao servidor, que anexa o
   * arquivo e despacha pelo provedor configurado na Vercel.
   */
  const sendSpreadsheetByEmail = async () => {
    if (emailSending) return;
    if (filteredItems.length === 0) {
      toast.error('Nenhum produto na lista para enviar');
      return;
    }
    if (!emailTo.trim()) {
      toast.error('Informe o destinatário do e-mail');
      return;
    }
    setEmailSending(true);
    try {
      const cached = spreadsheetCache.current?.key === spreadsheetCodesKey
        ? spreadsheetCache.current
        : null;
      const { tipos, custos } = cached ?? await loadSpreadsheetData(spreadsheetCodesKey);
      if (!cached) spreadsheetCache.current = { key: spreadsheetCodesKey, tipos, custos };
      const ods = createValidadeOds(filteredItems, tipos, { custos });
      const result = await sendRebaixaEmail({
        to: emailTo.trim(),
        subject: emailSubject.trim(),
        text: emailText.trim(),
        filename: spreadSheetFileName(),
        content: ods,
        itens: filteredItems.length,
      });
      trackEvent('enviar_email_planilha', { formato: 'ods', itens: result.itens });
      toast.success(`E-mail enviado para ${result.to}`);
      setShowEmailDialog(false);
      setShowDownloadDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar e-mail');
    }
    setEmailSending(false);
  };

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] px-3 sm:px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <CalendarClock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            Validade
            {notifications.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs">
                <Bell className="h-3 w-3 mr-1" />
                {notifications.length}
              </Badge>
            )}
            {(user?.role === 'admin' || user?.role === 'encarregado') && (
              <Button variant="outline" size="icon" className="ml-2 h-8 w-8" onClick={() => setShowConsulta(true)} title="Consultar registros de validade" aria-label="Consultar registros de validade">
                <Filter className="h-4 w-4 text-foreground" />
              </Button>
            )}
            <Button variant="outline" size="icon" className="ml-1 h-8 w-8" onClick={() => setShowArrastao(true)} title="Arrastão" aria-label="Abrir Arrastão">
              <img src="https://img.icons8.com/?size=100&id=8068&format=png&color=000000" alt="" className="h-4 w-4" />
            </Button>

            <button
              type="button"
              className="ml-2 h-8 w-8 inline-flex flex-col items-center justify-center gap-0.5 rounded-md bg-white border border-border text-black cursor-pointer hover:bg-white/90 transition-colors shadow-sm"
              onClick={() => { setTempAlertDays(alertDays); setShowAlertConfig(true); }}
              title={`Alerta de validade: ${alertDays} dia(s)`}
              aria-label={`Configurar alerta de validade: ${alertDays} dia(s)`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold leading-none">{alertDays}d</span>
            </button>

            <Button
              variant="outline"
              size="icon"
              className="ml-1 h-8 w-8"
              onClick={() => {
                setShowDownloadDialog(true);
                // Carrega o jspdf agora para o compartilhamento do PDF não
                // depender de uma busca na hora do clique (o celular exige
                // que a folha abra dentro do gesto do usuário).
                void import('jspdf');
              }}
              disabled={downloadingPdf || downloadingPlanilha || loading}
              title="Exportar lista de validade"
              aria-label="Exportar lista de validade"
            >
              {downloadingPdf || downloadingPlanilha ? (
                <Loader2 className="h-4 w-4 animate-spin text-foreground" />
              ) : (
                <Share2 className="h-4 w-4 text-foreground" />
              )}
            </Button>
          </h2>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          {searchStatus !== 'found' && (
            <BarcodeScanner onDetected={(scannedCode) => { setCode(scannedCode); setSearchStatus('idle'); setProduct(null); setTimeout(() => searchProduct(scannedCode), 100); }} />
          )}
          <Input
            value={code}
            onChange={(e) => { if (searchStatus === 'found') return; setCode(e.target.value.replace(/\D/g, '')); if (searchStatus !== 'idle') { setSearchStatus('idle'); setProduct(null); } }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
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

        {/* Loading */}
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
                {[
                  { label: 'EAN', value: product.ean },
                  { label: 'Código', value: product.codigo },
                  { label: 'Descrição', value: product.descricao },
                  { label: 'Tipo', value: (product.tipo || '').trim().toUpperCase() || '—' },
                ].map((item) => (
                  <div key={item.label} className="bg-card px-4 sm:px-6 py-3 sm:py-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-foreground break-words">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 sm:px-6 py-3 sm:py-4">
                {isWeightProduct(product.tipo) ? (
                  <div className="w-full sm:w-[220px]">
                    <Select value={motivo} onValueChange={(value) => setMotivo(value as MotivoKg)}>
                      <SelectTrigger aria-label="Motivo" className="h-10">
                        <SelectValue placeholder="Selecione o motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIVOS_KG.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Input
                    type="date"
                    aria-label="Data de validade"
                    value={validade}
                    onChange={(e) => setValidade(e.target.value)}
                    className="max-w-[180px]"
                  />
                )}
                <Input
                  type="number"
                  min="0"
                  aria-label="Quantidade"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="max-w-[80px]"
                  inputMode="numeric"
                />
                <Button
                  onClick={handleAdd}
                  disabled={submitting || (isWeightProduct(product.tipo) ? !motivo : !validade)}
                  className="gap-2"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  Registrar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setCode(''); setProduct(null); setSearchStatus('idle'); setValidade(''); setMotivo(''); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications banner */}
        {notifications.length > 0 && (() => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expiringToday = notifications.filter(i => {
            const d = new Date(i.validade);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
          });
          const expiringSoon = notifications.filter(i => {
            const d = new Date(i.validade);
            d.setHours(0, 0, 0, 0);
            return d.getTime() > today.getTime();
          });
          return (
            <div className="mt-4 rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700">
                  <Bell className="h-4 w-4" />
                </div>
                <span className="font-semibold text-red-700 text-sm">Alertas de Validade</span>
              </div>
              {expiringToday.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5">
                    Vencem HOJE • {expiringToday.length} item{expiringToday.length > 1 ? 's' : ''}
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
                    {expiringToday.slice(0, 5).map(i => (
                      <li key={i.id}><span className="font-medium text-foreground">{i.descricao}</span> <span className="text-muted-foreground">• Qtd: {i.quantidade}</span></li>
                    ))}
                    {expiringToday.length > 5 && <li className="text-muted-foreground">e mais {expiringToday.length - 5}...</li>}
                  </ul>
                </div>
              )}
              {expiringSoon.length > 0 && (
                <div className="rounded-xl border border-rose-100 bg-white p-3 flex items-start gap-2">
                  <span className="mt-0.5">🟡</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {expiringSoon.length} produto{expiringSoon.length > 1 ? 's' : ''} {expiringSoon.length > 1 ? 'vencem' : 'vence'} em até {alertDays} dia{alertDays > 1 ? 's' : ''}.
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Filter buttons */}
        <div className="mt-6 flex flex-wrap gap-2">
          {filterOptions.map((opt) => (
            <Button
              key={opt.key}
              variant={filter === opt.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(opt.key)}
              className="text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Items list */}
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-3 p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-muted-foreground">Carregando...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center sm:p-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <CalendarClock className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">Nenhum produto por aqui</p>
                <p className="text-sm text-muted-foreground">
                  {filter === 'todos'
                    ? 'Adicione um produto pela busca acima para começar.'
                    : `Nenhum produto no filtro "${FILTER_LABELS[filter]}".`}
                </p>
              </div>
              {filter !== 'todos' && (
                <Button variant="outline" size="sm" onClick={() => setFilter('todos')}>
                  Ver todos os produtos
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const status = item.motivo
                  ? { label: item.motivo, variant: 'secondary' as const, icon: Scale }
                  : getValidadeStatus(item.validade);
                const StatusIcon = status.icon;
                const isExpiredOrToday = status.label === 'Vencido' || status.label === 'Vence Hoje';
                const isExpiringSoon = status.icon === Clock; // 2 days or less
                const isUrgent = isExpiredOrToday || isExpiringSoon;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group flex items-stretch overflow-hidden rounded-lg border bg-card transition-colors",
                      isUrgent
                        ? "border-2 border-red-400/70 bg-white shadow-sm"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setDetailItem(item)}
                      aria-label={`Ver detalhes de ${item.descricao}`}
                      title="Ver detalhes"
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/60 sm:px-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-foreground">
                            {item.descricao}
                          </p>
                          <Badge variant={status.variant} className="shrink-0 gap-1 px-1.5 py-0 text-[10px] leading-5">
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:text-xs">
                          <span className="font-mono">{item.ean}</span>
                          <span>
                            Qtd: <span className="font-semibold text-foreground">{item.quantidade}</span>
                          </span>
                          {item.motivo ? (
                            <span className="font-semibold text-foreground">{item.motivo}</span>
                          ) : (
                            <span className="font-semibold text-foreground">
                              {new Date(item.validade).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                    {(isAdmin || canSendToRebaixa) && (
                      <div className="flex shrink-0 flex-col justify-center gap-0.5 border-l border-border/60 bg-muted/20 px-1">
                        {canSendToRebaixa && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                            onClick={() => void sendToRebaixa(item)}
                            aria-label={`Enviar ${item.descricao} para a rebaixa`}
                            title="Enviar para rebaixa"
                          >
                            <Tag className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary hover:bg-primary/10 hover:text-primary"
                              onClick={() => openEdit(item)}
                              aria-label={`Editar ${item.descricao}`}
                              title="Editar validade"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Remover ${item.descricao}`}
                                  title="Remover da validade"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover item?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Deseja remover "{item.descricao}" do controle de validade?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleRemove(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Remover
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Consulta por Período - admin/encarregado only */}
        <Dialog open={showConsulta} onOpenChange={setShowConsulta}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Consulta por Período</DialogTitle>
            </DialogHeader>
            <ConsultaValidadeView />
          </DialogContent>
        </Dialog>

        <ArrastaoView open={showArrastao} onOpenChange={setShowArrastao} onFinalizeRefresh={fetchItems} />



        {/* Export Format Dialog */}
        <Dialog
          open={showDownloadDialog}
          onOpenChange={(open) => { if (!downloadingPlanilha && !sharingPlanilha) setShowDownloadDialog(open); }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Baixar lista de validade</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              Escolha o formato do arquivo. Serão exportados{' '}
              <span className="font-semibold text-foreground">{filteredItems.length}</span>{' '}
              produto(s) do filtro "{FILTER_LABELS[filter]}".
              <span className="mt-1 block text-xs">
                No celular, <span className="font-medium text-foreground">Compartilhar</span> abre
                o menu do sistema com a planilha anexada. Escolha o{' '}
                <span className="font-medium text-foreground">Thunderbird</span> para enviar por
                e-mail (o assunto e o texto já vão preenchidos). O anexo vai em CSV, que abre
                direto no LibreOffice Calc e no Excel — o Chrome não aceita anexar .ods.
              </span>
            </DialogDescription>
            <div className="grid gap-2 py-1">
              <button
                type="button"
                onClick={downloadSpreadsheet}
                disabled={downloadingPlanilha}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
              >
                <FileSpreadsheet className="h-6 w-6 shrink-0 text-emerald-600" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">Planilha (ODS)</span>
                  <span className="text-xs text-muted-foreground">Com fórmulas e cores — LibreOffice Calc</span>
                </span>
                {downloadingPlanilha && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" />}
              </button>
              <button
                type="button"
                onClick={downloadCsv}
                disabled={downloadingPlanilha}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
              >
                <FileSpreadsheet className="h-6 w-6 shrink-0 text-sky-600" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">Planilha (CSV)</span>
                  <span className="text-xs text-muted-foreground">Abre no Calc e no Excel — para anexar no e-mail</span>
                </span>
                {downloadingPlanilha && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" />}
              </button>
              <button
                type="button"
                onClick={() => { setShowDownloadDialog(false); void downloadPdf(); }}
                disabled={downloadingPdf}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
              >
                <FileText className="h-6 w-6 shrink-0 text-red-600" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">PDF</span>
                  <span className="text-xs text-muted-foreground">Relatório com filtro, totais e status</span>
                </span>
                {downloadingPdf && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" />}
              </button>
              {canSendEmail && (
                <button
                  type="button"
                  onClick={() => { setShowDownloadDialog(false); openEmailDialog(); }}
                  disabled={downloadingPlanilha || sharingPlanilha || filteredItems.length === 0}
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
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => setShowDownloadDialog(false)}
                disabled={downloadingPlanilha || sharingPlanilha}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={shareSpreadsheet}
                disabled={downloadingPlanilha || sharingPlanilha || filteredItems.length === 0}
              >
                {downloadingPlanilha || sharingPlanilha
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Share2 className="mr-2 h-4 w-4" />}
                Compartilhar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Email Dialog */}
        <Dialog
          open={showEmailDialog}
          onOpenChange={(open) => { if (!emailSending) setShowEmailDialog(open); }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar planilha por e-mail</DialogTitle>
              <DialogDescription>
                A planilha <span className="font-medium text-foreground">.ods</span> (com fórmulas e cores) é
                gerada aqui e anexada pelo servidor, que faz o envio. Destinatário, assunto e
                mensagem podem ser ajustados.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div>
                <label htmlFor="rebaixa-email-to" className="text-sm font-medium">Para</label>
                <Input
                  id="rebaixa-email-to"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="email@empresa.com"
                  className="mt-1"
                  inputMode="email"
                  autoComplete="off"
                  disabled={emailSending}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Separe vários destinatários por vírgula.
                </p>
              </div>
              <div>
                <label htmlFor="rebaixa-email-subject" className="text-sm font-medium">Assunto</label>
                <Input
                  id="rebaixa-email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="mt-1"
                  disabled={emailSending}
                />
              </div>
              <div>
                <label htmlFor="rebaixa-email-text" className="text-sm font-medium">Mensagem</label>
                <textarea
                  id="rebaixa-email-text"
                  value={emailText}
                  onChange={(e) => setEmailText(e.target.value)}
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
              {emailConfig && !emailConfig.enabled && !emailLoading && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  O envio de e-mail não está configurado no servidor. Defina{' '}
                  <span className="font-mono">RESEND_API_KEY</span> ou{' '}
                  <span className="font-mono">SMTP_HOST</span> (e{' '}
                  <span className="font-mono">REBAIXA_EMAIL_FROM</span>,{' '}
                  <span className="font-mono">REBAIXA_EMAIL_TO</span>) nas variáveis de ambiente da
                  Vercel. Enquanto isso, use Compartilhar ou o download da planilha.
                </p>
              )}
            </div>
            <DialogFooter className="flex-row justify-end gap-2">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => setShowEmailDialog(false)}
                disabled={emailSending}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={sendSpreadsheetByEmail}
                disabled={emailSending || emailLoading || !emailTo.trim() || filteredItems.length === 0}
              >
                {emailSending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Mail className="mr-2 h-4 w-4" />}
                Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Alert Days Config Dialog */}
        <Dialog open={showAlertConfig} onOpenChange={setShowAlertConfig}>
          <DialogContent className="max-w-[92vw] sm:max-w-md md:max-w-lg p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>Configurar Alerta de Validade</DialogTitle>
            </DialogHeader>
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Alerta de Validade</h3>
                    <p className="text-sm text-muted-foreground">Notificações de produtos</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowAlertConfig(false)} className="h-8 w-8" aria-label="Fechar">
                  <span aria-hidden>×</span>
                </Button>
              </div>

              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Defina com quantos dias de antecedência o sistema deve emitir alertas sobre produtos próximos ao vencimento.
                </p>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Dias de antecedência</label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={tempAlertDays}
                      onChange={(e) => setTempAlertDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="pl-9 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">dias</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[2, 3, 5].map((d) => (
                      <Button key={d} variant="outline" size="sm" onClick={() => setTempAlertDays(d)}>
                        {d} dias
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowAlertConfig(false)}>Cancelar</Button>
                  <Button onClick={() => {
                    setAlertDays(tempAlertDays);
                    try { localStorage.setItem('validade_alert_days', String(tempAlertDays)); } catch { /* ignore storage errors */ }
                    setShowAlertConfig(false);
                    fetchItems();
                    toast.success(`Alerta configurado para ${tempAlertDays} dia(s)`);
                  }}>
                    Salvar
                    <Check className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>



      {/* Detail Dialog */}
      <Dialog open={!!detailItem} onOpenChange={(open) => { if (!open) setDetailItem(null); }}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          {detailItem && (() => {
            const status = detailItem.motivo
              ? { label: detailItem.motivo, variant: 'secondary' as const, icon: Brush }
              : getValidadeStatus(detailItem.validade);
            const StatusIcon = status.icon;
            const urgent = !detailItem.motivo && (status.label === 'Vencido' || status.label === 'Vence Hoje');
            return (
              <>
                <div className="border-b bg-gradient-to-br from-primary/[0.07] via-background to-background px-5 pb-4 pt-5">
                  <div className="flex items-start gap-3 pr-7">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
                      <ShoppingBasket className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-[15px] font-semibold leading-snug text-foreground">
                        {detailItem.descricao}
                      </DialogTitle>
                      <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
                        <span>{detailItem.ean}</span>
                        <span className="font-sans text-border">•</span>
                        <span>cód. {detailItem.codigo}</span>
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant={status.variant} className="gap-1 px-2 py-0.5 text-[11px] font-semibold">
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 px-5 py-4">
                  <div className="rounded-lg border bg-card px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Boxes className="h-3.5 w-3.5" />
                      Quantidade
                    </p>
                    <p className="mt-1 text-lg font-bold leading-none text-foreground">{detailItem.quantidade}</p>
                  </div>
                  <div className={cn('rounded-lg border bg-card px-3 py-2.5', urgent && 'border-red-200 bg-red-50/70')}>
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Validade
                    </p>
                    <p className={cn('mt-1 text-lg font-bold leading-none', urgent ? 'text-red-600' : 'text-foreground')}>
                      {new Date(detailItem.validade).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      Registrado por
                    </p>
                    <p className="truncate text-xs font-semibold text-foreground">{detailItem.created_by || '—'}</p>
                  </div>
                </div>

                <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {canSendToRebaixa && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { void sendToRebaixa(detailItem); setDetailItem(null); }}
                      >
                        <Tag className="h-3.5 w-3.5" />
                        Enviar para rebaixa
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { openEdit(detailItem); setDetailItem(null); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar validade
                      </Button>
                    )}
                  </div>
                  <Button size="sm" onClick={() => setDetailItem(null)}>Fechar</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Validade</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Produto</p>
                <p className="text-sm font-semibold">{editingItem.descricao}</p>
                <p className="text-xs text-muted-foreground">EAN: {editingItem.ean}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Nova Validade</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !editValidade && "text-muted-foreground")}>
                      <CalendarClock className="mr-2 h-4 w-4" />
                      {editValidade ? format(editValidade, "dd/MM/yyyy") : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editValidade} onSelect={setEditValidade} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium">Quantidade</label>
                <Input type="number" min="0" value={editQuantidade} onChange={(e) => setEditQuantidade(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" className="mt-1" inputMode="numeric" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={editSubmitting || !editValidade}>
              {editSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ValidadeView;
