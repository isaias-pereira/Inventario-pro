/** Testa recortes de uma foto do Commons em várias posições (uso local). */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API = 'https://commons.wikimedia.org/w/api.php';
const AGENTE = 'SGS-PRO-guias/1.0';
const [nome, prefixo, ...posicoes] = process.argv.slice(2);

const params = new URLSearchParams({
  action: 'query',
  format: 'json',
  titles: `File:${nome}`,
  prop: 'imageinfo',
  iiprop: 'url',
  iiurlwidth: '1600',
});
const r = await fetch(`${API}?${params}`, { headers: { 'User-Agent': AGENTE } });
const j = await r.json();
const ii = Object.values(j.query.pages)[0].imageinfo[0];
const img = Buffer.from(await (await fetch(ii.thumburl ?? ii.url)).arrayBuffer());
const { default: sharp } = await import('sharp');

for (const posicao of posicoes.length ? posicoes : ['attention', 'centre', 'bottom']) {
  const saida = resolve('dist/shots', `${prefixo}-${posicao}.webp`);
  await sharp(img).resize(800, 600, { fit: 'cover', position: posicao }).webp({ quality: 84 }).toFile(saida);
  console.log(`${posicao} -> ${saida}`);
}
