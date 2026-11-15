/**
 * Conferidor de candidatas: baixa as fotos indicadas, recorta no formato final
 * (800×600) e monta uma folha de contato **local** com as imagens embutidas
 * (data URI), sem depender das miniaturas do Commons.
 *
 * Entrada: JSON no formato
 *   { "tomate-1": ["Arquivo A.jpg", "Arquivo B.jpg"], "tomate-2": ["..."] }
 *
 * Saída: `dist/candidatas.html` + `dist/candidatas/<chave>-<n>.webp`
 *
 * Uso:
 *   node scripts/conferir-candidatas.mjs scripts/candidatas.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = resolve(RAIZ, 'dist/candidatas');
const API = 'https://commons.wikimedia.org/w/api.php';
const AGENTE = 'SGS-PRO-guias/1.0 (material interno de hortifrui)';

const entrada = process.argv[2] ?? resolve(RAIZ, 'scripts/candidatas.json');
const lista = JSON.parse(readFileSync(entrada, 'utf8'));

/** Uma requisição para cada bloco de 40 arquivos (limite do Commons é 50). */
async function metadados(nomes) {
  const mapa = {};
  for (let inicio = 0; inicio < nomes.length; inicio += 40) {
    const bloco = nomes.slice(inicio, inicio + 40);
    Object.assign(mapa, await metadadosBloco(bloco));
    await new Promise((ok) => setTimeout(ok, 1_500));
  }
  return mapa;
}

async function metadadosBloco(nomes) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: nomes.map((n) => `File:${n}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1400',
  });
  for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
    const r = await fetch(`${API}?${params}`, { headers: { 'User-Agent': AGENTE } });
    if (r.ok) {
      const j = await r.json();
      if (j.error) {
        console.log(`   ! API: ${j.error.code} ${j.error.info}`);
        return {};
      }
      const mapa = {};
      for (const p of Object.values(j.query?.pages ?? {})) {
        const ii = p.imageinfo?.[0];
        if (!ii) continue;
        const meta = ii.extmetadata ?? {};
        mapa[p.title.replace(/^File:/, '')] = {
          url: ii.thumburl ?? ii.url,
          largura: ii.width,
          altura: ii.height,
          autor: (meta.Artist?.value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
          licenca: meta.LicenseShortName?.value ?? '?',
        };
      }
      return mapa;
    }
    if (r.status !== 429) throw new Error(`Commons HTTP ${r.status}`);
    const espera = 5_000 * tentativa;
    console.log(`   · limite do Commons (429) — espera ${espera / 1000}s`);
    await new Promise((ok) => setTimeout(ok, espera));
  }
  throw new Error('Commons HTTP 429');
}

async function baixar(url) {
  for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': AGENTE } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status !== 429) throw new Error(`download HTTP ${r.status}`);
    } catch (e) {
      if (tentativa === 6) throw e;
    }
    await new Promise((ok) => setTimeout(ok, 4_000 * tentativa));
  }
  throw new Error('download falhou');
}

mkdirSync(SAIDA, { recursive: true });
const { default: sharp } = await import('sharp');

const nomes = [
  ...new Set(
    Object.values(lista)
      .flat()
      .map((item) => (typeof item === 'string' ? item : item.arquivo)),
  ),
];

const info = await metadados(nomes);
console.log(`${Object.keys(info).length}/${nomes.length} arquivos localizados`);

const cartoes = [];
for (const [chave, arquivos] of Object.entries(lista)) {
  for (let i = 0; i < arquivos.length; i += 1) {
    const nome = typeof arquivos[i] === 'string' ? arquivos[i] : arquivos[i].arquivo;
    const posicao =
      typeof arquivos[i] === 'string' ? 'attention' : (arquivos[i].posicao ?? 'attention');
    const meta = info[nome];
    if (!meta) {
      console.log(`!! ${chave}-${i + 1}: não encontrado (${nome})`);
      continue;
    }
    try {
      const buffer = await baixar(meta.url);
      const destino = resolve(SAIDA, `${chave}-${i + 1}.webp`);
      await sharp(buffer)
        .resize(800, 600, { fit: 'cover', position: posicao })
        .webp({ quality: 84 })
        .toFile(destino);
      cartoes.push({
        chave,
        indice: i + 1,
        nome,
        autor: meta.autor,
        licenca: meta.licenca,
        tamanho: `${meta.largura}×${meta.altura}`,
        dataUri: `data:image/webp;base64,${readFileSync(destino).toString('base64')}`,
      });
      console.log(`ok ${chave}-${i + 1} (${nome})`);
    } catch (e) {
      console.log(`!! ${chave}-${i + 1} ${nome}: ${e.message}`);
    }
    await new Promise((ok) => setTimeout(ok, 1_200));
  }
}

const grupos = Object.keys(lista)
  .map((chave) => {
    const itens = cartoes.filter((c) => c.chave === chave);
    if (!itens.length) return '';
    return `<h2>${chave}</h2><div class="grid">${itens
      .map(
        (c) => `<figure>
  <div class="n">${c.indice}</div>
  <img src="${c.dataUri}" alt="">
  <figcaption>${c.tamanho} · ${c.licenca}<br>${c.nome.slice(0, 60)}<br>${c.autor.slice(0, 40)}</figcaption>
</figure>`,
      )
      .join('')}</div>`;
  })
  .join('\n');

writeFileSync(
  resolve(RAIZ, 'dist/candidatas.html'),
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>candidatas</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 14px; background: #fff; color: #111; }
  h1 { font-size: 17px; margin: 0 0 10px; }
  h2 { font-size: 14px; margin: 16px 0 6px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  figure { margin: 0; border: 1px solid #ddd; border-radius: 8px; padding: 4px; }
  .n { font-weight: 700; font-size: 13px; }
  img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; border-radius: 4px; }
  figcaption { font-size: 10px; color: #444; margin-top: 3px; line-height: 1.2; }
</style></head><body>
<h1>Candidatas recortadas (800×600)</h1>
${grupos}
</body></html>`,
);

console.log(`\n${cartoes.length} candidata(s) em dist/candidatas.html`);
