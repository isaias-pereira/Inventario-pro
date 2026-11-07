import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { invokeFunction } from '@/lib/api';
import { formatQuantity, packagingLabel } from '@/lib/packaging';
import BarcodeScanner from '@/components/BarcodeScanner';
import { toast } from 'sonner';
import { PackagePlus, Pencil, Search, Plus, Trash2, Save, Boxes, Loader2, Camera } from 'lucide-react';
import { prepareImage } from '@/lib/ai-image';
import { labelToProductFields } from '@/lib/ai-label';
import { trackEvent } from '@/lib/analytics';

interface PackagingInfo {
  ean_fechado: string;
  tipo_embalagem: string;
  quantidade_fechada: number;
  descricao?: string | null;
}

interface ExistingProduct {
  ean: string | null;
  codigo: string;
  descricao: string;
  tipo?: string | null;
  codigos?: string[];
  eans?: string[];
  embalagens?: PackagingInfo[];
}
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 14);

/** Mantém apenas dígitos, um separador decimal e até 3 casas. */
const decimal = (value: string) => {
  let next = value.replace(/[^0-9.,]/g, '').replace(',', '.');
  const parts = next.split('.');
  if (parts.length > 2) next = parts[0] + '.' + parts.slice(1).join('');
  if (parts.length === 2 && parts[1].length > 3) next = parts[0] + '.' + parts[1].slice(0, 3);
  return next;
};

