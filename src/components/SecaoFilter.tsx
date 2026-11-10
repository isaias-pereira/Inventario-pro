import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Layers, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCategorias } from '@/hooks/useCategorias';
import { cn } from '@/lib/utils';

export const TODAS_SECOES = '__todas__';

/** Paleta dos marcadores; cada seção recebe sempre a mesma cor. */
const CORES_SECAO = [
  '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6',
  '#ec4899', '#84cc16', '#f97316', '#6366f1', '#06b6d4', '#a855f7',
];

function corDaSecao(secao: string): string {
  let hash = 0;
  for (let i = 0; i < secao.length; i += 1) hash = (hash * 31 + secao.charCodeAt(i)) >>> 0;
  return CORES_SECAO[hash % CORES_SECAO.length];
}

/** Compara seções sem acento e sem caixa (a busca precisa achar "Bebidas" e "bebidas"). */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Filtro por seção do catálogo.
 *
 * Só aparece quando a taxonomia está disponível. Sem filtro escolhido, a
 * lista mostra tudo. O dropdown tem busca e marcador colorido por seção.
 */
export function SecaoFilter({
  value,
  onChange,
  className,
  id = 'filtro-secao',
}: {
  value: string;
  onChange: (secao: string) => void;
  className?: string;
  id?: string;
}) {
  const categorias = useCategorias();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const listaRef = useRef<HTMLDivElement>(null);

  const filtradas = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return categorias;
    return categorias.filter(item => normalizar(item.secao).includes(termo));
  }, [categorias, busca]);

  if (categorias.length === 0) return null;

  const escolher = (secao: string) => {
    onChange(secao);
    setOpen(false);
    setBusca('');
  };

  /** Setas para cima/baixo navegam entre as opções do dropdown. */
  const moverFoco = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const opcoes = Array.from(
      listaRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
    if (opcoes.length === 0) return;
    const atual = opcoes.findIndex(opcao => opcao === document.activeElement);
    const passo = event.key === 'ArrowDown' ? 1 : -1;
    const proximo = atual < 0 ? 0 : (atual + passo + opcoes.length) % opcoes.length;
    opcoes[proximo]?.focus();
  };

  return (
    <div className={cn('w-[190px]', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setBusca('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            aria-label="Filtrar por seção"
            aria-haspopup="listbox"
            aria-expanded={open}
            title={value || 'Todas as seções'}
            className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-left text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{value || 'Todas as seções'}</span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                open && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[300px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border-slate-200 p-0 shadow-xl"
        >
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                onKeyDown={moverFoco}
                placeholder="Buscar seção..."
                aria-label="Buscar seção"
                className="h-9 border-slate-200 bg-slate-50 pl-8 text-sm focus-visible:bg-white"
              />
            </div>
          </div>

          <div
            ref={listaRef}
            role="listbox"
            aria-label="Seções do catálogo"
            onKeyDown={moverFoco}
            className="max-h-[280px] overflow-y-auto p-1.5"
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => escolher('')}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                !value ? 'bg-sky-50 font-medium text-sky-900' : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="flex-1 truncate">Todas as seções</span>
              {!value && <Check className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />}
            </button>

            <div className="my-1 h-px bg-slate-100" />

            {filtradas.map((item) => {
              const selecionada = item.secao === value;
              return (
                <button
                  key={item.codigo}
                  type="button"
                  role="option"
                  aria-selected={selecionada}
                  onClick={() => escolher(item.secao)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                    selecionada
                      ? 'bg-sky-50 font-medium text-sky-900'
                      : 'text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: corDaSecao(item.secao) }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{item.secao}</span>
                  {selecionada && (
                    <Check className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                  )}
                </button>
              );
            })}

            {filtradas.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
                Nenhuma seção encontrada.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-400">
            <span>
              {filtradas.length} de {categorias.length} seções
            </span>
            {value && (
              <button
                type="button"
                onClick={() => escolher('')}
                className="font-medium text-sky-600 transition-colors hover:text-sky-700"
              >
                Limpar
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default SecaoFilter;
