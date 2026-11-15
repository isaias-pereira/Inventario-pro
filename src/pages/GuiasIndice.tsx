import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GUIAS, fotoPrincipal } from '@/data/guias';
import { FotoProduto } from '@/components/guias/FotoProduto';
import { trackEvent } from '@/lib/analytics';

/**
 * Índice público dos guias (`/g`).
 *
 * Serve de destino para o QR quando a etiqueta aponta para a bancada
 * inteira, e de busca para quem escaneou um código antigo.
 */
export default function GuiasIndice() {
  useEffect(() => {
    document.title = 'Guia de Hortifrui | SGS-PRO';
    trackEvent('guia_indice');
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <img src="/sgs-icon.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-xs font-medium text-neutral-500">SGS-PRO · Hortifrui</span>
        </div>
        <Link to="/" className="text-xs text-neutral-400 hover:text-neutral-700">
          Sistema
        </Link>
      </header>

      <main className="mx-auto max-w-md px-4 pb-12">
        <section className="pt-4">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">
            Como escolher no ponto certo
          </h1>
          <p className="mt-1.5 text-sm text-neutral-600">
            Toque no produto para ver os passos, os estágios e a dica do encarregado.
          </p>
        </section>

        <ul className="mt-5 grid grid-cols-2 gap-2">
          {GUIAS.map((guia) => (
            <li key={guia.slug}>
              <Link
                to={`/g/${guia.slug}`}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 p-1.5 hover:border-emerald-600"
              >
                <FotoProduto
                  src={fotoPrincipal(guia)}
                  alt={guia.nome}
                  tipo={guia.tipo}
                  estagio={1}
                  className="h-12 w-16 shrink-0 rounded-lg object-cover"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {guia.nome}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500">{guia.familia}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <footer className="pb-8 text-center text-[11px] text-neutral-400">
        SGS-PRO · Setor de Hortifrui ·{' '}
        <Link to="/g/creditos" className="underline decoration-neutral-300 underline-offset-2">
          Créditos das fotos
        </Link>
      </footer>
    </div>
  );
}