async function productRequest(body: Record<string, unknown>) {
  const token = localStorage.getItem('estoque_pro_token');
  const { data, error } = await invokeFunction('query-product', {
    body, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

const AddProductView = () => {
  const [mode, setMode] = useState<'add' | 'edit'>('add');
  const [search, setSearch] = useState('');
  const [ean, setEan] = useState('');
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState('');
  const [linkedEans, setLinkedEans] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [existing, setExisting] = useState<ExistingProduct | null>(null);
  const [editing, setEditing] = useState<ExistingProduct | null>(null);
  /** Leitura da etiqueta por foto (IA): carregando e campo de arquivo. */
  const [scanningLabel, setScanningLabel] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Modo embalagem fechada (CX/FD/SC)
  const [closedMode, setClosedMode] = useState(false);
  const [eanFechado, setEanFechado] = useState('');
  const [packagingType, setPackagingType] = useState('');
  const [quantidadeFechada, setQuantidadeFechada] = useState('');
  const [packagingFormOpen, setPackagingFormOpen] = useState(false);
  const [productLookup, setProductLookup] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'found'; descricao: string; codigo: string }
    | { status: 'not_found' }
    | { status: 'error' }
  >({ status: 'idle' });
  const lookupSeq = useRef(0);

  const resetPackagingForm = () => {
    setEanFechado(''); setPackagingType(''); setQuantidadeFechada(''); setPackagingFormOpen(false);
  };

  const clearFields = () => {
    setEan(''); setCodigo(''); setDescricao(''); setTipo(''); setLinkedEans([]);
    setExisting(null); setEditing(null); setClosedMode(false); resetPackagingForm();
  };
  const changeMode = (next: 'add' | 'edit') => {
    clearFields(); setSearch(''); setMode(next); setConfirmOpen(false);
  };
  const loadProduct = (product: ExistingProduct) => {
    setEditing(product);
    setCodigo(String(product.codigo)); setDescricao((product.descricao || '').toUpperCase());
    setTipo((product.tipo || '').toUpperCase());
    const eans = product.eans?.map(String) || (product.ean ? [String(product.ean)] : []);
    const primary = product.ean ? String(product.ean) : eans[0] || '';
    setEan(primary);
    setLinkedEans(eans.filter(value => value !== primary));
    resetPackagingForm();
  };
  const searchProduct = async (value: string) => {
    if (!value.trim()) { toast.error('Informe o código ou EAN'); return; }
    setLoading(true); clearFields();
    try {
      const data = await productRequest({ action: 'edit_lookup', codigo: value.trim() });
      if (!data?.found) { toast.error('Produto não encontrado'); return; }
      loadProduct(data.product);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Erro ao consultar produto'); }
    finally { setLoading(false); }
  };
  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await searchProduct(search);
  };

  // Busca assíncrona do produto pelo EAN digitado no modo embalagem fechada.
  useEffect(() => {
    const seq = ++lookupSeq.current;
    const value = ean.trim();
    if (mode !== 'add' || !closedMode || !value) {
      setProductLookup({ status: 'idle' });
      return;
    }
    setProductLookup({ status: 'loading' });
    const timer = window.setTimeout(async () => {
      try {
        const data = await productRequest({ codigo: value });
        if (seq !== lookupSeq.current) return;
        if (data?.found && data.product?.descricao) {
          setProductLookup({
            status: 'found',
            descricao: String(data.product.descricao),
            codigo: String(data.product.codigo),
          });
        } else {
          setProductLookup({ status: 'not_found' });
        }
      } catch {
        if (seq !== lookupSeq.current) return;
        setProductLookup({ status: 'error' });
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ean, mode, closedMode]);

  /**
   * Lê a etiqueta pela foto (IA) e preenche o formulário de produto.
   *
   * A IA só preenche: a pessoa confere EAN, código, descrição e tipo antes
   * de salvar. Sem IA configurada, o cadastro continua manual.
   */
  const handleLabelPhoto = async (file: File) => {
    if (scanningLabel) return;
    setScanningLabel(true);
    // A leitura leva de 15 s a ~40 s (o modelo raciocina antes de responder).
    toast.info('Lendo a etiqueta… isso pode levar até 40 segundos.');
    try {
      const image = await prepareImage(file);
      const token = localStorage.getItem('estoque_pro_token');
      const { data, error } = await invokeFunction('ai-assist', {
        body: { action: 'read_label', image: image.base64, mimeType: image.mimeType },
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });
      if (error || !data) {
        const status = (error as { context?: { status?: number } } | null)?.context?.status;
        toast.error(
          status === 504
            ? 'A IA demorou demais para ler a foto. Tente uma foto mais próxima e mais nítida.'
            : error?.message || 'Não foi possível ler a etiqueta.',
        );
        return;
      }

      const fields = labelToProductFields(data.label, data.produto);
      if (fields.ean) setEan(fields.ean);
      if (fields.codigo) setCodigo(fields.codigo);
      if (fields.descricao) setDescricao(fields.descricao);
      if (fields.tipo) setTipo(fields.tipo);
      setExisting(null);
      setConfirmOpen(false);
      trackEvent('scanear_etiqueta', { resultado: 'preenchido' });
      toast.success('Etiqueta lida — confira os dados antes de salvar.');

      // Avisos da leitura (o "produto não está no catálogo" é o caso normal
      // aqui: está-se cadastrando um produto novo).
      const avisos = Array.isArray(data.avisos) ? (data.avisos as string[]) : [];
      for (const aviso of avisos) {
        if (!/não encontrado no catálogo/i.test(aviso)) toast.warning(aviso);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao ler a etiqueta');
    } finally {
      setScanningLabel(false);
    }
  };

  const performInsert = async () => {
    setLoading(true);
    try {
      const data = await productRequest({ action: 'insert', ean: ean.trim(), codigo: codigo.trim(), descricao: descricao.trim(), tipo: tipo.trim() });
      if (data?.action === 'ean_linked') {
        toast.success(data.alreadyLinked ? 'EAN já estava vinculado' : 'EAN vinculado com sucesso!', { description: `EAN ${ean.trim()} → código ${data.product?.codigo} (${data.product?.descricao ?? ''}).` });
      } else if (data?.action === 'linked') {
        toast.success('Código vinculado ao produto existente!', { description: `Código ${codigo.trim()} → ${data.product?.descricao ?? ''}.` });
      } else { toast.success('Produto criado com sucesso!'); }
      clearFields();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Erro ao adicionar produto'); }
    finally { setLoading(false); setConfirmOpen(false); }
  };

  const handleAddPackaging = async () => {
    const productEan = mode === 'edit' && editing ? String(editing.codigo) : ean.trim();
    if (!productEan) { toast.error('Informe o EAN do produto'); return; }
    if (!eanFechado.trim() || !packagingType || quantidadeFechada.trim() === '') {
      toast.error('Preencha o EAN fechado, o tipo e a quantidade fechada');
      return;
    }
    setLoading(true);
    try {
      const data = await productRequest({
        action: 'add_packaging',
        ean: productEan,
        eanFechado: eanFechado.trim(),
        tipo: packagingType,
        quantidadeFechada,
      });
      if (mode === 'edit' && editing) {
        setEditing(prev => prev ? { ...prev, embalagens: data.product?.embalagens ?? prev.embalagens } : prev);
        toast.success('Embalagem vinculada com sucesso!');
        resetPackagingForm();
      } else {
        toast.success('Embalagem vinculada com sucesso!', {
          description: `${packagingType} ×${formatQuantity(Number(quantidadeFechada.replace(',', '.')))} → ${data.product?.descricao ?? ''}.`,
        });
        clearFields();
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Erro ao vincular embalagem'); }
    finally { setLoading(false); }
  };

  const handleRemovePackaging = async (packagingEan: string) => {
    setLoading(true);
    try {
      await productRequest({ action: 'remove_packaging', eanFechado: packagingEan });
      setEditing(prev => prev ? { ...prev, embalagens: (prev.embalagens || []).filter(item => item.ean_fechado !== packagingEan) } : prev);
      toast.success('Embalagem removida');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Erro ao remover embalagem'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'add' && closedMode) { await handleAddPackaging(); return; }
    if (!ean.trim() || !codigo.trim() || !descricao.trim()) { toast.error('Preencha EAN, código e descrição'); return; }
    if (mode === 'edit') {
      if (!editing) return;
      const eans = [ean, ...linkedEans].map(value => value.replace(/^0+(?=\d)/, ''));
      if (eans.some(value => !/^\d{1,14}$/.test(value))) { toast.error('Preencha todos os EANs com números'); return; }
      if (new Set(eans).size !== eans.length) { toast.error('Não repita EANs vinculados'); return; }
      setLoading(true);
      try {
        const data = await productRequest({ action: 'update', originalCodigo: String(editing.codigo), codigo, ean, eans, descricao, tipo });
        loadProduct(data.product); setSearch(String(data.product.codigo));
        toast.success('Produto atualizado com sucesso!');
      } catch (error) { toast.error(error instanceof Error ? error.message : 'Erro ao editar produto'); }
      finally { setLoading(false); }
      return;
    }
    setLoading(true);
    try {
      const data = await productRequest({ action: 'check', codigo: codigo.trim() });
      if (data?.exists) { setExisting(data.product); setConfirmOpen(true); setLoading(false); return; }
      await performInsert();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Erro ao verificar produto'); setLoading(false); }
  };

  const packagingFields = (
    <div className="space-y-3">
      <div>
        <label htmlFor="packaging-closed-ean" className="mb-1 block text-sm font-medium">EAN fechado</label>
        <div className="flex gap-2">
          <BarcodeScanner label="Escanear EAN fechado" onDetected={code => setEanFechado(digits(code))} disabled={loading} />
          <Input id="packaging-closed-ean" value={eanFechado} onChange={event => setEanFechado(digits(event.target.value))} inputMode="numeric" placeholder="Código da caixa, fardo ou saco" disabled={loading} className="min-w-0" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="packaging-type" className="mb-1 block text-sm font-medium">Tipo</label>
          <Select value={packagingType} onValueChange={setPackagingType} disabled={loading}>
            <SelectTrigger id="packaging-type" aria-label="Tipo da embalagem">
              <SelectValue placeholder="CX/FD/SC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CX">CX — Caixa</SelectItem>
              <SelectItem value="FD">FD — Fardo</SelectItem>
              <SelectItem value="SC">SC — Saco</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="packaging-quantity" className="mb-1 block text-sm font-medium">Quantidade fechada</label>
          <Input id="packaging-quantity" value={quantidadeFechada} onChange={event => setQuantidadeFechada(decimal(event.target.value))} inputMode="decimal" placeholder="Ex.: 10" disabled={loading} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A quantidade será convertida para un ou kg conforme o tipo do produto vinculado.
      </p>
    </div>
  );

  const packagingActions = (
    <div className="flex gap-2">
      <Button type="button" onClick={handleAddPackaging} disabled={loading} className="gap-2">
        <Plus />
        {loading ? 'Aguarde...' : 'Vincular embalagem'}
      </Button>
      <Button type="button" variant="ghost" onClick={resetPackagingForm} disabled={loading}>Cancelar</Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {mode === 'add' ? <PackagePlus className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
            {mode === 'add' ? 'Adicionar Produto' : 'Editar Produto'}
          </CardTitle>
          <div className="grid grid-cols-2 gap-2 pt-2" role="group" aria-label="Cadastro de produtos">
            <Button type="button" size="sm" variant={mode === 'add' ? 'default' : 'outline'} onClick={() => changeMode('add')} disabled={loading} aria-pressed={mode === 'add'}><PackagePlus />Adicionar</Button>
            <Button type="button" size="sm" variant={mode === 'edit' ? 'default' : 'outline'} onClick={() => changeMode('edit')} disabled={loading} aria-pressed={mode === 'edit'}><Pencil />Editar</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'edit' && (
            <form onSubmit={handleSearch} className="space-y-2">
              <label htmlFor="product-search" className="block text-sm font-medium">Código ou EAN</label>
              <div className="flex gap-2">
                <Input id="product-search" value={search} onChange={event => setSearch(digits(event.target.value))} inputMode="numeric" placeholder="Buscar produto" disabled={loading} className="min-w-0" />
                <BarcodeScanner
                  label="Escanear código do produto"
                  disabled={loading}
                  onDetected={(scannedCode) => {
                    const clean = digits(scannedCode);
                    setSearch(clean);
                    void searchProduct(clean);
                  }}
                />
                <Button type="submit" size="icon" variant="outline" disabled={loading} aria-label="Buscar produto" title="Buscar produto" className="shrink-0"><Search /></Button>
              </div>
            </form>
          )}
          {(mode === 'add' || editing) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="product-ean" className="text-sm font-medium">
                    {mode === 'add' && closedMode ? 'EAN do produto' : mode === 'edit' ? 'EAN principal' : 'EAN'}
                  </label>
                  {mode === 'add' && (
                    <label htmlFor="product-closed-mode" className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Checkbox
                        id="product-closed-mode"
                        checked={closedMode}
                        onCheckedChange={(value) => {
                          setClosedMode(value === true);
                          setExisting(null); setConfirmOpen(false); resetPackagingForm();
                        }}
                        disabled={loading}
                      />
                      Embalagem fechada
                      <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">CX/FD/SC</span>
                    </label>
                  )}
                </div>
                <div className="flex gap-2">
                  <BarcodeScanner label="Escanear EAN do produto" onDetected={code => setEan(digits(code))} disabled={loading} />
                  <Input id="product-ean" value={ean} onChange={event => setEan(digits(event.target.value))} inputMode="numeric" placeholder={mode === 'add' && closedMode ? 'EAN do produto que receberá a embalagem' : 'Código de barras (EAN)'} required disabled={loading} className="min-w-0" />
                </div>
                {mode === 'add' && closedMode && (
                  <div className="mt-1.5 text-xs" aria-live="polite">
                    {productLookup.status === 'loading' && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Buscando produto...
                      </p>
                    )}
                    {productLookup.status === 'found' && (
                      <p className="rounded-md bg-muted/60 px-2 py-1.5">
                        <span className="font-semibold text-foreground">Descrição:</span>{' '}
                        {productLookup.descricao}
                        <span className="ml-1 text-muted-foreground">(cód. {productLookup.codigo})</span>
                      </p>
                    )}
                    {productLookup.status === 'not_found' && (
                      <p className="text-destructive">Produto não encontrado para este EAN.</p>
                    )}
                    {productLookup.status === 'error' && (
                      <p className="text-destructive">Não foi possível consultar o produto agora.</p>
                    )}
                  </div>
                )}
              </div>

              {mode === 'add' && closedMode ? (
                <>
                  {packagingFields}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Aviso:</span> As embalagem (CX/FD/SC) fica separado do tipo do produto (KG/UN) do produto.
                  </div>
                </>
              ) : (
                <>
                  {mode === 'edit' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">EANs vinculados</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => setLinkedEans(values => [...values, ''])} disabled={loading || linkedEans.length >= 199} aria-label="Adicionar EAN vinculado" title="Adicionar EAN vinculado"><Plus /></Button>
                      </div>
                      {linkedEans.map((value, index) => (
                        <div key={index} className="flex gap-2">
                          <Input aria-label={`EAN vinculado ${index + 1}`} value={value} onChange={event => setLinkedEans(values => values.map((item, position) => position === index ? digits(event.target.value) : item))} inputMode="numeric" required disabled={loading} className="min-w-0" />
                          <Button type="button" size="icon" variant="outline" disabled={loading} onClick={() => setLinkedEans(values => values.filter((_, position) => position !== index))} aria-label={`Remover EAN vinculado ${index + 1}`} title="Remover EAN vinculado" className="shrink-0"><Trash2 /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label htmlFor="product-code" className="mb-1 block text-sm font-medium">Código</label>
                    <Input id="product-code" value={codigo} onChange={event => setCodigo(digits(event.target.value))} inputMode="numeric" placeholder="Código interno" required disabled={loading} />
                  </div>
                  <div>
                    <label htmlFor="product-description" className="mb-1 block text-sm font-medium">Descrição</label>
                    <Input id="product-description" value={descricao} onChange={event => setDescricao(event.target.value.toUpperCase().slice(0, 100))} maxLength={100} placeholder="DESCRIÇÃO DO PRODUTO" required disabled={loading} />
                  </div>
                  <div>
                    <label htmlFor="product-type" className="mb-1 block text-sm font-medium">Tipo</label>
                    <Select value={tipo} onValueChange={setTipo} disabled={loading}>
                      <SelectTrigger id="product-type" aria-label="Tipo do produto">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KG">KG</SelectItem>
                        <SelectItem value="UN">UN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {mode === 'edit' && editing && (
                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-medium"><Boxes className="h-4 w-4" />Embalagens fechadas</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => setPackagingFormOpen(open => !open)} disabled={loading} aria-label="Nova embalagem">
                          <Plus />
                          Nova
                        </Button>
                      </div>
                      {(editing.embalagens ?? []).length === 0 && !packagingFormOpen && (
                        <p className="text-xs text-muted-foreground">Nenhuma embalagem vinculada.</p>
                      )}
                      {(editing.embalagens ?? []).map(pack => {
                        const label = packagingLabel(pack.tipo_embalagem);
                        return (
                          <div key={pack.ean_fechado} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                                  {String(pack.tipo_embalagem).toUpperCase()} ×{formatQuantity(Number(pack.quantidade_fechada))}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">{pack.ean_fechado}</span>
                                <span className="text-xs text-muted-foreground">{label.singular}</span>
                              </p>
                              {pack.descricao && <p className="truncate text-xs text-muted-foreground">{pack.descricao}</p>}
                            </div>
                            <Button type="button" size="icon" variant="ghost" onClick={() => handleRemovePackaging(pack.ean_fechado)} disabled={loading} aria-label={`Remover embalagem ${pack.ean_fechado}`} title="Remover embalagem" className="shrink-0 text-destructive hover:text-destructive"><Trash2 /></Button>
                          </div>
                        );
                      })}
                      {packagingFormOpen && (
                        <div className="rounded-md border border-dashed p-3">
                          {packagingFields}
                          {packagingActions}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2">
                <Button type="submit" className="min-w-0 flex-1" disabled={loading}>
                  {mode === 'edit' ? <Save /> : <PackagePlus />}
                  {loading ? 'Aguarde...' : mode === 'edit' ? 'Salvar alterações' : closedMode ? 'Vincular embalagem' : 'Adicionar Produto'}
                </Button>
                {mode === 'add' && !closedMode && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => labelInputRef.current?.click()}
                    disabled={loading || scanningLabel}
                    title="Ler a etiqueta pela foto e preencher o cadastro"
                    aria-label="Scanear Etiqueta"
                    className="shrink-0 gap-2 px-3 text-xs sm:text-sm"
                  >
                    {scanningLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    Scanear Etiqueta
                  </Button>
                )}
              </div>
              <input
                ref={labelInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleLabelPhoto(file);
                }}
              />
            </form>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Produto já existe</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>O código <strong>{codigo.trim()}</strong> já está cadastrado:</p>
                {existing && <div className="space-y-1 rounded-md border bg-muted/50 p-3 text-sm break-words">
                  <div><span className="font-medium">EAN(s) vinculados:</span> {(existing.eans || [existing.ean]).join(', ')}</div>
                  <div><span className="font-medium">Novo EAN:</span> {ean.trim()}</div>
                  <div><span className="font-medium">Descrição atual:</span> {existing.descricao}</div>
                  <div><span className="font-medium">Tipo:</span> {existing.tipo || '—'}</div>
                  {existing.codigos && existing.codigos.length > 1 && <div><span className="font-medium">Códigos vinculados:</span> {existing.codigos.join(', ')}</div>}
                </div>}
                <p>O código, a descrição e o tipo serão mantidos. Deseja vincular o novo EAN a este produto?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={performInsert} disabled={loading}>{loading ? 'Vinculando...' : 'Vincular EAN'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
export default AddProductView;
