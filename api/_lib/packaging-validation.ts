import { identifier } from './product-validation.js';

export type PackagingType = 'CX' | 'FD' | 'SC';

export const PACKAGING_TYPES: PackagingType[] = ['CX', 'FD', 'SC'];

/** Maior quantidade aceita por embalagem (numeric 12,3). */
export const MAX_PACKAGING_QUANTITY = 999_999_999.999;

export interface PackagingInput {
  eanFechado: string;
  tipo: PackagingType;
  quantidadeFechada: number;
  descricao: string;
}

export function packagingType(value: unknown): PackagingType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return PACKAGING_TYPES.includes(normalized as PackagingType) ? (normalized as PackagingType) : null;
}

/** Valida e normaliza os dados de uma embalagem fechada. */
export function packagingInput(body: Record<string, unknown>): PackagingInput | null {
  const eanFechado = identifier(body.eanFechado);
  const tipo = packagingType(body.tipo);
  if (!eanFechado || !tipo) return null;

  const rawQuantity = body.quantidadeFechada;
  const parsed =
    typeof rawQuantity === 'number'
      ? rawQuantity
      : typeof rawQuantity === 'string'
        ? Number(rawQuantity.trim().replace(',', '.'))
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_PACKAGING_QUANTITY) return null;
  const quantidadeFechada = Math.round(parsed * 1000) / 1000;

  const descricao = typeof body.descricao === 'string' ? body.descricao.trim().toUpperCase() : '';
  if (descricao.length > 60) return null;

  return { eanFechado, tipo, quantidadeFechada, descricao };
}
