/** Busca no Commons com filtro de categoria (ex.: Quality images). */
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'SGS-PRO-guias/1.0';

const termos = process.argv.slice(2);

for (const t of termos) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '12',
    gsrsearch: t,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
  });
  let feito = false;
  for (let tentativa = 1; tentativa <= 6 && !feito; tentativa += 1) {
    const r = await fetch(`${API}?${p}`, { headers: { 'User-Agent': UA } });
    if (r.status === 429) {
      const espera = 4_000 * tentativa;
      console.log(`   · limite do Commons — espera ${espera / 1000}s`);
      await new Promise((k) => setTimeout(k, espera));
      continue;
    }
    if (!r.ok) {
      console.log(`== ${t} HTTP ${r.status}`);
      break;
    }
    const j = await r.json();
    const pags = Object.values(j.query?.pages ?? {});
    console.log(`== ${t} (${pags.length})`);
    for (const x of pags) {
      const ii = x.imageinfo?.[0] ?? {};
      console.log(
        `   ${x.title.replace('File:', '').slice(0, 70)} | ${ii.width}x${ii.height} | ${ii.extmetadata?.LicenseShortName?.value ?? '?'}`,
      );
    }
    feito = true;
  }
  await new Promise((k) => setTimeout(k, 1_500));
}
