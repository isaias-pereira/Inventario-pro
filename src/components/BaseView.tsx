import { useState, useRef } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useData, Product } from '@/contexts/DataContext';
import { useMetas, MetaItem, VendaItem } from '@/contexts/MetasContext';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

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

  const processConsulta = (file: File) => readFile(file, (rows) => {
    const parsed: Product[] = [];
    for (const row of rows) {
      if (!row || row.length < 4 || (!row[0] && !row[1])) continue;
      parsed.push({ codigo: String(row[0]).trim(), descricao: String(row[1]).trim(), estoque: Number(row[2]) || 0, preco: Number(row[3]) || 0 });
    }
    if (!parsed.length) { setConsultaUp(prev => ({ ...prev, status: 'error', msg: 'Nenhum dado válido. Colunas: código, descrição, estoque, preço.' })); return; }
    saveProducts(parsed);
    setConsultaUp(prev => ({ ...prev, status: 'success', msg: `${parsed.length} produto(s) carregado(s)!` }));
  }, setConsultaUp);

  const parseDia = (val: unknown): number => {
    if (val instanceof Date) return val.getDate();
    const n = Number(val);
    if (n > 31) {
      // Excel serial date — convert
      const d = new Date((n - 25569) * 86400000);
      return d.getDate();
    }
    return Math.round(n);
  };

  const processMeta = (file: File) => readFile(file, async (rows) => {
    const parsed: MetaItem[] = [];
    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const dia = parseDia(row[0]);
      const meta = Number(row[1]);
      if (dia > 0 && dia <= 31 && meta >= 0) parsed.push({ dia, meta });
    }
    if (!parsed.length) { setMetaUp(prev => ({ ...prev, status: 'error', msg: 'Nenhum dado válido. Colunas: dia, meta.' })); return; }
    
    setMetaItems(parsed);
    
    const token = getToken();
    if (token) {
      try {
        await saveMetaToDB(token, selectedYear, selectedMonth, parsed);
        setMetaUp(prev => ({ ...prev, status: 'success', msg: `${parsed.length} dia(s) de meta salvos no banco para ${MESES[selectedMonth - 1]}!` }));
      } catch {
        setMetaUp(prev => ({ ...prev, status: 'error', msg: 'Meta carregada localmente, mas falhou ao salvar no banco.' }));
      }
    } else {
      setMetaUp(prev => ({ ...prev, status: 'success', msg: `${parsed.length} dia(s) de meta carregado(s)!` }));
    }
  }, setMetaUp);

  const processVenda = (file: File) => readFile(file, (rows) => {
    const parsed: VendaItem[] = [];
    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const dia = parseDia(row[0]);
      const venda = Number(row[1]);
      if (dia > 0 && dia <= 31 && venda >= 0) parsed.push({ dia, venda });
    }
    if (!parsed.length) { setVendaUp(prev => ({ ...prev, status: 'error', msg: 'Nenhum dado válido. Colunas: dia, venda.' })); return; }
    setVendaItems(parsed);
    setVendaUp(prev => ({ ...prev, status: 'success', msg: `${parsed.length} dia(s) de venda carregado(s)!` }));
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
    </div>
  );
};

export default BaseView;
