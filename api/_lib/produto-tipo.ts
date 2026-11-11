/**
 * Tipo do produto no catálogo (UN = unidade, KG = balança).
 *
 * Regra de negócio: **produto de KG não entra na Validade nem no Arrastão**.
 * A checagem é feita no servidor (nunca só na tela): o catálogo é
 * compartilhado, então o tipo é lido de `public.produto` pelo código mestre
 * (ou pelo código alternativo em `public.produto_codigos`).
 */
import type { Sql } from './db.js';

/** Mensagem exibida quando um produto de KG é digitado na Validade. */
export const MSG_KG_VALIDADE = 'Produto de KG não pode ser adicionado à lista de validade';

/** Mensagem exibida quando um produto de KG é digitado no Arrastão. */
export const MSG_KG_ARRASTAO = 'Produto de KG não pode ser adicionado ao arrastão';

/** O tipo do produto é KG (balança)? */
export function isTipoKg(tipo: unknown): boolean {
  return String(tipo ?? '').trim().toUpperCase() === 'KG';
}

/**
 * O código informado aponta para um produto de balança (KG)?
 *
 * Aceita o código mestre do catálogo e também o código alternativo
 * (`produto_codigos`). Quando o produto não existe no catálogo, devolve
 * `false` — a regra do KG não bloqueia o cadastro de produtos novos.
 */
export async function codigoEhKg(sql: Sql, codigo: string | number): Promise<boolean> {
  const valor = String(codigo).trim();
  if (!/^\d{1,14}$/.test(valor)) return false;
  try {
    const rows = await sql`
      SELECT p.tipo
        FROM public.produto p
       WHERE p.codigo = ${valor}::bigint
      UNION ALL
      SELECT p.tipo
        FROM public.produto_codigos pc
        JOIN public.produto p ON p.codigo = pc.produto_codigo
       WHERE pc.codigo = ${valor}::bigint
      LIMIT 1`;
    return rows.some((row) => isTipoKg(row.tipo));
  } catch {
    // Falha na consulta do catálogo não pode derrubar o registro: o item é
    // gravado e a regra do KG continua valendo na tela.
    return false;
  }
}
