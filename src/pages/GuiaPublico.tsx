import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, Check, AlertTriangle, Sparkles } from 'lucide-react';
import { buscarGuia, GUIAS, type ChaveEstagio } from '@/data/guias';
import { IlustracaoProduto } from '@/components/guias/IlustracaoProduto';
import { IlustracaoPasso } from '@/components/guias/IlustracaoPasso';
import { trackEvent } from '@/lib/analytics';

/**
 * Página pública do guia ("o cliente escaneou o QR").
 *
 * Rota `/g/:slug` — fica FORA do `Index`, então não exige login: quem
 * escaneia o QR na banca é o cliente, não um usuário do sistema.
 * A página usa só conteúdo estático do front: nenhum dado de preço,
 * estoque ou validade sai daqui.
 */

/** Cores de cada estágio: espere / no ponto / passou. */
const ESTAGIO: Record<
  ChaveEstagio,
  { chip: string; linha: string; icone: typeof Clock; rotulo: string }
> = {
  espere: {
    chip: 'bg-[#F7E7C6] text-[#8A5A0E] border-[#E3C489]',
    linha: 'bg-[#D9A441]',
    icone: Clock,
    rotulo: 'Ainda não',
  },
  'no-ponto': {
    chip: 'bg-[#DFEDD8] text-[#275C33] border-[#A9CBA0]',
    linha: 'bg-[#3E7C4A]',
    icone: Check,
    rotulo: 'No ponto',
  },
  passou: {
    chip: 'bg-[#F4DCD3] text-[#8E3420] border-[#E0B3A4]',
    linha: 'bg-[#B8503A]',
    icone: AlertTriangle,
    rotulo: 'Passou do ponto',
  },
};

