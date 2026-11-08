/**
 * Seções (categorias) do catálogo.
 *
 * A taxonomia vive na tabela `categoria` do Neon: `codigo` bigint + `secao`
 * textual (19 seções de mercearia). O produto aponta para ela pela coluna
 * `produto.categoria_codigo`.
 */
import { invokeFunction } from '@/lib/api';

export interface Categoria {
  codigo: string;
  secao: string;
}

/** Produto (ou item de lista) que pode exibir a seção do catálogo. */
export interface ComSecao {
  categoria_codigo?: string | null;
  secao?: string | null;
}

/** Valor do Select quando a pessoa escolhe "Sem seção". */
export const SEM_SECAO = '__sem_secao__';

/**
 * Busca a taxonomia de seções.
 *
 * Falha de rede não impede o uso do app: devolve uma lista vazia e o filtro
 * simplesmente não aparece.
 */
export async function fetchCategorias(): Promise<Categoria[]> {
  const { data, error } = await invokeFunction('query-product', { body: { action: 'categorias' } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  const rows = Array.isArray(data?.categorias) ? (data.categorias as Record<string, unknown>[]) : [];
  return rows
    .map((row) => ({ codigo: String(row.codigo ?? ''), secao: String(row.secao ?? '') }))
    .filter((row) => row.codigo !== '' && row.secao !== '');
}

/**
 * Seção de um produto/registro.
 *
 * O backend devolve `secao` (texto da taxonomia) junto do `categoria_codigo`.
 * Quando o texto não vem (item antigo, join sem categoria), devolve null.
 */
export function secaoDo(item: ComSecao | null | undefined): string | null {
  const secao = item?.secao;
  if (typeof secao === 'string' && secao.trim() !== '') return secao.trim();
  return null;
}

/** Código da seção de um produto/registro (null quando não classificado). */
export function codigoSecao(item: ComSecao | null | undefined): string | null {
  const codigo = item?.categoria_codigo;
  if (codigo === null || codigo === undefined) return null;
  const text = String(codigo).trim();
  return text === '' ? null : text;
}

/**
 * Mantém apenas os itens cuja seção bate com o filtro.
 * Sem filtro (`''` ou `null`), devolve tudo.
 */
export function filtrarPorSecao<T extends ComSecao>(itens: T[], secao: string | null | undefined): T[] {
  const alvo = (secao ?? '').trim();
  if (!alvo) return itens;
  return itens.filter((item) => secaoDo(item) === alvo);
}
