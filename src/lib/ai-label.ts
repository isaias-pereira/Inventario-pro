/**
 * Aplicação da leitura da etiqueta no formulário de produto (cliente).
 *
 * A leitura vem do servidor já cruzada com o catálogo. Aqui só transformamos
 * isso nos campos do formulário de cadastro — de forma pura, para poder ser
 * testada.
 *
 * Regra do projeto: a IA **preenche** a tela, a pessoa confere e salva.
 */

export interface LabelData {
  ean?: string | null;
  codigo?: string | null;
  descricao?: string | null;
  validade?: string | null;
  quantidade?: number | null;
  tipo?: string | null;
}

export interface LabelProductFields {
  /** EAN lido (string vazia quando não veio). */
  ean: string;
  /** Código interno lido (string vazia quando não veio). */
  codigo: string;
  /** Descrição lida, em maiúsculas (string vazia quando não veio). */
  descricao: string;
  /** `KG`, `UN` ou `null` quando a IA não identificou o tipo. */
  tipo: string | null;
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/** O formulário de produto só aceita `KG` ou `UN`. */
function normalizeTipo(value: unknown): string | null {
  const raw = text(value).toUpperCase();
  if (raw === 'KG') return 'KG';
  if (raw === 'UN') return 'UN';
  return null;
}

/**
 * Monta o preenchimento do formulário de produto.
 *
 * O catálogo manda quando existe (descrição e tipo limpos); a leitura da IA
 * entra no que o catálogo não tem. Campos que não vieram ficam vazios — a
 * pessoa preenche na mão.
 */
export function labelToProductFields(
  label: LabelData | null | undefined,
  produto: LabelData | null | undefined,
): LabelProductFields {
  const source = label ?? {};
  const found = produto ?? null;
  return {
    ean: text(found?.ean) || text(source.ean),
    codigo: text(found?.codigo) || text(source.codigo),
    descricao: (text(found?.descricao) || text(source.descricao)).toUpperCase().slice(0, 100),
    tipo: normalizeTipo(found?.tipo ?? source.tipo),
  };
}
