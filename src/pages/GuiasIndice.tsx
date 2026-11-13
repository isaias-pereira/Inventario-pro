import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { GUIAS } from '@/data/guias';
import { IlustracaoProduto } from '@/components/guias/IlustracaoProduto';
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
    <div
      className="min-h-screen pb-16"
      style={{
        backgroundColor: '#FBF4E6',
        color: '#1E2A20',
        backgroundImage:
          'radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.9), rgba(255,255,255,0) 60%)',
      }}
    >
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <img src="/sgs-icon.png" alt="" className="h-8 w-8 rounded-lg" />
          <div className="leading-tight">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#8A7A5E]">
              SGS-PRO
            </p>
            <p className="font-serif text-base">Guia de Hortifrui</p>
          </div>
        </div>
        <Link
          to="/"
          className="rounded-full border border-[#DCCFB4] bg-white/70 px-3 py-1.5 text-xs font-medium text-[#5B5343] transition hover:border-[#3E7C4A] hover:text-[#2F6B3C]"
        >
          Abrir o sistema
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5">
        <section className="guia-entra pt-2 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#8A7A5E]">
            {GUIAS.length} produtos
          </p>
          <h1 className="mt-2 font-serif text-[2.6rem] leading-tight sm:text-5xl">
            Como escolher no ponto certo
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#5B5343]">
            Toque no produto para ver os passos, os estágios e a dica do encarregado.
          </p>
        </section>

        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {GUIAS.map((guia, i) => (
            <li key={guia.slug} className="guia-entra" style={{ animationDelay: `${i * 60}ms` }}>
              <Link
                to={`/g/${guia.slug}`}
                className="group flex h-full flex-col items-center gap-1 rounded-2xl border border-[#E4D9BE] bg-white/75 p-4 text-center transition hover:-translate-y-0.5 hover:border-[#3E7C4A] hover:shadow-sm"
              >
                <IlustracaoProduto tipo={guia.tipo} estagio={1} className="h-20 w-20" />
                <span className="font-serif text-lg text-[#1E2A20]">{guia.nome}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#A08F6A]">
                  {guia.familia}
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#2F6B3C]">
                  Ver guia
                  <ArrowRight
                    className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <footer className="mx-auto mt-12 max-w-3xl px-5 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#A08F6A]">
          SGS-PRO · Setor de Hortifrui
        </p>
      </footer>
    </div>
  );
}
