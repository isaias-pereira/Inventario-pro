export type PackagingType = 'CX' | 'FD' | 'SC';

export const PACKAGING_TYPES: PackagingType[] = ['CX', 'FD', 'SC'];

export const PACKAGING_LABELS: Record<PackagingType, { singular: string; plural: string }> = {
  CX: { singular: 'caixa', plural: 'caixas' },
  FD: { singular: 'fardo', plural: 'fardos' },
  SC: { singular: 'saco', plural: 'sacos' },
};

export function packagingType(value: unknown): PackagingType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return PACKAGING_TYPES.includes(normalized as PackagingType) ? (normalized as PackagingType) : null;
}

export function packagingLabel(type: string | null | undefined): { singular: string; plural: string } {
  const normalized = packagingType(type);
  return normalized ? PACKAGING_LABELS[normalized] : { singular: 'embalagem', plural: 'embalagens' };
}

/**
 * Converte um valor numérico em número.
 * O driver do Neon devolve colunas `numeric` como texto (ex.: "100.000"),
 * então a conversão precisa acontecer antes de calcular ou formatar.
 */
export function toQuantity(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const text = value.includes(',') && !value.includes('.') ? value.replace(',', '.') : value;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Mostra a quantidade com até 3 casas decimais, sem zeros à direita. */
export function formatQuantity(value: unknown): string {
  const rounded = Math.round(toQuantity(value) * 1000) / 1000;
  return String(rounded).replace('.', ',');
}

/** Unidade de medida do produto (o inventário continua em un/kg). */
export function productUnit(tipo: string | null | undefined): string {
  return String(tipo || '').trim().toUpperCase() === 'KG' ? 'kg' : 'un';
}

/** Texto curto usado em badges, por exemplo `CX ×10`. */
export function packagingBadge(type: string, quantidade: number): string {
  return `${String(type).toUpperCase()} ×${formatQuantity(quantidade)}`;
}
