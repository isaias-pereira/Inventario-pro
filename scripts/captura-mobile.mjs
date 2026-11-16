/**
 * Captura páginas com viewport móvel real (390×844) via Chrome DevTools
 * Protocol.
 *
 * O `chrome --headless --screenshot --window-size=390,...` no Windows fica
 * preso à largura mínima de janela (~500 px) e recorta a imagem pela direita,
 * o que faz a página parecer quebrada. Aqui o viewport é emulado de verdade
 * (`Emulation.setDeviceMetricsOverride`), então o CSS vê 390 px.
 *
 * Uso: node scripts/captura-mobile.mjs <base> <saida> <slug...>
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as esperar } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORTA = 9333;

const [base, saida, ...slugs] = process.argv.slice(2);
if (!base || !saida) {
  console.error('uso: node scripts/captura-mobile.mjs <base> <saida> <slug...>');
  process.exit(1);
}
mkdirSync(saida, { recursive: true });

const perfil = join(process.env.TEMP, `chrome-cdp-${Date.now()}`);
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORTA}`,
  `--user-data-dir=${perfil}`,
  'about:blank',
]);
chrome.stderr.on('data', () => {});

/** Espera o DevTools responder. */
async function alvo() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA}/json/list`);
      const lista = await r.json();
      const pagina = lista.find((t) => t.type === 'page');
      if (pagina) return pagina;
    } catch {
      /* ainda subindo */
    }
    await esperar(250);
  }
  throw new Error('DevTools não respondeu');
}

const pagina = await alvo();
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((ok, erro) => {
  ws.onopen = ok;
  ws.onerror = erro;
});

let id = 0;
const pendentes = new Map();
const eventos = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pendentes.has(msg.id)) {
    const { ok, erro } = pendentes.get(msg.id);
    pendentes.delete(msg.id);
    if (msg.error) erro(new Error(msg.error.message));
    else ok(msg.result);
  } else if (msg.method) {
    eventos.push(msg);
  }
};

function enviar(method, params = {}) {
  const meu = ++id;
  ws.send(JSON.stringify({ id: meu, method, params }));
  return new Promise((ok, erro) => pendentes.set(meu, { ok, erro }));
}

async function esperarEvento(nome, ms = 20000) {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    const achado = eventos.findIndex((e) => e.method === nome);
    if (achado >= 0) return eventos.splice(achado, 1)[0];
    await esperar(50);
  }
  return null;
}

await enviar('Page.enable');
await enviar('Runtime.enable');
await enviar('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});

const rotas = slugs.length ? slugs : ['tomate'];
for (const rota of rotas) {
  const url = `${base}${rota.startsWith('/') ? rota : `/g/${rota}`}`;
  await enviar('Page.navigate', { url });
  await esperarEvento('Page.loadEventFired');
  // Fotos e fontes: espera a rede ficar quieta.
  await esperar(2500);

  const largura = await enviar('Runtime.evaluate', {
    expression: `({
      inner: window.innerWidth,
      documento: document.documentElement.scrollWidth,
      corpo: document.body.scrollWidth,
      transbordo: document.documentElement.scrollWidth > window.innerWidth + 1,
      titulo: document.title,
      dica: [...document.querySelectorAll('h2, p, span')].some((e) =>
        e.textContent.trim().toUpperCase().startsWith('DICA IMPORTANTE'),
      ),
      foto: (() => {
        const img = [...document.images].find((i) => i.src.includes('/guias/'));
        return img ? { src: img.currentSrc || img.src, largura: img.naturalWidth } : null;
      })(),
    })`,
    returnByValue: true,
  });

  const info = largura.result.value;
  const nome = rota.replace(/\//g, '-').replace(/^-/, '') || 'indice';
  const arquivo = join(saida, `${nome}.png`);
  const captura = await enviar('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  writeFileSync(arquivo, Buffer.from(captura.data, 'base64'));
  console.log(
    `${rota} | inner=${info.inner} doc=${info.documento} transborda=${info.transbordo} | ` +
      `foto=${info.foto ? `${info.foto.largura}px` : 'nenhuma'} | dica=${info.dica} | ${info.titulo}`,
  );
}

ws.close();
chrome.kill();
await esperar(500);
