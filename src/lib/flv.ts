import { invokeFunction } from '@/lib/api';

export type FichaDefeitoGrupo = 'PODRIDAO' | 'GRAVE' | 'LEVE';

export interface FichaCodigo {
  tipo: 'ENTRADA' | 'BALANCA' | 'EAN';
  codigo: string;
}

export interface FichaDefeito {
  ordem: number;
  grupo: FichaDefeitoGrupo;
  nome: string;
  cat1: number | null;
  cat2: number | null;
  detalhe: string | null;
}

export interface FichaFlv {
  codigo: string;
  titulo: string;
  grupo: string;
  pagina_pdf: number;
  revisao: string | null;
  data_revisao: string | null;
  fonte: string;
  pontos_atencao: unknown;
  codigos: FichaCodigo[];
  defeitos: FichaDefeito[];
}

export interface ProdutoFlv {
  codigo: string;
  ean: string | null;
  descricao: string;
  tipo: string;
  secao: string | null;
}

export type DecisaoRecebimento = 'aprovado' | 'ressalva' | 'rebaixa' | 'rejeitado';

export const DECISOES_RECEBIMENTO: readonly DecisaoRecebimento[] = [
  'aprovado',
  'ressalva',
  'rebaixa',
  'rejeitado',
];

export interface RecebimentoDefeito extends FichaDefeito {
  quantidade: number;
  percentual: number;
}

export interface RecebimentoFlv {
  id: string;
  created_at: string;
  created_by: string;
  produto_codigo: string | null;
  produto_ean: string | null;
  descricao: string | null;
  ficha_codigo: string | null;
  amostra: number;
  decisao: DecisaoRecebimento;
  defeitos: RecebimentoDefeito[];
  observacao: string | null;
}

export interface FichaResponse {
  ficha: FichaFlv | null;
  produto: ProdutoFlv | null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  return [];
}

export async function buscarFicha(codigo: string) {
  return invokeFunction<FichaResponse>('manage-validade', {
    body: { action: 'flv_ficha', codigo },
  });
}

export async function listarFichas() {
  return invokeFunction<{ fichas: Array<Record<string, unknown>> }>('manage-validade', {
    body: { action: 'flv_listar_fichas' },
  });
}

export interface RegistrarRecebimentoInput {
  codigo: string;
  amostra: number;
  decisao: DecisaoRecebimento;
  defeitos: Array<{ ordem: number; quantidade: number }>;
  observacao?: string;
}

export async function registrarRecebimento(input: RegistrarRecebimentoInput) {
  return invokeFunction<{ ok: boolean; recebimento: RecebimentoFlv | null }>('manage-validade', {
    body: { action: 'flv_registrar_recebimento', ...input },
  });
}

export async function listarRecebimentos() {
  return invokeFunction<{ recebimentos: RecebimentoFlv[] }>('manage-validade', {
    body: { action: 'flv_list_recebimentos' },
  });
}

export interface IndicadorDefeito extends FichaDefeito {
  quantidade: number;
  percentual: number;
  /** null quando a ficha não traz CAT I para o defeito. */
  dentro: boolean | null;
}

export interface IndicadoresRecebimento {
  amostra: number;
  itens: IndicadorDefeito[];
  violacoes: IndicadorDefeito[];
  sugestao: DecisaoRecebimento;
}

/**
 * Calcula o percentual de cada defeito sobre a amostra e compara com o CAT I
 * da ficha. A sugestão segue a tabela: podridão acima do limite rejeita; grave
 * acima do limite manda para rebaixa; leve acima do limite vira ressalva.
 */
export function calcularIndicadores(
  ficha: FichaFlv,
  amostra: number,
  contagens: Record<number, number>,
): IndicadoresRecebimento {
  const base = Number.isInteger(amostra) && amostra > 0 ? amostra : 0;
  const itens: IndicadorDefeito[] = ficha.defeitos.map((defeito) => {
    const quantidade = Math.max(0, Number(contagens[defeito.ordem] ?? 0) || 0);
    const percentual = base > 0 ? Number(((quantidade / base) * 100).toFixed(2)) : 0;
    const dentro = defeito.cat1 === null ? null : percentual <= defeito.cat1;
    return { ...defeito, quantidade, percentual, dentro };
  });
  const violacoes = itens.filter((item) => item.dentro === false);
  let sugestao: DecisaoRecebimento = 'aprovado';
  if (violacoes.some((item) => item.grupo === 'PODRIDAO')) sugestao = 'rejeitado';
  else if (violacoes.some((item) => item.grupo === 'GRAVE')) sugestao = 'rebaixa';
  else if (violacoes.some((item) => item.grupo === 'LEVE')) sugestao = 'ressalva';
  return { amostra: base, itens, violacoes, sugestao };
}

export function formatPercent(valor: number): string {
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(valor)}%`;
}

export function pontosDaFicha(ficha: FichaFlv | null): string[] {
  return ficha ? asStringArray(ficha.pontos_atencao) : [];
}
