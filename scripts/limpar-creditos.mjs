/** Remove uma chave dos créditos (uso local, quando um guia muda de foto). */
import { readFileSync, writeFileSync } from 'node:fs';
import { unlinkSync } from 'node:fs';

const chave = process.argv[2];
const RAIZ = process.cwd();
const CREDITOS = `${RAIZ}/src/data/fotos-creditos.ts`;
const FOTO = `${RAIZ}/public/guias/${chave}.webp`;
const APAGA_FOTO = process.argv[3] === '--apagar-foto';

const corpo = readFileSync(CREDITOS, 'utf8').replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, '');
const lista = JSON.parse(corpo).filter((c) => c.chave !== chave);

writeFileSync(
  CREDITOS,
  `/**\n * Créditos das fotos dos guias (gerado por \`scripts/baixar-fotos-guias.mjs\`).\n *\n * As fotos vêm do Wikimedia Commons e mantêm a licença original; a página\n * \`/g/creditos\` mostra autor e licença para cumprir a atribuição.\n */\nexport interface CreditoFoto {\n  chave: string;\n  arquivo: string;\n  autor: string;\n  licenca: string;\n  pagina: string;\n}\n\nexport const CREDITOS_FOTOS: CreditoFoto[] = ${JSON.stringify(lista, null, 2)};\n`,
);

if (APAGA_FOTO) unlinkSync(FOTO);

console.log(
  `créditos: ${lista.length} (removi ${chave})${APAGA_FOTO ? ` + ${FOTO} apagado` : ''}`,
);