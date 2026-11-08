/**
 * Seção (categoria) do catálogo.
 *
 * A classificação vive em `produto.categoria_codigo` (bigint, FK para
 * `categoria.codigo`) e o texto da seção em `categoria.secao`. As listas do
 * app (validade, inventário, rebaixa, consulta) apontam para o produto pelo
 * código, então a seção chega com um LEFT JOIN.
 */

/** Colunas da seção para selects que já usam o alias `p` para o produto. */
export const SECAO_COLUNAS = 'p.categoria_codigo::text categoria_codigo, c.secao';

/** Garante que o alias interpolado no SQL é um identificador seguro. */
function aliasSeguro(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`alias inválido: ${alias}`);
  return alias;
}

/**
 * Trecho de FROM que junta a taxonomia de seções.
 *
 * `alias` é o alias da tabela da lista (v, i, r...). O LEFT JOIN mantém o
 * item mesmo quando o produto não está mais no catálogo.
 */
export function secaoJoin(alias: string): string {
  const a = aliasSeguro(alias);
  return `LEFT JOIN public.produto p ON p.codigo = ${a}.codigo LEFT JOIN public.categoria c ON c.codigo = p.categoria_codigo`;
}

/**
 * Versão para tabelas cujo código é texto (`shared_inventory`,
 * `consulta_products`). Sem o cast o Postgres reclama de `bigint = text`.
 */
export function secaoJoinTexto(alias: string): string {
  const a = aliasSeguro(alias);
  return `LEFT JOIN public.produto p ON p.codigo::text = ${a}.codigo LEFT JOIN public.categoria c ON c.codigo = p.categoria_codigo`;
}
