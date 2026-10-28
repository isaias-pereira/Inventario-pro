import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { PackagePlus, Pencil, Search, Plus, Trash2, Save } from 'lucide-react';

interface ExistingProduct {
  ean: string | null;
  codigo: string;
  descricao: string;
  tipo?: string | null;
  codigos?: string[];
  eans?: string[];
}
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 14);

async function productRequest(body: Record<string, unknown>) {
  const token = localStorage.getItem('estoque_pro_token');
  const { data, error } = await supabase.functions.invoke('query-product', {
    body, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      throw new Error(details?.error || 'Não foi possível salvar o produto');
    }
    throw error;
  }
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

  const clearFields = () => {
    setEan(''); setCodigo(''); setDescricao(''); setTipo(''); setLinkedEans([]);
    setExisting(null); setEditing(null);
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
  };
  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!search.trim()) { toast.error('Informe o código ou EAN'); return; }
    setLoading(true); clearFields();
    try {
      const data = await productRequest({ action: 'edit_lookup', codigo: search.trim() });
      if (!data?.found) { toast.error('Produto não encontrado'); return; }
      loadProduct(data.product);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Erro ao consultar produto'); }
    finally { setLoading(false); }
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
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
                <Button type="submit" size="icon" variant="outline" disabled={loading} aria-label="Buscar produto" title="Buscar produto" className="shrink-0"><Search /></Button>
              </div>
            </form>
          )}
          {(mode === 'add' || editing) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="product-ean" className="mb-1 block text-sm font-medium">{mode === 'edit' ? 'EAN principal' : 'EAN'}</label>
                <Input id="product-ean" value={ean} onChange={event => setEan(digits(event.target.value))} inputMode="numeric" placeholder="Código de barras (EAN)" required disabled={loading} />
              </div>
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
              <Button type="submit" className="w-full" disabled={loading}>{mode === 'edit' ? <Save /> : <PackagePlus />}{loading ? 'Aguarde...' : mode === 'edit' ? 'Salvar alterações' : 'Adicionar Produto'}</Button>
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