const PAPEL = {
  fundo: '#FBF4E6',
  tinta: '#1E2A20',
  verde: '#2F6B3C',
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
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
        style={{ backgroundColor: PAPEL.fundo, color: PAPEL.tinta }}
      >
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#8A7A5E]">
          SGS-PRO · Hortifrui
        </p>
        <h1 className="font-serif text-3xl">Não encontramos esse guia</h1>
        <p className="max-w-sm text-[#5B5343]">
          O código da etiqueta pode estar velho. Escolha um produto na lista:
        </p>
        <ul className="grid w-full max-w-md grid-cols-2 gap-2">
          {GUIAS.map((g) => (
            <li key={g.slug}>
              <Link
                to={`/g/${g.slug}`}
                className="flex items-center gap-2 rounded-xl border border-[#DCCFB4] bg-white/70 px-3 py-2 text-left text-sm hover:border-[#3E7C4A]"
              >
                <IlustracaoProduto tipo={g.tipo} estagio={1} className="h-8 w-8 shrink-0" />
                <span className="truncate">{g.nome}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          to="/g"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#2F6B3C] underline underline-offset-4"
        >
          <ArrowLeft className="h-4 w-4" /> Ver todos os guias
        </Link>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-16"
      style={{
        backgroundColor: PAPEL.fundo,
        color: PAPEL.tinta,
        backgroundImage:
          'radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.9), rgba(255,255,255,0) 60%), radial-gradient(70% 40% at 100% 100%, rgba(63,124,74,0.07), rgba(63,124,74,0) 70%)',
      }}
    >
      {/* Cabeçalho leve: marca + saída para o sistema */}
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
        {/* Capa */}
        <section className="guia-entra pt-2 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#8A7A5E]">
            {guia.familia} · como escolher
          </p>
          <h1 className="mt-2 font-serif text-[3.2rem] leading-none tracking-tight text-[#1E2A20] sm:text-6xl">
            {guia.nome}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[#5B5343]">
            {guia.resumo}
          </p>

          <div className="relative mx-auto mt-7 h-52 w-52">
            <div
              className="absolute inset-0 rounded-full blur-2xl"
              style={{ background: 'rgba(63,124,74,0.18)' }}
              aria-hidden="true"
            />
            <IlustracaoProduto
              tipo={guia.tipo}
              estagio={1}
              className="relative h-full w-full drop-shadow-sm"
              titulo={`Ilustração de ${guia.nome} no ponto`}
            />
          </div>

          {/* Resumo dos três estágios */}
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {guia.estagios.map((estagio) => {
              const estilo = ESTAGIO[estagio.chave];
              return (
                <li
                  key={estagio.chave}
                  className={`guia-entra inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${estilo.chip}`}
                  style={{ animationDelay: '260ms' }}
                >
                  <span className={`h-2 w-2 rounded-full ${estilo.linha}`} aria-hidden="true" />
                  {estagio.nome}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Como escolher */}
        <section className="mt-14">
          <h2 className="font-serif text-2xl text-[#1E2A20]">Como escolher</h2>
          <p className="mt-1 text-sm text-[#7A7059]">
            Quatro olhares rápidos na banca — dá para fazer sem largar o carrinho.
          </p>

          <ol className="mt-6 space-y-3">
            {guia.passos.map((passo, i) => (
              <li
                key={passo.titulo}
                className="guia-entra flex gap-4 rounded-2xl border border-[#E4D9BE] bg-white/70 p-4 backdrop-blur-sm"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'rgba(63,124,74,0.1)', color: PAPEL.verde }}
                >
                  <IlustracaoPasso icone={passo.icone} className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#A08F6A]">
                    Passo {i + 1}
                  </p>
                  <h3 className="font-serif text-lg leading-tight text-[#1E2A20]">
                    {passo.titulo}
                  </h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-[#4F4A3C]">{passo.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Estágios */}
        <section className="mt-14">
          <h2 className="font-serif text-2xl text-[#1E2A20]">Está no ponto?</h2>
          <p className="mt-1 text-sm text-[#7A7059]">
            Compare com o que está na banca e escolha o estágio que você quer.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {guia.estagios.map((estagio, i) => {
              const estilo = ESTAGIO[estagio.chave];
              const Icone = estilo.icone;
              const indiceEstagio = i as 0 | 1 | 2;
              return (
                <article
                  key={estagio.chave}
                  className="guia-entra flex flex-col rounded-2xl border border-[#E4D9BE] bg-white/75 p-4 backdrop-blur-sm"
                  style={{ animationDelay: `${160 + i * 110}ms` }}
                >
                  <div className="mx-auto h-24 w-24">
                    <IlustracaoProduto
                      tipo={guia.tipo}
                      estagio={indiceEstagio}
                      className="h-full w-full"
                      titulo={`${guia.nome} — ${estagio.nome}`}
                    />
                  </div>
                  <p
                    className={`mt-3 inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${estilo.chip}`}
                  >
                    <Icone className="h-3.5 w-3.5" aria-hidden="true" />
                    {estagio.veredito}
                  </p>
                  <h3 className="mt-2 font-serif text-lg leading-tight text-[#1E2A20]">
                    {estagio.nome}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#4F4A3C]">
                    {estagio.descricao}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Dica do encarregado */}
        <section className="guia-entra mt-12" style={{ animationDelay: '220ms' }}>
          <div className="relative rounded-2xl border border-[#D9C9A3] bg-[#FBEFCB] p-5">
            <span
              className="absolute -top-3 left-6 h-6 w-24 -rotate-2 rounded-sm bg-white/60 shadow-sm"
              aria-hidden="true"
            />
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[#8A6A25]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Dica do encarregado
            </p>
            <p className="mt-2 font-serif text-lg leading-snug text-[#3B3322]">{guia.dica}</p>
          </div>
        </section>

        {/* Armazenamento */}
        <section className="guia-entra mt-4" style={{ animationDelay: '260ms' }}>
          <div className="rounded-2xl border border-[#E4D9BE] bg-white/60 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#A08F6A]">
              Como guardar em casa
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#4F4A3C]">
              {guia.armazenamento}
            </p>
          </div>
        </section>

        {/* navegação */}
        <nav className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#E4D9BE] pt-6">
          <Link
            to="/g"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#2F6B3C] underline underline-offset-4"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Ver todos os produtos
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-[#2F6B3C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#245230]"
          >
            Abrir o SGS-PRO
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
      </main>

      <footer className="mx-auto mt-12 max-w-3xl px-5 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#A08F6A]">
          SGS-PRO · Setor de Hortifrui
        </p>
        <p className="mt-1 text-xs text-[#8A7A5E]">
          Conteúdo revisado pela equipe do setor. Dúvidas? Chame um encarregado na banca.
        </p>
      </footer>
    </div>
  );
}
