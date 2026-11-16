/** Lista os nomes completos (sem corte) das candidatas de um termo do Commons. */
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'SGS-PRO-guias/1.0';

const termos = process.argv.slice(2);

for (const t of termos) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '14',
    gsrsearch: t,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
  });
  for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
    const r = await fetch(`${API}?${p}`, { headers: { 'User-Agent': UA } });
    if (r.status === 429) {
      await new Promise((k) => setTimeout(k, 4000 * tentativa));
      continue;
    }
    const j = await r.json();
    console.log(`== ${t}`);
    for (const x of Object.values(j.query?.pages ?? {})) {
      const ii = x.imageinfo?.[0] ?? {};
      console.log(`   ${x.title.replace('File:', '')} | ${ii.width}x${ii.height} | ${ii.extmetadata?.LicenseShortName?.value ?? '?'}`);
    }
    break;
  }
  await new Promise((k) => setTimeout(k, 1500));
}
