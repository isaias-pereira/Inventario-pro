/**
 * Busca fotos REAIS dos produtos no Wikimedia Commons.
 *
 * O Commons tem foto de banco de imagem (nítida, produto inteiro) e o
 * servidor de miniaturas é confiável — diferente dos agregadores que misturam
 * fontes bloqueadas.
 *
 * Saída:
 *  - `dist/contato/<slug>.html` — folha de contato com os 3 estados
 *  - `dist/contato/<slug>.json` — metadados (arquivo, licença, autor, tamanho)
 *
 * Uso:
 *   node scripts/buscar-fotos-guias.mjs tomate
 *   node scripts/buscar-fotos-guias.mjs            # todos
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = resolve(RAIZ, 'dist/contato');
const API = 'https://commons.wikimedia.org/w/api.php';
const AGENTE = 'SGS-PRO-guias/1.0 (material interno de hortifrui)';

/** Consultas por produto e por estado (1 = ainda não, 2 = no ponto, 3 = passou). */
export const CONSULTAS = {
  tomate: {
    1: ['green tomatoes', 'unripe tomatoes', 'green tomato plant'],
    2: ['red tomatoes', 'ripe tomatoes', 'tomato fruit'],
    3: ['moldy tomatoes', 'rotten tomatoes fruit', 'spoiled tomatoes', 'tomato rot'],
  },
  'banana-prata': {
    1: ['green bananas', 'unripe bananas'],
    2: ['yellow bananas', 'ripe bananas', 'bananas bunch'],
    3: ['overripe bananas', 'banana with brown spots', 'brown bananas'],
  },
  'mamao-papaia': {
    1: ['green papaya', 'unripe papaya'],
    2: ['papaya fruit', 'ripe papaya', 'papaya cut'],
    3: ['overripe papaya', 'ripe papaya orange flesh'],
  },
  abacate: {
    1: ['green avocado', 'unripe avocado'],
    2: ['avocado fruit', 'ripe avocado', 'avocado halves'],
    3: ['overripe avocado', 'rotten avocado', 'brown avocado'],
  },
  maca: {
    1: ['green apple', 'granny smith apples'],
    2: ['red apples', 'apple fruit'],
    3: ['rotten apple', 'bruised apple', 'apple rot'],
  },
  laranja: {
    1: ['oranges fruit', 'orange citrus'],
    2: ['moldy orange', 'rotten orange', 'wrinkled orange'],
  },
  melancia: {
    1: ['watermelon fruit', 'whole watermelon'],
    2: ['watermelon', 'watermelon harvest'],
    3: ['overripe watermelon', 'cracked watermelon', 'watermelon split'],
  },
  abacaxi: {
    1: ['green pineapple', 'unripe pineapple'],
    2: ['pineapple fruit', 'ripe pineapple'],
    3: ['overripe pineapple', 'brown pineapple', 'pineapple rot'],
  },
  batata: {
    1: ['potatoes', 'potato tubers'],
    2: ['sprouted potato', 'potato sprouts', 'green potato'],
  },
  cebola: {
    1: ['onions', 'brown onions'],
    2: ['sprouted onion', 'moldy onion', 'onion rot'],
  },
  cenoura: {
    1: ['carrots', 'carrot roots'],
    2: ['wilted carrots', 'soft carrot', 'old carrots'],
  },
  repolho: {
    1: ['cabbage head', 'green cabbage'],
    2: ['wilted cabbage', 'cabbage rot', 'old cabbage'],
  },
  alface: {
    1: ['lettuce head', 'iceberg lettuce'],
    2: ['leaf lettuce', 'lettuce leaves'],
    3: ['wilted lettuce', 'rotten lettuce', 'lettuce rot'],
  },
};

const ESTADOS = {
  1: 'ainda não',
  2: 'no ponto',
  3: 'passou',
};

async function buscar(termo, limite = 10) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(limite),
    gsrsearch: `${termo} filetype:bitmap`,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '400',
  });
  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    const r = await fetch(`${API}?${params}`, { headers: { 'User-Agent': AGENTE } });
    if (r.ok) {
      const j = await r.json();
      return normalizar(j, termo);
    }
    if (r.status !== 429) throw new Error(`Commons HTTP ${r.status}`);
    const espera = 3_000 * tentativa;
    console.log(`   · limite do Commons (429) — espera ${espera / 1000}s`);
    await new Promise((ok) => setTimeout(ok, espera));
  }
  throw new Error('Commons HTTP 429 (limite persistente)');
}

function normalizar(j, termo) {
  return Object.values(j.query?.pages ?? {})
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii) return null;
      const meta = ii.extmetadata ?? {};
      return {
        arquivo: p.title.replace(/^File:/, ''),
        titulo: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
        autor: (meta.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim(),
        licenca: meta.LicenseShortName?.value ?? '?',
        largura: ii.width,
        altura: ii.height,
        miniatura: ii.thumburl,
        url: ii.url,
        pagina: ii.descriptionurl,
        termo,
      };
    })
    .filter((it) => it && (it.largura ?? 0) >= 700);
}

const slug = process.argv[2];
const produtos = slug ? [slug] : Object.keys(CONSULTAS);
mkdirSync(SAIDA, { recursive: true });

for (const produto of produtos) {
  const estados = CONSULTAS[produto];
  if (!estados) {
    console.log(`?? produto desconhecido: ${produto}`);
    continue;
  }

  const secoes = [];
  const metadados = {};

  for (const [estado, termos] of Object.entries(estados)) {
    const vistos = new Set();
    const itens = [];
    for (const termo of termos) {
      try {
        for (const it of await buscar(termo)) {
          if (vistos.has(it.arquivo)) continue;
          vistos.add(it.arquivo);
          itens.push(it);
        }
      } catch (e) {
        console.log(`   ! ${termo}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 1_200));
    }
    metadados[estado] = itens;
    secoes.push(`
  <h2>${produto}-${estado} · ${ESTADOS[estado]} (${itens.length})</h2>
  <div class="grid">
${itens
  .map(
    (it, i) => `<figure>
    <div class="n">${i + 1}</div>
    <img src="${it.miniatura}" alt="" loading="lazy">
    <figcaption>${it.largura}×${it.altura} · ${it.licenca}<br>${it.titulo.slice(0, 55)}<br>${it.autor.slice(0, 35)}</figcaption>
  </figure>`,
  )
  .join('\n')}
  </div>`);
    console.log(`${produto}-${estado}: ${itens.length} candidatas`);
  }

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${produto}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 14px; background: #fff; color: #111; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  h2 { font-size: 14px; margin: 18px 0 8px; }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  figure { margin: 0; border: 1px solid #ddd; border-radius: 8px; padding: 4px; }
  .n { font-weight: 700; font-size: 13px; }
  img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; border-radius: 4px; background: #eee; }
  figcaption { font-size: 10px; color: #444; margin-top: 3px; line-height: 1.2; word-break: break-word; }
</style></head><body>
<h1>${produto} — candidatas</h1>
${secoes.join('\n')}
</body></html>`;

  writeFileSync(resolve(SAIDA, `${produto}.html`), html);
  writeFileSync(resolve(SAIDA, `${produto}.json`), JSON.stringify(metadados, null, 2));
}

console.log(`\nfolhas de contato em ${SAIDA}`);
