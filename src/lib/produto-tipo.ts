/**
 * Tipo do produto no catálogo (UN = unidade, KG = balança).
 *
 * Regra de negócio: **produto de KG não entra na Validade nem no Arrastão**.
 * As mensagens são as mesmas do servidor (`api/_lib/produto-tipo.ts`) para
 * que a tela e a API falem do mesmo jeito.
 */

/** O tipo do produto é KG (balança)? */
export function isTipoKg(tipo: string | null | undefined): boolean {
  return String(tipo ?? '').trim().toUpperCase() === 'KG';
}

/** Mensagem exibida quando um produto de KG é digitado na Validade. */
export const MSG_KG_VALIDADE = 'Produto de KG não pode ser adicionado à lista de validade';

/** Mensagem exibida quando um produto de KG é digitado no Arrastão. */
export const MSG_KG_ARRASTAO = 'Produto de KG não pode ser adicionado ao arrastão';
