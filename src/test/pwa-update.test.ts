/**
 * Atualização do PWA.
 *
 * O app é servido pelo cache do service worker: sem uma checagem forçada a
 * pessoa continua vendo o bundle antigo (foi o que manteve o filtro de seção
 * removido aparecendo no Inventário).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Ouvinte = () => void;

interface Cenario {
  update: ReturnType<typeof vi.fn>;
  getRegistration: ReturnType<typeof vi.fn>;
  ouvintes: Map<string, Ouvinte[]>;
}

function instalarServiceWorker(controller: object | null): Cenario {
  const ouvintes = new Map<string, Ouvinte[]>();
  const update = vi.fn(async () => undefined);
  const getRegistration = vi.fn(async () => ({ update }));
  const sw = {
    controller,
    addEventListener: (tipo: string, cb: Ouvinte) => {
      ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), cb]);
    },
    getRegistration,
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: sw,
  });
  return { update, getRegistration, ouvintes };
}

function disparar(cenario: Cenario, tipo: string) {
  for (const cb of cenario.ouvintes.get(tipo) ?? []) cb();
}

/** Deixa as promessas pendentes (getRegistration/update) resolverem. */
async function assentar() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('atualização do PWA', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('não quebra quando o navegador não tem service worker', async () => {
    const { startPwaUpdates } = await import('@/lib/pwa-update');
    expect(() => startPwaUpdates()).not.toThrow();
  });

  it('procura uma versão nova ao abrir e quando a aba volta a ficar visível', async () => {
    const cenario = instalarServiceWorker({});
    const { startPwaUpdates } = await import('@/lib/pwa-update');

    startPwaUpdates();
    await assentar();

    expect(cenario.getRegistration).toHaveBeenCalledTimes(1);
    expect(cenario.update).toHaveBeenCalledTimes(1);

    // A checagem é limitada a uma a cada 5 minutos.
    document.dispatchEvent(new Event('visibilitychange'));
    await assentar();
    expect(cenario.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000);
    await assentar();
    expect(cenario.update).toHaveBeenCalledTimes(2);
  });

  it('não procura atualização com a aba escondida', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const cenario = instalarServiceWorker({});
    const { startPwaUpdates } = await import('@/lib/pwa-update');

    startPwaUpdates();
    await assentar();

    expect(cenario.update).not.toHaveBeenCalled();
  });

  it('recarrega uma única vez quando um service worker novo assume o controle', async () => {
    const cenario = instalarServiceWorker({ scriptURL: '/sw.js' });
    const reload = vi.fn();
    const locationOriginal = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...locationOriginal, reload },
    });

    try {
      const { startPwaUpdates } = await import('@/lib/pwa-update');
      startPwaUpdates();

      disparar(cenario, 'controllerchange');
      disparar(cenario, 'controllerchange');

      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: locationOriginal,
      });
    }
  });

  it('não recarrega na primeira instalação (a página ainda não era controlada)', async () => {
    const cenario = instalarServiceWorker(null);
    const reload = vi.fn();
    const locationOriginal = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...locationOriginal, reload },
    });

    try {
      const { startPwaUpdates } = await import('@/lib/pwa-update');
      startPwaUpdates();

      disparar(cenario, 'controllerchange');

      expect(reload).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: locationOriginal,
      });
    }
  });
});
