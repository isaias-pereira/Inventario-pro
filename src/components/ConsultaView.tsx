import { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { invokeFunction } from '@/lib/api';
import { ScanBarcode, PackageX, AlertCircle, ShoppingBasket, AlertTriangle, Package, DollarSign, Hash, FileText, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BarcodeScanner from '@/components/BarcodeScanner';

interface ConsultaResult {
  codigo: string;
  descricao: string;
  /** Estoque e preço só existem quando o produto está na base de consulta. */
  estoque: number | null;
  preco: number | null;
}

const ConsultaView = () => {
  const { findByCode, hasData } = useData();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ConsultaResult | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);

  /** Busca primeiro na base de consulta; sem ela, cai no catálogo de produtos. */
  const searchByCode = async (value: string) => {
    const clean = value.trim();
    if (!clean) return;

    const local = findByCode(clean);
    if (local) {
      setResult({ ...local });
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await invokeFunction<{
        found?: boolean;
        product?: { codigo?: string | number; descricao?: string } | null;
      }>('query-product', { body: { codigo: clean } });
      if (error) throw new Error(error.message);
      if (data?.found && data.product) {
        setResult({
          codigo: String(data.product.codigo ?? clean),
          descricao: data.product.descricao ?? 'Produto sem descrição',
          estoque: null,
          preco: null,
        });
      } else {
        setResult(null);
      }
    } catch {
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = () => {
    void searchByCode(code);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      !/^\d$/.test(e.key) &&
      !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)
    ) {
      e.preventDefault();
    }
    if (e.key === 'Enter') handleSearch();
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const hasStock = result?.estoque !== null && result?.estoque !== undefined;
  const hasPrice = result?.preco !== null && result?.preco !== undefined;
  const isNegativeStock = hasStock && result!.estoque! < 0;

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] px-3 sm:px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-1 text-xl sm:text-2xl font-bold text-white">Consultar Produto</h2>
        <p className="mb-4 sm:mb-6 text-sm text-white/70">
          Digite o código numérico do produto para consultar
        </p>

        <div className="flex gap-2">
          <BarcodeScanner onDetected={(scannedCode) => {
            setCode(scannedCode);
            setResult(undefined);
            void searchByCode(scannedCode);
          }} />
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ''));
              setResult(undefined);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Código do produto"
            className="text-base sm:text-lg"
            inputMode="numeric"
            autoFocus
          />
          <Button onClick={handleSearch} disabled={!code.trim() || searching} className="gap-1.5 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-sm sm:text-base px-3 sm:px-4">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
            <span className="hidden sm:inline">Consultar</span>
          </Button>
        </div>

        {/* Results */}
        <div className="mt-6 sm:mt-8">
          {!hasData && result === undefined && !searching && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/50 p-6 sm:p-8 text-center">
              <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
              <p className="text-sm sm:text-base text-muted-foreground">
                Base de consulta não carregada — a busca usa o catálogo de produtos e mostra o
                produto sem o preço de venda.
              </p>
            </div>
          )}

          {searching && (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card p-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Consultando o catálogo...</span>
            </div>
          )}

          {result === null && !searching && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-destructive/30 bg-destructive/5 p-8 sm:p-10 text-center animate-scale-in">
              <div className="rounded-full bg-destructive/10 p-4">
                <PackageX className="h-10 w-10 sm:h-12 sm:w-12 text-destructive" />
              </div>
              <div>
                <p className="text-lg font-semibold text-destructive">Produto não encontrado</p>
                <p className="mt-1 text-sm text-muted-foreground">Verifique o código e tente novamente</p>
              </div>
            </div>
          )}

          {result && !searching && (
            <div className="overflow-hidden rounded-2xl border-2 border-primary/20 bg-card shadow-lg animate-fade-in">
              {/* Header */}
              <div className="flex items-center gap-3 bg-primary px-5 sm:px-6 py-4">
                <div className="rounded-full bg-primary-foreground/20 p-2">
                  <ShoppingBasket className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-lg font-bold text-primary-foreground">Detalhes do Produto</span>
              </div>

              {/* Negative stock alert */}
              {isNegativeStock && (
                <div className="flex items-center gap-3 bg-destructive/10 border-b border-destructive/20 px-5 sm:px-6 py-3">
                  <AlertTriangle className="h-5 w-5 text-destructive animate-pulse" />
                  <span className="text-sm font-semibold text-destructive">
                    Atenção: Estoque negativo! Verifique este produto.
                  </span>
                </div>
              )}

              {/* Product details */}
              <div className="p-4 sm:p-6 space-y-4">
                {/* Código */}
                <div className="flex items-center gap-4 rounded-xl bg-accent/50 p-4">
                  <div className="rounded-lg bg-primary/10 p-2.5">
                    <Hash className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Código</p>
                    <p className="text-lg sm:text-xl font-bold text-foreground">{result.codigo}</p>
                  </div>
                </div>

                {/* Descrição */}
                <div className="flex items-center gap-4 rounded-xl bg-accent/50 p-4">
                  <div className="rounded-lg bg-primary/10 p-2.5">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</p>
                    <p className="text-base sm:text-lg font-semibold text-foreground">{result.descricao}</p>
                  </div>
                </div>

                {/* Estoque & Preço: só aparecem quando a base de consulta tem os dados */}
                {(hasStock || hasPrice) && (
                  <div className={`grid gap-3 ${hasStock && hasPrice ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {hasStock && (
                      <div className={`flex flex-col items-center gap-2 rounded-xl p-4 ${
                        isNegativeStock
                          ? 'bg-destructive/10 border-2 border-destructive/30'
                          : 'bg-accent/50'
                      }`}>
                        <div className={`rounded-lg p-2.5 ${
                          isNegativeStock ? 'bg-destructive/20' : 'bg-primary/10'
                        }`}>
                          <Package className={`h-5 w-5 ${isNegativeStock ? 'text-destructive' : 'text-primary'}`} />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Estoque</p>
                          <p className={`text-xl sm:text-2xl font-bold ${
                            isNegativeStock ? 'text-destructive' : 'text-foreground'
                          }`}>
                            {result.estoque}
                          </p>
                          {isNegativeStock && (
                            <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-destructive/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              Negativo
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {hasPrice && (
                      <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/20 p-4">
                        <div className="rounded-lg bg-emerald-500/20 p-2.5">
                          <DollarSign className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Preço</p>
                          <p className="text-xl sm:text-2xl font-bold text-emerald-600">
                            {formatCurrency(result.preco!)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!hasPrice && (
                  <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                    Produto encontrado no catálogo. O preço de venda aparece quando a base de
                    consulta estiver carregada.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConsultaView;
