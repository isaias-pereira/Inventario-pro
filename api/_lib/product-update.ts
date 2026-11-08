import type { Statement } from './db.js';

export interface ProductUpdateInput {
  original: string;
  codigo: string;
  ean: string;
  descricao: string;
  tipo: string;
  eans: string[];
  /** Seção (categoria) escolhida no cadastro; null = sem seção. */
  categoriaCodigo: string | null;
  /** true quando o formulário informou a seção (false mantém a atual). */
  categoriaInformada: boolean;
}

/**
 * Lote transacional da edição de produto.
 *
 * O código novo pode ser o próprio código atual, um código alternativo do
 * mesmo produto ou um código livre. O registro mestre antigo é removido depois
 * de mover os códigos alternativos e os EANs; o código antigo fica como alias
 * para não quebrar consultas antigas.
 */
export function buildProductUpdateQueries(input: ProductUpdateInput): Statement[] {
  const { original, codigo, ean, descricao, tipo, eans, categoriaCodigo, categoriaInformada } = input;
  const params = [original, codigo, ean, descricao, tipo || null, eans];

  return [
    { query: 'LOCK TABLE public.produto, public.produto_codigos, public.produto_eans, public.produto_embalagens IN SHARE ROW EXCLUSIVE MODE' },
    { query: `SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM public.produto WHERE codigo=$1::bigint)
      AND NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo=$2::bigint AND codigo<>$1::bigint)
      AND NOT EXISTS (SELECT 1 FROM public.produto_codigos WHERE codigo=$2::bigint AND produto_codigo<>$1::bigint)
      AND NOT EXISTS (SELECT 1 FROM public.produto WHERE ean=ANY($3::bigint[]) AND codigo<>$1::bigint)
      AND NOT EXISTS (SELECT 1 FROM public.produto_eans WHERE ean=ANY($3::bigint[]) AND produto_codigo<>$1::bigint)
      AND NOT EXISTS (SELECT 1 FROM public.produto_embalagens WHERE ean_fechado=$2::bigint OR ean_fechado=ANY($3::bigint[]))
      THEN 1 ELSE 0 END`, params: [original, codigo, eans] },
    // O código novo pode ser um código alternativo do próprio produto: ele vira o código mestre.
    { query: 'DELETE FROM public.produto_codigos WHERE codigo=$1::bigint', params: [codigo] },
    // Se o código mudou, o novo mestre nasce como uma cópia do original.
    // A categoria (categoria_codigo) também é copiada: sem isso a troca de
    // código apagava a classificação do produto.
    { query: `INSERT INTO public.produto (codigo,ean,descricao,tipo,categoria_codigo) SELECT $2::bigint,$3::bigint,$4,$5,categoria_codigo FROM public.produto WHERE codigo=$1::bigint AND $1::bigint<>$2::bigint`, params: params.slice(0, 5) },
    // Move os códigos alternativos e as embalagens para o novo mestre.
    { query: 'UPDATE public.produto_codigos SET produto_codigo=$2::bigint WHERE produto_codigo=$1::bigint', params: [original, codigo] },
    { query: 'UPDATE public.produto_embalagens SET produto_codigo=$2::bigint WHERE produto_codigo=$1::bigint', params: [original, codigo] },
    // Remove todos os EANs antigos; os EANs informados são reinseridos abaixo.
    { query: 'DELETE FROM public.produto_eans WHERE produto_codigo=$1::bigint', params: [original] },
    // Remove o registro mestre antigo depois de mover códigos, EANs e embalagens.
    { query: 'DELETE FROM public.produto WHERE codigo=$1::bigint AND codigo<>$2::bigint', params: [original, codigo] },
    // Mantém o código antigo como alias para não quebrar consultas antigas.
    { query: 'INSERT INTO public.produto_codigos (codigo,produto_codigo) SELECT $1::bigint,$2::bigint WHERE $1::bigint<>$2::bigint ON CONFLICT (codigo) DO NOTHING', params: [original, codigo] },
    // A seção só é alterada quando o formulário a informou; caso contrário
    // o produto mantém a seção atual.
    { query: 'UPDATE public.produto SET ean=$2::bigint,descricao=$3,tipo=$4,categoria_codigo=CASE WHEN $5::boolean THEN $6::bigint ELSE categoria_codigo END WHERE codigo=$1::bigint', params: [codigo, ean, descricao, tipo || null, categoriaInformada, categoriaCodigo] },
    { query: 'INSERT INTO public.produto_eans (ean,produto_codigo) SELECT value,$1::bigint FROM unnest($2::bigint[]) value WHERE value<>$3::bigint', params: [codigo, eans, ean] },
  ];
}
