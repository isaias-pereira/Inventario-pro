/**
 * Vercel Web Analytics.
 *
 * O projeto é uma SPA em Vite (não Next.js), então a integração usa o
 * componente <Analytics /> de `@vercel/analytics/react` no App.tsx.
 *
 * Este arquivo fornece funções auxiliares para eventos customizados e
 * page views manuais (útil quando a navegação interna não muda a URL).
 */

import { track } from '@vercel/analytics/react';

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

/** Registra um evento customizado (ex.: 'exportar_planilha'). */
export function trackEvent(
  name: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (isPreviewEnvironment()) return;
  try {
    track(name, properties);
  } catch {
    // Evento não enviado não pode quebrar a tela.
  }
}

/**
 * Registra a tela usada pelo usuário (a URL interna não muda).
 * 
 * Nota: Com o componente <Analytics />, o tracking automático de page views
 * funciona baseado em mudanças de URL. Para SPAs onde a navegação não altera
 * a URL, você pode continuar usando esta função para registrar views manuais.
 */
export function trackView(view: string): void {
  if (isPreviewEnvironment()) return;
  try {
    track(`view_${view}`);
  } catch {
    // Pageview não enviado não pode quebrar a tela.
  }
}
