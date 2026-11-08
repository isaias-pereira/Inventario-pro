import { useEffect, useState } from 'react';
import { carregarCategorias, type Categoria } from '@/lib/categorias';

/**
 * Taxonomia de seções carregada uma vez por sessão.
 *
 * Falha de rede não quebra a tela: a lista volta vazia e o filtro de seção
 * simplesmente não aparece.
 */
export function useCategorias(): Categoria[] {
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  useEffect(() => {
    let ativo = true;
    carregarCategorias()
      .then(lista => { if (ativo) setCategorias(lista); })
      .catch(() => { if (ativo) setCategorias([]); });
    return () => { ativo = false; };
  }, []);

  return categorias;
}
