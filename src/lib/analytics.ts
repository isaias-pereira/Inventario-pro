/**
 * Vercel Web Analytics.
 *
 * O projeto é uma SPA em Vite (não Next.js), então a integração usa o pacote
 * raiz `@vercel/analytics` com `inject()` — o caminho `/next` é só para o
 * App Router do Next.js e não funciona aqui.
 *
 * A navegação interna do app (Consulta, Inventário, Validade…) não muda a URL,
 * por isso cada tela é registrada na mão com `trackView`.
 */

import { inject, pageview, track } from '@vercel/analytics';

let started = false;

/** Ambientes que não devem contar como tráfego real. */
function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  return (
    host.includes('id-preview--') ||
    host.includes('lovableproject.com') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}

/**
 * Injeta o script do Analytics e começa a registrar as visitas.
 * Nunca pode derrubar o app: qualquer erro é ignorado.
 */
export function startAnalytics(): void {
  if (started) return;
  if (isPreviewEnvironment()) return;
  started = true;
  try {
    // `auto` usa o script de desenvolvimento no `npm run dev`
    // e o de produção no build da Vercel.
    inject({ mode: 'auto' });
  } catch {
    // Analytics é opcional: segue o app normalmente.
  }
}

/** Registra um evento customizado (ex.: 'exportar_planilha'). */
export function trackEvent(
  name: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!started) return;
  try {
    track(name, properties);
  } catch {
    // Evento não enviado não pode quebrar a tela.
  }
}

/** Registra a tela usada pelo usuário (a URL interna não muda). */
export function trackView(view: string): void {
  if (!started) return;
  try {
    pageview({ path: `/${view}` });
  } catch {
    // Pageview não enviado não pode quebrar a tela.
  }
}
