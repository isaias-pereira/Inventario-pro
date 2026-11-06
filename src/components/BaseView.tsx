import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useData, Product } from '@/contexts/DataContext';
import { useMetas, MetaItem, VendaItem } from '@/contexts/MetasContext';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, ArrowLeft, Save, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { invokeFunction } from '@/lib/api';
import {
  applyMapping,
  findHeaderRow,
  guessMapping,
  IMPORT_FIELDS,
  type ImportTarget,
  type ImportWarning,
} from '@/lib/ai-import';

interface BaseViewProps {
  onBack: () => void;
}

interface UploadState {
  fileName: string;
  status: 'idle' | 'success' | 'error';
  msg: string;
}

const initialUpload: UploadState = { fileName: '', status: 'idle', msg: '' };

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/** Rótulos dos alvos de importação (usados na prévia). */
const TARGET_LABELS: Record<ImportTarget, string> = {
  consulta: 'Planilha de Consulta',
  meta: 'Planilha de Meta',
  venda: 'Planilha de Realizado',
};

/** Estado da prévia mostrada antes de gravar. */
interface ReviewState {
  target: ImportTarget;
  fileName: string;
  headers: string[];
  mapping: Record<string, number>;
  itens: unknown[];
  avisos: ImportWarning[];
  ignoradas: number;
  aiAvisos: string[];
  usadoIA: boolean;
}

