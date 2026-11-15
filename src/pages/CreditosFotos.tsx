import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CREDITOS_FOTOS } from '@/data/fotos-creditos';
import { buscarGuia } from '@/data/guias';

/**
 * Créditos das fotos (`/g/creditos`).
 *
 * As fotos dos guias são reais e vêm do Wikimedia Commons. As licenças
 * CC BY e CC BY-SA exigem crédito ao autor, então esta página lista cada
 * foto com autor, licença e o link da página original.
 *
 * Fica em `/g/creditos` (e não em `/g/:slug`) porque o React Router casa
 * as rotas na ordem em que são declaradas — a rota fixa vem antes.
 */

/** "banana-prata-2" → { guia: banana-prata, numero: 2 } */
function separarChave(chave: string): { slug: string; numero: string } {
  const partes = chave.split('-');
  const numero = partes.pop() ?? '';
  return { slug: partes.join('-'), numero };
}

const ORDEM = new Map(
  CREDITOS_FOTOS.map((credito, indice) => [credito.chave, indice] as const),
);

export default function CreditosFotos() {
  useEffect(() => {
    document.title = 'Créditos das fotos — Guia de Hortifrui | SGS-PRO';
  }, []);

  const creditos = [...CREDITOS_FOTOS].sort((a, b) => {
    const produto = separarChave(a.chave).slug.localeCompare(separarChave(b.chave).slug);
    if (produto !== 0) return produto;
    return (ORDEM.get(a.chave) ?? 0) - (ORDEM.get(b.chave) ?? 0);
  });

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="mx-auto flex max-w-md items-center gap-2 px-4 pt-5">
        <img src="/sgs-icon.png" alt="" className="h-6 w-6 rounded" />
        <span className="text-xs font-medium text-neutral-500">SGS-PRO · Hortifrui</span>
      </header>

      <main className="mx-auto max-w-md px-4 pb-12">
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Créditos das fotos</h1>
        <p className="mt-1.5 text-sm leading-snug text-neutral-600">
          As fotos dos guias são reais e vêm do Wikimedia Commons, sob licenças livres.
          Cada imagem mantém o crédito ao autor original.
        </p>

        <ul className="mt-5 divide-y divide-neutral-100 border-y border-neutral-100">
          {creditos.map((credito) => {
            const { slug, numero } = separarChave(credito.chave);
            const guia = buscarGuia(slug);
            return (
              <li key={credito.chave} className="py-2.5">
                <p className="text-sm font-semibold leading-tight">
                  {guia?.nome ?? slug}
                  <span className="ml-1.5 text-xs font-normal text-neutral-400">
                    foto {numero}
                  </span>
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-neutral-600">
                  {credito.autor || 'Autor não informado'} ·{' '}
                  <a
                    href={credito.pagina}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2"
                  >
                    {credito.licenca}
                  </a>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-400">{credito.arquivo}</p>
              </li>
            );
          })}
        </ul>

        {creditos.length === 0 && (
          <p className="mt-5 rounded-xl border border-neutral-200 p-3 text-sm text-neutral-600">
            Nenhuma foto cadastrada ainda.
          </p>
        )}

        <Link
          to="/g"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ver todos os guias
        </Link>
      </main>

      <footer className="pb-8 text-center text-[11px] text-neutral-400">
        SGS-PRO · Setor de Hortifrui
      </footer>
    </div>
  );
}
