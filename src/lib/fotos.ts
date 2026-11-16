/**
 * Controle de cache das fotos dos guias.
 *
 * As fotos ficam em `public/guias/` e são trocadas **mantendo o mesmo nome de
 * arquivo** (a foto de IA virou foto real, e a ideia é o encarregado poder
 * substituir pela foto da própria banca). Sem um endereço novo, o navegador
 * pode continuar mostrando a imagem antiga que já guardou — foi exatamente o
 * que aconteceu na troca das fotos geradas pelas reais.
 *
 * Somar `?v=` na URL cria um endereço novo e obriga a baixar a foto nova.
 * **Toda vez que uma foto for substituída** (por outra de mesmo nome), suba
 * este número.
 */
export const VERSAO_FOTOS = 3;

/** Caminho da foto com a versão (bustador de cache). */
export function fotoVersionada(src: string): string {
  return src.includes('?') ? `${src}&v=${VERSAO_FOTOS}` : `${src}?v=${VERSAO_FOTOS}`;
}