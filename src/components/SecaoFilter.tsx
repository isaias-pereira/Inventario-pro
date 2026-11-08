import { Layers } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategorias } from '@/hooks/useCategorias';
import { cn } from '@/lib/utils';

export const TODAS_SECOES = '__todas__';

/**
 * Filtro por seção do catálogo.
 *
 * Só aparece quando a taxonomia está disponível. Sem filtro escolhido, a
 * lista mostra tudo.
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
  if (categorias.length === 0) return null;

  return (
    <div className={cn('w-[190px]', className)}>
      <Select value={value || TODAS_SECOES} onValueChange={next => onChange(next === TODAS_SECOES ? '' : next)}>
        <SelectTrigger id={id} aria-label="Filtrar por seção" className="h-8 w-full text-xs">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <SelectValue placeholder="Todas as seções" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS_SECOES}>Todas as seções</SelectItem>
          {categorias.map(item => (
            <SelectItem key={item.codigo} value={item.secao}>{item.secao}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default SecaoFilter;
