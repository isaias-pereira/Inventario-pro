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
  /** Código da seção (tabela categoria) escolhida no cadastro; null = sem seção. */
  categoriaCodigo: string | null;
  /**
   * true quando o formulário informou a seção. Na edição, false mantém a
   * seção atual do produto; true com `categoriaCodigo` null limpa a seção.
   */
  categoriaInformada: boolean;
}

/**
 * Lê a seção informada no cadastro.
 *
 * - `undefined`/`null`: o formulário não falou da seção (edição mantém a atual).
 * - string vazia: a pessoa escolheu "Sem seção" (limpa a classificação).
 * - dígitos: código da categoria (validado contra a tabela no endpoint).
 */
export function categoriaInput(value: unknown): { codigo: string | null; informada: boolean } | null {
  if (value === undefined || value === null) return { codigo: null, informada: false };
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (text === '') return { codigo: null, informada: true };
  const codigo = identifier(text);
  if (!codigo) return null;
  return { codigo, informada: true };
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
  const categoria = categoriaInput(body.categoriaCodigo);
  if (!categoria) return null;
  return {
    codigo,
    ean,
    eans: validEans,
    descricao,
    tipo,
    categoriaCodigo: categoria.codigo,
    categoriaInformada: categoria.informada,
  };
}

export function canManageProducts(role: unknown): boolean {
  return role === 'admin';
}

/**
 * Cadastro de produto e de embalagem: admin e encarregado.
 *
 * A edição do catálogo (`update`, `edit_lookup`, `remove_packaging`,
 * `set_categoria`) continua exclusiva do admin.
 */
export function canCreateProducts(role: unknown): boolean {
  return role === 'admin' || role === 'encarregado';
}
