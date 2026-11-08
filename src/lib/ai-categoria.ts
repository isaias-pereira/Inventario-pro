/**
 * Revisão da classificação de produtos por IA (lado do cliente).
 *
 * Fluxo: a IA propõe a seção → a pessoa confere → o app grava com a action
 * `set_categoria` do `query-product`. A IA nunca grava sozinha.
 */
import { invokeFunction } from '@/lib/api';

export interface CandidatoSecao {
  codigo: string;
  descricao: string;
  secaoAtual: string | null;
}

export interface PropostaSecao {
  codigo: string;
  descricao: string;
  secaoAtual: string | null;
  /** Nome oficial da seção proposta. */
  secao: string;
  /** Código da seção proposta (`categoria.codigo`). */
  secaoCodigo: string;
  confianca: number;
}

export interface RevisaoSecoes {
  candidatos: CandidatoSecao[];
  propostas: PropostaSecao[];
  avisos: string[];
  model?: string;
}

/**
 * Pede à IA uma proposta de seção para um lote de produtos.
 *
 * A chamada pode demorar (o timeout do cliente é de 55 s): sem IA o app
 * continua funcionando — a tela apenas avisa que a revisão não saiu.
 */
export async function revisarSecoes(
  options: { limite?: number; token?: string | null } = {},
): Promise<RevisaoSecoes> {
  const { data, error } = await invokeFunction<RevisaoSecoes & { error?: string }>('ai-assist', {
    body: { action: 'review_categorias', limite: options.limite },
    ...(options.token ? { headers: { Authorization: `Bearer ${options.token}` } } : {}),
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return {
    candidatos: Array.isArray(data?.candidatos) ? data.candidatos : [],
    propostas: Array.isArray(data?.propostas) ? data.propostas : [],
    avisos: Array.isArray(data?.avisos) ? data.avisos : [],
    model: data?.model,
  };
}

/**
 * Grava a seção de um produto (admin only).
 *
 * A gravação é determinística: o backend valida o código da seção na
 * taxonomia antes de atualizar `produto.categoria_codigo`.
 */
export async function aplicarSecao(
  codigo: string,
  secaoCodigo: string,
  token?: string | null,
): Promise<void> {
  const { data, error } = await invokeFunction<{ error?: string }>('query-product', {
    body: { action: 'set_categoria', codigo, categoriaCodigo: secaoCodigo },
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
}
