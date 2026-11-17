/**
 * Vercel Speed Insights.
 *
 * O projeto é uma SPA em Vite (não Next.js), então a integração usa o pacote
 * raiz `@vercel/speed-insights` com `injectSpeedInsights()` — o caminho
 * `/next` é só para o App Router do Next.js e não funciona aqui.
 *
 * O script é servido pela própria Vercel em `/_vercel/speed-insights/script.js`
 * (mesma origem), então a CSP `script-src 'self'` continua valendo.
 *
 * Speed Insights é opcional: se falhar, o app segue funcionando.
 */

import { injectSpeedInsights } from '@vercel/speed-insights';
import { isPreviewEnvironment } from './analytics';

let started = false;

/**
 * Injeta o script do Speed Insights (métricas de Core Web Vitals).
 * Nunca pode derrubar o app: qualquer erro é ignorado.
 */
export function startSpeedInsights(): void {
  if (started) return;
  if (isPreviewEnvironment()) return;
  started = true;
  try {
    injectSpeedInsights();
  } catch {
    // Speed Insights é opcional: segue o app normalmente.
  }
}
