/**
 * Busca fotos no Openverse (agrega Flickr, Wikimedia, museus) e imprime as
 * candidatas. Usado só para os estados que o Commons não tem bem cobertos
 * (fruta passada, verdura murcha).
 *
 * Uso:
 *   node scripts/buscar-openverse.mjs "overripe papaya" "wilted carrots"
 */
const API = 'https://api.openverse.org/v1/images/';
const AGENTE = 'SGS-PRO-guias/1.0';

const termos = process.argv.slice(2);

for (const termo of termos) {
  const params = new URLSearchParams({
    q: termo,
    license: 'cc0,pdm,by,by-sa',
    size: 'large',
    page_size: '20',
    mature: 'false',
  });
  try {
    const r = await fetch(`${API}?${params}`, { headers: { 'User-Agent': AGENTE } });
    if (!r.ok) {
      console.log(`== ${termo}: HTTP ${r.status}`);
      continue;
    }
    const j = await r.json();
    const itens = (j.results ?? []).filter((it) => (it.width ?? 0) >= 1000);
    console.log(`== ${termo} (${j.result_count}, ${itens.length} grandes)`);
    for (const it of itens) {
      console.log(
        `   ${it.title?.slice(0, 55)} | ${it.license}${it.license_version ?? ''} | ${it.width}x${it.height} | ${it.source} | ${it.url}`,
      );
    }
  } catch (e) {
    console.log(`== ${termo}: ERRO ${e.message}`);
  }
  await new Promise((ok) => setTimeout(ok, 1_500));
}
