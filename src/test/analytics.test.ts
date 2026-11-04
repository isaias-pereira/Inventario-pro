/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://inventario-pro-one.vercel.app/" }
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { track } = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@vercel/analytics/react', () => ({ track }));

/** Recarrega o módulo para começar com o estado limpo. */
async function loadAnalytics() {
  vi.resetModules();
  return await import('../lib/analytics');
}

beforeEach(() => {
  track.mockClear();
});

describe('Vercel Analytics', () => {
  it('registra eventos customizados', async () => {
    const { trackEvent } = await loadAnalytics();

    trackEvent('exportar_planilha', { formato: 'csv' });
    expect(track).toHaveBeenCalledWith('exportar_planilha', { formato: 'csv' });
  });

  it('registra views como eventos customizados', async () => {
    const { trackView } = await loadAnalytics();

    trackView('validade');
    expect(track).toHaveBeenCalledWith('view_validade');
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
      const { trackEvent, trackView } = await loadAnalytics();
      trackEvent('exportar_planilha');
      trackView('validade');
      expect(track).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('não quebra o app quando o analytics falha', async () => {
    track.mockImplementationOnce(() => {
      throw new Error('sem rede');
    });

    const { trackEvent, trackView } = await loadAnalytics();
    expect(() => trackEvent('exportar_planilha')).not.toThrow();
    expect(() => trackView('validade')).not.toThrow();
  });
});
