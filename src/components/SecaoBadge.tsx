import { Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { secaoDo } from '@/lib/categorias';

/**
 * Selo com a seção (categoria) do produto.
 *
 * Aparece nas listas de Validade, Inventário, Rebaixa e no card da Consulta.
 * Produto sem classificação não mostra selo.
 */
export function SecaoBadge({
  secao,
  className,
  title,
}: {
  secao?: string | null;
  className?: string;
  title?: string;
}) {
  const nome = secaoDo({ secao });
  if (!nome) return null;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary',
        className,
      )}
      title={title ?? `Seção: ${nome}`}
    >
      <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{nome}</span>
    </span>
  );
}

export default SecaoBadge;
