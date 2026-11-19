import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Leaf, ListChecks } from 'lucide-react';
import { buscarGuia, fotoPrincipal, GUIAS, type ChaveEstagio } from '@/data/guias';
import { FotoProduto } from '@/components/guias/FotoProduto';
import { IlustracaoPasso } from '@/components/guias/IlustracaoPasso';
import { trackEvent } from '@/lib/analytics';

/**
 * Página pública do guia ("o cliente escaneou o QR").
 *
 * Rota `/g/:slug` — fica FORA do `Index`, então não exige login: quem
 * escaneia o QR na banca é o cliente, não um usuário do sistema.
 *
 * A página foi feita **para o celular**: coluna estreita, foto do produto
 * como imagem principal e texto curto, para o cliente ler sem rolar muito.
 * Nenhum dado de preço, estoque ou validade sai daqui.
 */

/**
 * Selo de cada estágio.
 * - espere  (âmbar): ainda não está no ponto, ripa em casa
 * - guardar (azul):   não amadurece na banca — pode guardar para depois
 * - no-ponto (verde): o estado ideal
 * - passou  (rust):   passou do ponto — o veredito sempre convida a
 *                     escolher **outra peça da banca**, nunca a recusar a compra
 */
const ESTAGIO: Record<ChaveEstagio, { chip: string; ponto: string; rotulo: string }> = {
  espere: {
    chip: 'bg-amber-50 text-amber-900 border-amber-300',
    ponto: 'bg-amber-500',
    rotulo: 'Ainda não',
  },
  guardar: {
    chip: 'bg-sky-50 text-sky-900 border-sky-300',
    ponto: 'bg-sky-500',
    rotulo: 'Pode guardar',
  },
  'no-ponto': {
    chip: 'bg-emerald-50 text-emerald-900 border-emerald-300',
    ponto: 'bg-emerald-600',
    rotulo: 'No ponto',
  },
  passou: {
    chip: 'bg-orange-50 text-orange-900 border-orange-300',
    ponto: 'bg-orange-500',
    rotulo: 'Passou do ponto',
  },
};

export default function GuiaPublico() {
  const { slug = '' } = useParams();
  const guia = buscarGuia(slug);

  useEffect(() => {
    if (!guia) return;
    document.title = `${guia.nome} — Guia de Hortifrui | SGS-PRO`;
    trackEvent('guia_view', { slug: guia.slug });
  }, [guia]);

  if (!guia) {
    return (
      <div className="min-h-screen bg-white font-sans text-neutral-900 antialiased">
        <header className="mx-auto flex max-w-md items-center gap-2 px-4 pt-5">
          <img src="/sgs-icon.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-xs font-medium text-neutral-500">SGS-PRO · Hortifrui</span>
        </header>
        <main className="mx-auto max-w-md px-4 pb-12">
          <h1 className="mt-6 text-balance font-serif text-[2rem] font-semibold leading-[1.12] tracking-[-0.01em]">
            Não encontramos esse guia
          </h1>
          <p className="mt-2 text-pretty text-[15px] leading-relaxed text-neutral-600">
            O código da etiqueta pode estar velho. Escolha um produto na lista:
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {GUIAS.map((g) => (
              <li key={g.slug}>
                <Link
                  to={`/g/${g.slug}`}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 p-1.5 text-sm font-medium hover:border-emerald-600"
                >
                  <FotoProduto
                    src={fotoPrincipal(g)}
                    alt={g.nome}
                    tipo={g.tipo}
                    estagio={1}
                    className="h-9 w-12 shrink-0 rounded object-cover"
                  />
                  <span className="truncate">{g.nome}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/g"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ver todos os guias
          </Link>
        </main>
      </div>
    );
  }

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

      <main className="mx-auto max-w-md px-4 pb-10">
        {/* Nome e foto do produto — o cartão de abertura do guia */}
        <section className="pt-4" aria-labelledby="guia-titulo">
          <div className="overflow-hidden rounded-[26px] border border-emerald-100/90 bg-white shadow-[0_24px_50px_-32px_rgba(6,95,70,0.55)]">
            <div className="relative bg-neutral-100">
              <FotoProduto
                src={fotoPrincipal(guia)}
                alt={`${guia.nome} no ponto certo`}
                tipo={guia.tipo}
                estagio={1}
                className="aspect-[4/3] w-full object-cover object-center"
              />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800 shadow-sm backdrop-blur-sm">
                <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
                {guia.familia}
              </span>
            </div>

            <div className="px-4 pb-5 pt-4">
              <h1
                id="guia-titulo"
                className="text-balance font-serif text-[2.05rem] font-semibold leading-[1.12] tracking-[-0.01em] text-neutral-900"
              >
                {guia.nome}
              </h1>
              <p className="mt-2 text-pretty text-[15px] leading-relaxed text-neutral-600">
                {guia.resumo}
              </p>
            </div>
          </div>
        </section>

        {/* Como escolher — o bloco mais importante da página: fica em destaque */}
        <section className="mt-8" aria-labelledby="como-escolher">
          <div className="overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50 to-white shadow-[0_18px_40px_-28px_rgba(6,95,70,0.55)]">
            <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 px-4 py-3.5 text-white">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25">
                <ListChecks className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2
                  id="como-escolher"
                  className="text-lg font-extrabold leading-tight tracking-tight"
                >
                  Como escolher
                </h2>
                <p className="text-[11px] font-medium text-emerald-50/90">
                  {guia.passos.length} sinais rápidos na hora da compra
                </p>
              </div>
            </div>

            <ol className="space-y-2 p-2.5">
              {guia.passos.map((passo, i) => (
                <li
                  key={`${passo.titulo}-${i}`}
                  className="flex gap-3 rounded-2xl border border-neutral-200/70 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100">
                    <IlustracaoPasso icone={passo.icone} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[15px] font-bold leading-tight text-neutral-900">
                        {passo.titulo}
                      </p>
                      <span
                        className="text-[11px] font-extrabold tabular-nums text-emerald-600/60"
                        aria-hidden="true"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-600">{passo.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Está no ponto? */}
        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide">Está no ponto?</h2>
          <p className="mt-1 text-[13px] text-neutral-600">
            Compare com o que está na banca e escolha o estágio que você quer.
          </p>
          <ul className="mt-2 space-y-2">
            {guia.estagios.map((estagio) => {
              const estilo = ESTAGIO[estagio.chave];
              return (
                <li
                  key={estagio.chave}
                  className="flex gap-3 rounded-xl border border-neutral-200 p-2"
                >
                  <FotoProduto
                    src={estagio.foto}
                    alt={`${guia.nome}: ${estagio.nome}`}
                    tipo={guia.tipo}
                    estagio={estagio.ilustracao ?? 1}
                    className="h-[4.5rem] w-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <span
                      title={`${estilo.rotulo}: ${estagio.veredito}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${estilo.chip}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${estilo.ponto}`} aria-hidden="true" />
                      {estagio.veredito}
                    </span>
                    <p className="mt-1 text-sm font-semibold leading-tight">{estagio.nome}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-neutral-600">
                      {estagio.descricao}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Dica e armazenamento */}
        <section className="mt-6 space-y-2">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
              Dica Importante
            </p>
            <p className="mt-1 text-[13px] leading-snug text-amber-950">{guia.dica}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              Como guardar em casa
            </p>
            <p className="mt-1 text-[13px] leading-snug text-neutral-700">{guia.armazenamento}</p>
          </div>
        </section>
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
