/**
 * Aplicação da leitura da etiqueta no formulário da Validade (cliente).
 *
 * A leitura vem do servidor já cruzada com o catálogo. Aqui só transformamos
 * isso nos campos do formulário — de forma pura, para poder ser testada.
 */

export interface LabelData {
  ean?: string | null;
  codigo?: string | null;
  descricao?: string | null;
  validade?: string | null;
  quantidade?: number | null;
  tipo?: string | null;
}

export interface LabelFormFill {
  ean: string;
  codigo: string;
  descricao: string;
  tipo: string | null;
  /** Data no formato `AAAA-MM-DD` (vazio quando não lida). */
  validade: string;
  /** Quantidade como texto (vazio quando não lida). */
  quantidade: string;
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/**
 * Monta o preenchimento do formulário.
 *
 * Devolve `null` quando o produto não está no catálogo: nesse caso a tela
 * mantém o código lido para a consulta manual.
 */
export function labelToForm(label: LabelData | null | undefined, produto: LabelData | null | undefined): LabelFormFill | null {
  const source = label ?? {};
  const found = produto ?? null;
  const codigo = text(found?.codigo) || text(source.codigo);
  if (!codigo) return null;

  const quantidade = Number(source.quantidade);
  return {
    ean: text(found?.ean) || text(source.ean),
    codigo,
    descricao: text(found?.descricao) || text(source.descricao),
    tipo: text(found?.tipo) || text(source.tipo) || null,
    validade: text(source.validade),
    quantidade: Number.isFinite(quantidade) && quantidade > 0 ? String(Math.trunc(quantidade)) : '',
  };
}
