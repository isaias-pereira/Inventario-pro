import type { IconePasso } from '@/data/guias';

/**
 * Ícones dos "passos" do guia (o que o cliente deve olhar, tocar, cheirar…).
 *
 * Traço simples, 48×48, na cor do texto — combinam com a tipografia
 * editorial da página pública e não pesam nada no bundle.
 */

const CAMINHOS: Record<IconePasso, React.ReactNode> = {
  olho: (
    <>
      <path d="M5 24s7.5-11 19-11 19 11 19 11-7.5 11-19 11S5 24 5 24z" />
      <circle cx="24" cy="24" r="6" />
      <circle cx="24" cy="24" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  toque: (
    <>
      <circle cx="24" cy="19" r="7" />
      <path d="M13 33c3 5 7 7 11 7s8-2 11-7" />
      <path d="M8 40c4 4 10 6 16 6s12-2 16-6" opacity="0.55" />
    </>
  ),
  cheiro: (
    <>
      <path d="M19 32c-5-7-3-15 5-18 7-2 12 2 12 8 0 5-4 10-10 10-3 0-5 0-7 0z" />
      <path d="M39 15c3 3 3 8 0 11" />
      <path d="M43 10c5 6 5 15 0 21" opacity="0.55" />
    </>
  ),
  peso: (
    <>
      <path d="M24 10v26" />
      <path d="M10 15h28" />
      <path d="M24 10l-3 5h6z" fill="currentColor" stroke="none" />
      <path d="M4 28a6 6 0 0 0 12 0" />
      <path d="M10 15l-6 13M38 15l6 13" />
      <path d="M17 40h14" />
    </>
  ),
  som: (
    <>
      <path d="M12 20h7l9-7v22l-9-7h-7z" />
      <path d="M33 19c3 3 3 7 0 10" />
      <path d="M38 13c6 6 6 16 0 22" opacity="0.55" />
    </>
  ),
  casca: (
    <>
      <circle cx="21" cy="21" r="12" />
      <path d="M30 30l10 10" />
      <circle cx="17" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="24" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="24" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  folha: (
    <>
      <path d="M12 38C10 22 22 10 40 10c0 18-12 30-28 28z" />
      <path d="M14 36C22 28 30 22 38 16" />
    </>
  ),
  talo: (
    <>
      <path d="M24 42V16" />
      <path d="M24 22c-8 0-13-4-13-10 7-1 12 3 13 10z" />
      <path d="M24 30c8 0 13-4 13-10-7-1-12 3-13 10z" />
    </>
  ),
};

interface IlustracaoPassoProps {
  icone: IconePasso;
  className?: string;
  /** Cor do traço (padrão: cor do texto). */
  cor?: string;
}

/** Ícone do passo, desenhado em traço. */
export function IlustracaoPasso({ icone, className = '', cor }: IlustracaoPassoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke={cor ?? 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {CAMINHOS[icone]}
    </svg>
  );
}
