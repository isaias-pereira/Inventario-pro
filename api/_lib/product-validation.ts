export function identifier(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d{1,14}$/.test(text)) return null;
  return text.replace(/^0+(?=\d)/, '');
}

export interface ProductInput {
  codigo: string;
  ean: string;
  eans: string[];
  descricao: string;
  tipo: string;
}

export function productInput(body: Record<string, unknown>, editing = false): ProductInput | null {
  const codigo = identifier(body.codigo);
  const ean = identifier(body.ean);
  const descricao = typeof body.descricao === 'string' ? body.descricao.trim().toUpperCase() : '';
  const tipo = body.tipo == null ? '' : typeof body.tipo === 'string' ? body.tipo.trim() : null;
  if (!codigo || !ean || !descricao || descricao.length > 100 || tipo === null || tipo.length > 10) return null;
  const rawEans = editing ? body.eans : [ean];
  if (!Array.isArray(rawEans) || rawEans.length < 1 || rawEans.length > 200) return null;
  const eans = rawEans.map(identifier);
  if (eans.some((value) => value === null)) return null;
  const validEans = eans.filter((value): value is string => value !== null);
  if (!validEans.includes(ean) || new Set(validEans).size !== validEans.length) return null;
  return { codigo, ean, eans: validEans, descricao, tipo };
}

export function canManageProducts(role: unknown): boolean {
  return role === 'admin';
}
