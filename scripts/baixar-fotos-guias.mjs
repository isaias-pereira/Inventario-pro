/**
 * Baixa as fotos escolhidas do Wikimedia Commons e monta os arquivos do app.
 *
 * Entrada: `scripts/fotos-escolhidas.json`
 *   { "tomate-1": "Moldy tomatoes.jpg",
 *     "tomate-2": { "arquivo": "Red tomatoes.jpg", "posicao": "centre" },
 *     "maca-3": { "url": "https://live.staticflickr.com/...jpg", "autor": "Fulano",
 *                 "licenca": "CC BY-SA 2.0", "pagina": "https://www.flickr.com/photos/..." } }
 *
 * O Commons é a fonte principal (`arquivo` busca URL e créditos na API). Quando
 * a foto está em outro banco livre (Flickr, via Openverse), informe a `url` já
 * com autor e licença — o crédito continua obrigatório.
 *
 * Saída:
 *   - `public/guias/<slug>-<n>.webp` (800×600, recorte 4:3)
 *   - `src/data/fotos-creditos.ts` (autor e licença de cada foto)
 *
 * O recorte usa o `sharp`: `npm i sharp --no-save`.
 *
 * Uso:
 *   node scripts/baixar-fotos-guias.mjs            # todas as escolhidas
 *   node scripts/baixar-fotos-guias.mjs tomate-2   # uma foto
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = resolve(RAIZ, 'public/guias');
const ESCOLHAS = resolve(RAIZ, 'scripts/fotos-escolhidas.json');
const CREDITOS = resolve(RAIZ, 'src/data/fotos-creditos.ts');
const API = 'https://commons.wikimedia.org/w/api.php';
const AGENTE = 'SGS-PRO-guias/1.0 (material interno de hortifrui)';

const escolhas = JSON.parse(readFileSync(ESCOLHAS, 'utf8'));
const filtro = process.argv[2];
const chaves = Object.keys(escolhas).filter((k) => !filtro || k === filtro);

if (!chaves.length) {
  console.log('nada para baixar');
  process.exit(0);
}

/** Busca a URL em 1600 px e os créditos de um arquivo do Commons. */
async function infoDoArquivo(nome) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: `File:${nome}`,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1600',
  });
  for (let tentativa = 1; tentativa <= 8; tentativa += 1) {
    const r = await fetch(`${API}?${params}`, { headers: { 'User-Agent': AGENTE } });
    if (r.ok) {
      const j = await r.json();
      const paginas = Object.values(j.query?.pages ?? {});
      const ii = paginas[0]?.imageinfo?.[0];
      if (!ii) throw new Error(`arquivo não encontrado: ${nome}`);
      const meta = ii.extmetadata ?? {};
      return {
        url: ii.thumburl ?? ii.url,
        largura: ii.width,
        altura: ii.height,
        arquivo: nome,
        autor: (meta.Artist?.value ?? '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
        licenca: meta.LicenseShortName?.value ?? '?',
        pagina: ii.descriptionurl,
      };
    }
    if (r.status !== 429) throw new Error(`Commons HTTP ${r.status}`);
    await new Promise((ok) => setTimeout(ok, 6_000 * tentativa));
  }
  throw new Error('Commons HTTP 429');
}

/** Créditos declarados no `fotos-escolhidas.json` (bancos fora do Commons). */
async function infoDaUrl(url, escolha) {
  if (!escolha.autor || !escolha.licenca || !escolha.pagina) {
    throw new Error('url direta exige autor, licenca e pagina no escolhas');
  }
  return {
    url,
    largura: null,
    altura: null,
    autor: escolha.autor,
    licenca: escolha.licenca,
    pagina: escolha.pagina,
    arquivo: escolha.arquivo ?? url.split('/').pop(),
  };
}

async function baixar(url) {
  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': AGENTE } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status !== 429) throw new Error(`download HTTP ${r.status}`);
    } catch (e) {
      if (tentativa === 5) throw e;
    }
    await new Promise((ok) => setTimeout(ok, 3_000 * tentativa));
  }
  throw new Error('não foi possível baixar');
}

mkdirSync(SAIDA, { recursive: true });
const creditos = existsSync(CREDITOS)
  ? JSON.parse(
      readFileSync(CREDITOS, 'utf8')
        .replace(/^[\s\S]*?=\s*/, '')
        .replace(/;\s*$/, ''),
    )
  : [];

const falhas = [];

for (const chave of chaves) {
  const escolha = escolhas[chave];
  const url = typeof escolha === 'string' ? null : escolha.url;
  const arquivo = typeof escolha === 'string' ? escolha : escolha.arquivo;
  const posicao = typeof escolha === 'string' ? 'attention' : (escolha.posicao ?? 'attention');
  const nomeSaida = resolve(SAIDA, `${chave}.webp`);

  console.log(`> ${chave} ← ${arquivo ?? url}`);
  try {
    const info = url ? await infoDaUrl(url, escolha) : await infoDoArquivo(arquivo);
    const buffer = await baixar(info.url);
    const { default: sharp } = await import('sharp');

    await sharp(buffer)
      .resize(800, 600, { fit: 'cover', position: posicao })
      .webp({ quality: 84 })
      .toFile(nomeSaida);

    const existente = creditos.findIndex((c) => c.chave === chave);
    const credito = {
      chave,
      arquivo: info.arquivo,
      autor: info.autor,
      licenca: info.licenca,
      pagina: info.pagina,
    };
    if (existente >= 0) creditos[existente] = credito;
    else creditos.push(credito);

    console.log(`  ok ${chave}.webp (${Math.round(readFileSync(nomeSaida).length / 1024)} kB)`);
  } catch (e) {
    falhas.push({ chave, erro: e.message });
    console.log(`  FALHOU ${chave}: ${e.message}`);
  }
  await new Promise((ok) => setTimeout(ok, 1_500));
}

creditos.sort((a, b) => a.chave.localeCompare(b.chave));
writeFileSync(
  CREDITOS,
  `/**\n * Créditos das fotos dos guias (gerado por \`scripts/baixar-fotos-guias.mjs\`).\n *\n * As fotos vêm do Wikimedia Commons e mantêm a licença original; a página\n * \`/g/creditos\` mostra autor e licença para cumprir a atribuição.\n */\nexport interface CreditoFoto {\n  chave: string;\n  arquivo: string;\n  autor: string;\n  licenca: string;\n  pagina: string;\n}\n\nexport const CREDITOS_FOTOS: CreditoFoto[] = ${JSON.stringify(creditos, null, 2)};\n`,
);

console.log(`\n${chaves.length} foto(s) em ${SAIDA}`);
if (falhas.length) {
  console.log(`\n${falhas.length} falha(s):`);
  for (const f of falhas) console.log(`  - ${f.chave}: ${f.erro}`);
  process.exitCode = 1;
}
