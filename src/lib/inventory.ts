/**
 * Estado do lote aberto do Inventário.
 *
 * O lote é por login: a API devolve `lote_numero`/`lote_nome` na listagem e
 * `null` quando não há lote aberto. Antes o frontend só atualizava o estado
 * quando o número vinha preenchido — então, depois de limpar o inventário (ou
 * de o lote vazio ser descartado), o cabeçalho continuava mostrando o número e
 * o nome do lote que não existia mais.
 */
export interface RespostaLoteAberto {
  lote_numero?: number | null;
  lote_nome?: string | null;
}

export interface LoteAberto {
  numero: number | null;
  nome: string | null;
}

export function loteAbertoDaResposta(
  data: RespostaLoteAberto | null | undefined,
): LoteAberto {
  return {
    numero: typeof data?.lote_numero === 'number' ? data.lote_numero : null,
    nome: typeof data?.lote_nome === 'string' && data.lote_nome.trim() !== ''
      ? data.lote_nome
      : null,
  };
}
