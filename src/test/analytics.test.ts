/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://inventario-pro-one.vercel.app/" }
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inject, track, pageview } = vi.hoisted(() => ({
  inject: vi.fn(),
  track: vi.fn(),
  pageview: vi.fn(),
}));

vi.mock('@vercel/analytics', () => ({ inject, track, pageview }));

/** Recarrega o módulo para começar com o estado limpo (`started = false`). */
async function loadAnalytics() {
  vi.resetModules();
  return await import('../lib/analytics');
}

beforeEach(() => {
  inject.mockClear();
  track.mockClear();
  pageview.mockClear();
});

describe('Vercel Analytics', () => {
  it('injeta o script e registra views e eventos', async () => {
    const { startAnalytics, trackEvent, trackView } = await loadAnalytics();

    startAnalytics();
    expect(inject).toHaveBeenCalledTimes(1);
    expect(inject).toHaveBeenCalledWith({ mode: 'auto' });

    trackEvent('exportar_planilha', { formato: 'csv' });
    expect(track).toHaveBeenCalledWith('exportar_planilha', { formato: 'csv' });

    trackView('validade');
    expect(pageview).toHaveBeenCalledWith({ path: '/validade' });
  });

  it('não envia nada quando o analytics não foi iniciado', async () => {
    const { trackEvent, trackView } = await loadAnalytics();

    trackEvent('exportar_planilha');
    trackView('validade');

    expect(track).not.toHaveBeenCalled();
    expect(pageview).not.toHaveBeenCalled();
  });

  it('só injeta uma vez', async () => {
    const { startAnalytics } = await loadAnalytics();

    startAnalytics();
    startAnalytics();

    expect(inject).toHaveBeenCalledTimes(1);
  });

  it('não registra tráfego em ambiente de pré-visualização', async () => {
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        hostname: 'id-preview--abc.lovableproject.com',
        self: window.self,
        top: window.top,
      },
    });

    try {
      const { startAnalytics, trackEvent } = await loadAnalytics();
      startAnalytics();
      trackEvent('exportar_planilha');
      expect(inject).not.toHaveBeenCalled();
      expect(track).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('não quebra o app quando o analytics falha', async () => {
    inject.mockImplementationOnce(() => {
      throw new Error('sem rede');
    });

    const { startAnalytics, trackEvent } = await loadAnalytics();
    expect(() => startAnalytics()).not.toThrow();
    expect(() => trackEvent('exportar_planilha')).not.toThrow();
  });
});