const BaseView = ({ onBack }: BaseViewProps) => {
  const { saveProducts, hasData, products } = useData();
  const { setMetaItems, metaItems, setVendaItems, vendaItems, saveMetaToDB, saveRealizadoToDB, selectedMonth, selectedYear, setSelectedMonth } = useMetas();
  const { getToken, isAdmin } = useAuth();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const consultaRef = useRef<HTMLInputElement>(null);
  const metaRef = useRef<HTMLInputElement>(null);
  const vendaRef = useRef<HTMLInputElement>(null);

  const [consultaUp, setConsultaUp] = useState<UploadState>(initialUpload);
  const [metaUp, setMetaUp] = useState<UploadState>(initialUpload);
  const [vendaUp, setVendaUp] = useState<UploadState>(initialUpload);
  const [savingRealizado, setSavingRealizado] = useState(false);
  /** A IA está configurada neste ambiente? (sem IA, o mapeamento automático assume) */
  const [aiEnabled, setAiEnabled] = useState(false);
  /** Prévia da importação (aguarda confirmação antes de gravar). */
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    let active = true;
    const token = getToken();
    void invokeFunction('ai-assist', {
      body: { action: 'config' },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    })
      .then(({ data, error }) => {
        if (active && !error) setAiEnabled(Boolean(data?.enabled));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [getToken]);

  const readFile = (file: File, callback: (rows: unknown[][]) => void, setUpload: React.Dispatch<React.SetStateAction<UploadState>>) => {
    setUpload({ fileName: file.name, status: 'idle', msg: '' });
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length === 0) {
          setUpload(prev => ({ ...prev, status: 'error', msg: 'O arquivo está vazio.' }));
          return;
        }
        callback(rows);
      } catch {
        setUpload(prev => ({ ...prev, status: 'error', msg: 'Erro ao ler o arquivo.' }));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /**
   * Monta a prévia da importação: identifica o cabeçalho, monta o mapeamento
   * (a IA refine quando existe) e aponta as linhas suspeitas.
   */
  const openReview = async (target: ImportTarget, rows: unknown[][], fileName: string) => {
    const headerIndex = findHeaderRow(rows, target);
    const headers = headerIndex >= 0
      ? (rows[headerIndex] ?? []).map((cell) => String(cell ?? '').trim())
      : (rows[0] ?? []).map((_, index) => `Coluna ${index + 1}`);
    const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;

    let mapping = guessMapping(target, headers);
    let aiAvisos: string[] = [];
    let usadoIA = false;

    if (aiEnabled) {
      setReviewing(true);
      try {
        const token = getToken();
        const samples = dataRows.slice(0, 6).map((row) => row.map((cell) => String(cell ?? '')));
        const { data, error } = await invokeFunction<{ mapping?: Record<string, number>; avisos?: string[] }>('ai-assist', {
          body: { action: 'import_review', target, headers, samples },
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        });
        if (!error && data?.mapping && Object.keys(data.mapping).length > 0) {
          mapping = { ...mapping, ...data.mapping };
          aiAvisos = Array.isArray(data.avisos) ? data.avisos : [];
          usadoIA = true;
        }
      } catch {
        // Sem revisão da IA: o mapeamento automático continua valendo.
      } finally {
        setReviewing(false);
      }
    }

    const result = applyMapping(target, dataRows, mapping);
    setReview({
      target,
      fileName,
      headers,
      mapping,
      itens: result.itens,
      avisos: result.avisos,
      ignoradas: result.ignoradas,
      aiAvisos,
      usadoIA,
    });
  };

  /** Confirma a prévia e grava (regras iguais às de antes da revisão). */
  const confirmReview = async () => {
    if (!review) return;
    const { target, itens, fileName } = review;
    const count = itens.length;

    if (target === 'consulta') {
      await saveProducts(itens as Product[]);
      setConsultaUp(prev => ({ ...prev, fileName, status: 'success', msg: `${count} produto(s) carregado(s)!` }));
    } else if (target === 'meta') {
      const parsed = itens as MetaItem[];
      setMetaItems(parsed);
      const token = getToken();
      if (token) {
        try {
          await saveMetaToDB(token, selectedYear, selectedMonth, parsed);
          setMetaUp(prev => ({ ...prev, fileName, status: 'success', msg: `${count} dia(s) de meta salvos no banco para ${MESES[selectedMonth - 1]}!` }));
        } catch {
          setMetaUp(prev => ({ ...prev, fileName, status: 'error', msg: 'Meta carregada localmente, mas falhou ao salvar no banco.' }));
        }
      } else {
        setMetaUp(prev => ({ ...prev, fileName, status: 'success', msg: `${count} dia(s) de meta carregado(s)!` }));
      }
    } else {
      setVendaItems(itens as VendaItem[]);
      setVendaUp(prev => ({ ...prev, fileName, status: 'success', msg: `${count} dia(s) de venda carregado(s)!` }));
    }

    setReview(null);
  };

  const processConsulta = (file: File) => readFile(file, (rows) => {
    void openReview('consulta', rows, file.name);
  }, setConsultaUp);

  const processMeta = (file: File) => readFile(file, (rows) => {
    void openReview('meta', rows, file.name);
  }, setMetaUp);

  const processVenda = (file: File) => readFile(file, (rows) => {
    void openReview('venda', rows, file.name);
  }, setVendaUp);

  const handleSaveRealizado = async () => {
    if (vendaItems.length === 0) {
      toast.error('Nenhum dado de realizado para salvar.');
      return;
    }
    const token = getToken();
    if (!token) { toast.error('Não autenticado.'); return; }
    setSavingRealizado(true);
    try {
      await saveRealizadoToDB(token, selectedYear, selectedMonth, vendaItems);
      toast.success(`Realizado salvo para ${MESES[selectedMonth - 1]}!`);
    } catch {
      toast.error('Erro ao salvar realizado no banco.');
    } finally {
      setSavingRealizado(false);
    }
  };

  const renderUpload = (
    title: string,
    desc: string,
    fileRef: React.RefObject<HTMLInputElement>,
    state: UploadState,
    onProcess: (f: File) => void,
    count: number,
    countLabel: string,
    extraAction?: React.ReactNode
  ) => (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">{title}</h3>
        {extraAction}
      </div>
      <p className="mb-3 sm:mb-4 text-xs sm:text-sm text-muted-foreground">{desc}</p>
      <div
        onClick={() => fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-2 sm:gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-5 sm:p-8 transition-colors hover:border-primary hover:bg-muted/50"
      >
        <Upload className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm sm:text-base font-medium text-foreground">Clique para selecionar</p>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">.CSV, .XLS, .XLSX, .ODS</p>
        </div>
        {state.fileName && (
          <div className="flex items-center gap-2 rounded-lg bg-background px-3 sm:px-4 py-2 text-xs sm:text-sm text-foreground shadow-sm">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span className="truncate max-w-[200px]">{state.fileName}</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx,.ods" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onProcess(f); e.target.value = ''; }} />
      {state.status === 'success' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-success/10 p-3 text-xs sm:text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />{state.msg}
        </div>
      )}
      {state.status === 'error' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs sm:text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />{state.msg}
        </div>
      )}
      {count > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <p className="text-xs sm:text-sm text-muted-foreground">{countLabel}: <strong className="text-foreground">{count}</strong></p>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-4 py-6 sm:py-10">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />Voltar
      </Button>

      <h2 className="mb-1 text-xl sm:text-2xl font-bold text-foreground">Base de Dados</h2>
      <p className="mb-4 sm:mb-6 text-xs sm:text-sm text-muted-foreground">Importe planilhas para os módulos do sistema</p>

      <div className="flex flex-col gap-4 sm:gap-6">
        {renderUpload('Planilha de Consulta', 'Colunas: código, descrição, estoque, preço', consultaRef, consultaUp, processConsulta, hasData ? products.length : 0, 'Produtos carregados')}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
            <h3 className="text-lg font-semibold text-foreground">📊 Metas</h3>
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-[160px] h-8 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nome, i) => {
                  const mes = i + 1;
                  const isFuture = selectedYear === currentYear && mes > currentMonth;
                  return (
                    <SelectItem key={mes} value={String(mes)} disabled={isFuture}>
                      {nome}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-4">
            {renderUpload(
              'Planilha de Meta',
              `Colunas: dia, meta (valor R$) — ${MESES[selectedMonth - 1]}`,
              metaRef, metaUp, processMeta, metaItems.length, 'Dias de meta'
            )}
            {renderUpload(
              'Planilha de Realizado',
              `Colunas: dia, venda (valor R$) — ${MESES[selectedMonth - 1]}`,
              vendaRef, vendaUp, processVenda, vendaItems.length, 'Dias de venda',
              isAdmin && vendaItems.length > 0 ? (
                <button
                  onClick={handleSaveRealizado}
                  disabled={savingRealizado}
                  className="flex items-center gap-1.5 text-xs sm:text-sm text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                  title="Salvar realizado no banco de dados"
                >
                  {savingRealizado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>Salvar</span>
                </button>
              ) : undefined
            )}
          </div>
        </div>
      </div>

      {/* Prévia da importação: nada é gravado antes da confirmação. */}
      <Dialog open={!!review} onOpenChange={(open) => { if (!open) setReview(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Revisar importação
            </DialogTitle>
            <DialogDescription>
              {review ? `${TARGET_LABELS[review.target]} — ${review.fileName}` : ''}
            </DialogDescription>
          </DialogHeader>

          {review && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs sm:text-sm">
                <p className="mb-1 font-medium text-foreground">Colunas identificadas</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {IMPORT_FIELDS[review.target].map((field) => {
                    const index = review.mapping[field.key];
                    return (
                      <li key={field.key}>
                        <span className="text-foreground">{field.label}:</span>{' '}
                        {index == null
                          ? 'não encontrada'
                          : `${review.headers[index] || `Coluna ${index + 1}`}`}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-muted-foreground">
                  {review.usadoIA
                    ? 'Mapeamento revisado pela IA.'
                    : 'Mapeamento automático (a IA não está configurada neste ambiente).'}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-background p-3 text-xs sm:text-sm">
                <p>
                  <span className="font-medium text-foreground">{review.itens.length}</span> item(ns) prontos para importar
                  {review.ignoradas > 0 && <span className="text-muted-foreground"> · {review.ignoradas} linha(s) ignorada(s)</span>}
                </p>
              </div>

              {review.aiAvisos.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs sm:text-sm">
                  <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />Observações da IA
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                    {review.aiAvisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
                  </ul>
                </div>
              )}

              {review.avisos.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs sm:text-sm">
                  <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                    {review.avisos.length} aviso(s) na planilha
                  </p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {review.avisos.slice(0, 30).map((aviso, index) => (
                      <li key={`${aviso.linha ?? 'x'}-${index}`} className={aviso.nivel === 'erro' ? 'text-destructive' : ''}>
                        {aviso.linha ? `Linha ${aviso.linha}: ` : ''}{aviso.mensagem}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReview(null)} disabled={reviewing}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmReview()} disabled={reviewing || !review || review.itens.length === 0}>
              {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Importar {review ? review.itens.length : 0} item(ns)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BaseView;
