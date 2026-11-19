import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';
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
    <div className="min-h-screen bg-white font-sans text-neutral-900 antialiased">
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
          <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">
            <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
            Guia do cliente
          </p>
          <h1 className="mt-3 text-balance font-serif text-[2.05rem] font-semibold leading-[1.12] tracking-[-0.01em]">
            Como escolher no ponto certo
          </h1>
          <p className="mt-2 text-pretty text-[15px] leading-relaxed text-neutral-600">
            Toque no produto para ver os passos, os estágios e a dica importante.
          </p>
        </section>

        <ul className="mt-5 grid grid-cols-2 gap-2">
          {GUIAS.map((guia) => (
            <li key={guia.slug}>
              <Link
                to={`/g/${guia.slug}`}
                className="flex h-full items-center gap-2 rounded-2xl border border-neutral-200/80 p-2 transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
              >
                <FotoProduto
                  src={fotoPrincipal(guia)}
                  alt={guia.nome}
                  tipo={guia.tipo}
                  estagio={1}
                  className="h-14 w-16 shrink-0 rounded-xl object-cover"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">
                    {guia.nome}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500">
                    {guia.familia}
                  </span>
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
