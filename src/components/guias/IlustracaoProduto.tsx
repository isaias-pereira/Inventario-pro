import { useId, type ReactNode } from 'react';
import type { TipoIlustracao } from '@/data/guias';

/**
 * Ilustrações dos produtos (SVG gerado em código).
 *
 * Cada produto tem 3 paletas — uma por estágio do guia:
 *   0 = espere   (ainda não está no ponto)
 *   1 = no ponto (estado ideal)
 *   2 = passou   (passou do ponto: manchas e cor cansada)
 *
 * Desenho flat, com gradiente, brilho suave e sombra de apoio: leve
 * (nenhum arquivo de imagem), escala bem em qualquer tela e combina
 * com a paleta "papel" da página pública.
 */

interface Paleta {
  corpo: string;
  sombra: string;
  luz: string;
  acento: string;
}

interface FormaSpec {
  paletas: [Paleta, Paleta, Paleta];
  /** Manchas do estágio "passou": [x, y, r]. */
  manchas?: [number, number, number][];
  desenhar: (p: Paleta, estagio: 0 | 1 | 2, uid: string) => ReactNode;
}

const FORMAS: Record<TipoIlustracao, FormaSpec> = {
  tomate: {
    paletas: [
      { corpo: '#9DBE72', sombra: '#6E9048', luz: '#C4DCA0', acento: '#4E7134' },
      { corpo: '#E0523B', sombra: '#A83324', luz: '#F5826A', acento: '#4E7134' },
      { corpo: '#A8493A', sombra: '#6E2C22', luz: '#C8776A', acento: '#4E7134' },
    ],
    manchas: [[78, 128, 7], [124, 100, 6], [104, 146, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <circle cx="100" cy="112" r="58" fill={`url(#g-${uid})`} />
        <path
          d="M100 58c-3-11-1-19 2-26 3 7 5 15 2 26z"
          fill={p.acento}
        />
        {Array.from({ length: 5 }).map((_, i) => {
          const ang = (-90 + i * 72) * (Math.PI / 180);
          const ponta = [100 + Math.cos(ang) * 34, 56 + Math.sin(ang) * 22];
          const meio = [100 + Math.cos(ang) * 17, 56 + Math.sin(ang) * 11];
          return (
            <path
              key={i}
              d={`M100 56 Q ${meio[0]} ${meio[1] - 4} ${ponta[0]} ${ponta[1]} Q ${meio[0]} ${meio[1] + 6} 100 60 Z`}
              fill={p.acento}
            />
          );
        })}
        <ellipse
          cx="78"
          cy="88"
          rx="19"
          ry="12"
          fill="#fff"
          opacity={estagio === 2 ? 0.12 : 0.28}
          transform="rotate(-24 78 88)"
        />
      </g>
    ),
  },

  banana: {
    paletas: [
      { corpo: '#A9B95C', sombra: '#7C8C3C', luz: '#CDD77F', acento: '#6B5A32' },
      { corpo: '#F0C64A', sombra: '#C3982C', luz: '#FBE08A', acento: '#6B5A32' },
      { corpo: '#B98A42', sombra: '#87622C', luz: '#D6AD6C', acento: '#5A4A28' },
    ],
    manchas: [[86, 128, 7], [116, 146, 6], [136, 140, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <path
          d="M44 56c-16 60 12 112 64 114 30 1 52-9 65-24-21 5-49 2-75-16-30-21-42-50-40-74-2-4-10-4-14 0z"
          fill={`url(#g-${uid})`}
        />
        <path
          d="M40 50c-5 4-8 10-8 17 6-4 10-6 15-6-2-5-4-9-7-11z"
          fill={p.acento}
        />
        <path
          d="M162 152c7-3 13-8 17-15 3 9-2 17-10 22z"
          fill={p.acento}
          opacity={0.75}
        />
        <path
          d="M62 92c11 28 36 48 63 52"
          stroke="#fff"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          opacity={estagio === 2 ? 0.12 : 0.3}
        />
      </g>
    ),
  },

  mamao: {
    paletas: [
      { corpo: '#A3C255', sombra: '#769038', luz: '#C7DA86', acento: '#5E6B32' },
      { corpo: '#F0A93B', sombra: '#C97D22', luz: '#FBC873', acento: '#6B7A2E' },
      { corpo: '#B87436', sombra: '#8A5324', luz: '#D19A5C', acento: '#5E6B32' },
    ],
    manchas: [[88, 118, 8], [118, 96, 6], [104, 146, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <path
          d="M100 46c34 2 50 40 35 78-11 28-43 38-57 16-19-30-16-92 22-94z"
          fill={`url(#g-${uid})`}
        />
        <path
          d="M96 46c2-10 6-16 12-20-2 9-2 15-1 21z"
          fill={p.acento}
        />
        <ellipse
          cx="84"
          cy="92"
          rx="13"
          ry="26"
          fill="#fff"
          opacity={estagio === 2 ? 0.1 : 0.3}
          transform="rotate(-12 84 92)"
        />
      </g>
    ),
  },

  abacate: {
    paletas: [
      { corpo: '#5E8B44', sombra: '#3D6130', luz: '#86AD63', acento: '#6B5A32' },
      { corpo: '#7AA13E', sombra: '#4F7029', luz: '#A1C468', acento: '#6B5A32' },
      { corpo: '#3F5C2C', sombra: '#283C1D', luz: '#6B8750', acento: '#5A4A28' },
    ],
    manchas: [[86, 130, 9], [118, 108, 7], [100, 150, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <path
          d="M100 38c12 0 16 14 17 24 19 20 33 58 23 84-11 26-69 26-80 0-10-26 4-64 23-84 1-10 5-24 17-24z"
          fill={`url(#g-${uid})`}
        />
        <path d="M100 40c3-8 8-12 14-13-4 7-6 11-6 16z" fill={p.acento} />
        <ellipse
          cx="86"
          cy="104"
          rx="12"
          ry="24"
          fill="#fff"
          opacity={estagio === 2 ? 0.1 : 0.26}
          transform="rotate(-10 86 104)"
        />
      </g>
    ),
  },

  maca: {
    paletas: [
      { corpo: '#B9452F', sombra: '#8A2C1E', luz: '#D46A52', acento: '#6B5A32' },
      { corpo: '#E0503A', sombra: '#A9321F', luz: '#F5836A', acento: '#6B5A32' },
      { corpo: '#8E4A34', sombra: '#5E2E20', luz: '#B0705A', acento: '#5A4A28' },
    ],
    manchas: [[82, 118, 7], [122, 102, 6], [104, 144, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <path
          d="M100 54c22-18 52 0 52 38 0 38-24 68-52 68s-52-30-52-68c0-38 30-56 52-38z"
          fill={`url(#g-${uid})`}
        />
        <path d="M100 54c0-12 4-20 12-26-4 9-4 17-2 25z" fill={p.acento} />
        <path d="M112 30c14-10 30-6 34 4-12 8-26 6-34-4z" fill="#5F8F4A" />
        <ellipse
          cx="78"
          cy="92"
          rx="16"
          ry="21"
          fill="#fff"
          opacity={estagio === 2 ? 0.1 : 0.3}
          transform="rotate(-18 78 92)"
        />
      </g>
    ),
  },

  laranja: {
    paletas: [
      { corpo: '#D99233', sombra: '#A8681E', luz: '#F0B562', acento: '#5F7C34' },
      { corpo: '#F2A23C', sombra: '#B97521', luz: '#FBC678', acento: '#5F7C34' },
      { corpo: '#B4802F', sombra: '#82591B', luz: '#D3A75C', acento: '#5A6B32' },
    ],
    manchas: [[86, 124, 8], [120, 100, 6], [100, 148, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <circle cx="100" cy="110" r="56" fill={`url(#g-${uid})`} />
        <circle cx="100" cy="110" r="56" fill={`url(#p-${uid})`} opacity="0.5" />
        <circle cx="100" cy="58" r="7" fill={p.sombra} opacity="0.5" />
        <path d="M104 56c8-8 20-6 24 2-10 5-18 5-24-2z" fill={p.acento} />
        <ellipse
          cx="78"
          cy="86"
          rx="17"
          ry="12"
          fill="#fff"
          opacity={estagio === 2 ? 0.1 : 0.28}
          transform="rotate(-24 78 86)"
        />
      </g>
    ),
  },

  melancia: {
    paletas: [
      { corpo: '#4C8A4A', sombra: '#2F6134', luz: '#74AB6A', acento: '#5B7A33' },
      { corpo: '#3E7C3E', sombra: '#245229', luz: '#69A464', acento: '#5B7A33' },
      { corpo: '#6B7A52', sombra: '#455238', luz: '#8E9A74', acento: '#5A6B32' },
    ],
    manchas: [[76, 122, 8], [124, 106, 6], [100, 148, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <ellipse cx="100" cy="112" rx="72" ry="56" fill={`url(#g-${uid})`} />
        {[-46, -24, 0, 24, 46].map((dx) => (
          <path
            key={dx}
            d={`M${100 + dx} 58c${dx === 0 ? 0 : dx * 0.25} 30 ${dx === 0 ? 0 : dx * 0.25} 78 0 108`}
            stroke={p.sombra}
            strokeWidth={dx === 0 ? 9 : 6}
            strokeLinecap="round"
            fill="none"
            opacity="0.55"
          />
        ))}
        <path d="M100 58c2-10 8-16 18-18-6 7-8 12-8 18z" fill={p.acento} />
        <ellipse
          cx="74"
          cy="88"
          rx="20"
          ry="12"
          fill="#fff"
          opacity={estagio === 2 ? 0.08 : 0.26}
          transform="rotate(-16 74 88)"
        />
      </g>
    ),
  },

  abacaxi: {
    paletas: [
      { corpo: '#9CB84B', sombra: '#6F8A2E', luz: '#C0D379', acento: '#5F7C34' },
      { corpo: '#E5B03C', sombra: '#B4811F', luz: '#F7D178', acento: '#5F7C34' },
      { corpo: '#8A6A2E', sombra: '#5E471B', luz: '#B3924F', acento: '#5A6B32' },
    ],
    manchas: [[86, 116, 7], [118, 132, 6], [102, 90, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <rect x="62" y="66" width="76" height="92" rx="26" fill={`url(#g-${uid})`} />
        {Array.from({ length: 5 }).map((_, i) => (
          <path
            key={`h${i}`}
            d={`M64 ${76 + i * 18}h72`}
            stroke={p.sombra}
            strokeWidth="2.5"
            opacity="0.45"
          />
        ))}
        {Array.from({ length: 4 }).map((_, i) => (
          <path
            key={`v${i}`}
            d={`M${76 + i * 16} 68l-8 92`}
            stroke={p.sombra}
            strokeWidth="2.5"
            opacity="0.45"
          />
        ))}
        <path d="M100 66c-6-18-14-28-26-34 8 14 8 24 8 34z" fill={p.acento} />
        <path d="M100 66c0-20 4-32 10-42 2 14 0 28-2 42z" fill="#6F9A45" />
        <path d="M100 66c6-16 14-24 26-28-10 12-12 20-12 28z" fill={p.acento} />
        <ellipse
          cx="80"
          cy="92"
          rx="10"
          ry="18"
          fill="#fff"
          opacity={estagio === 2 ? 0.08 : 0.26}
        />
      </g>
    ),
  },

  batata: {
    paletas: [
      { corpo: '#C39A63', sombra: '#96703F', luz: '#D9B482', acento: '#8A6433' },
      { corpo: '#D4A970', sombra: '#A67B46', luz: '#E8C593', acento: '#8A6433' },
      { corpo: '#A98858', sombra: '#7A6038', luz: '#C4A87E', acento: '#6E5128' },
    ],
    manchas: [[80, 112, 7], [122, 128, 6], [104, 148, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <path
          d="M64 98c0-24 24-36 46-32 24 4 38 26 34 50-4 28-28 44-54 40-26-4-40-26-34-46 3-6 8-9 8-12z"
          fill={`url(#g-${uid})`}
        />
        <ellipse cx="82" cy="96" rx="5" ry="3.5" fill={p.sombra} opacity="0.8" />
        <ellipse cx="118" cy="118" rx="6" ry="4" fill={p.sombra} opacity="0.7" />
        <ellipse cx="96" cy="142" rx="4.5" ry="3" fill={p.sombra} opacity="0.6" />
        <ellipse
          cx="82"
          cy="84"
          rx="17"
          ry="11"
          fill="#fff"
          opacity={estagio === 2 ? 0.1 : 0.3}
          transform="rotate(-16 82 84)"
        />
      </g>
    ),
  },

  cebola: {
    paletas: [
      { corpo: '#D5AE62', sombra: '#A98442', luz: '#E9CA8C', acento: '#B79B5C' },
      { corpo: '#E6C36F', sombra: '#B69445', luz: '#F6DB9B', acento: '#C4A868' },
      { corpo: '#AF8F4E', sombra: '#806A33', luz: '#CBB07A', acento: '#9C8452' },
    ],
    manchas: [[84, 126, 7], [118, 108, 6], [102, 152, 5]],
    desenhar: (p, estagio, uid) => (
      <g>
        <path
          d="M92 66c0-16 4-26 8-36 4 10 8 20 8 36z"
          fill={p.acento}
        />
        <path
          d="M100 66c28 0 48 30 46 60-2 28-24 44-46 44s-44-16-46-44c-2-30 18-60 46-60z"
          fill={`url(#g-${uid})`}
        />
        <path
          d="M100 68c-10 18-14 62-6 100M100 68c10 18 14 62 6 100"
          stroke={p.sombra}
          strokeWidth="2.5"
          fill="none"
          opacity="0.5"
        />
        <path
          d="M88 170c4 6 8 8 12 8s8-2 12-8"
          stroke={p.sombra}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse
          cx="78"
          cy="92"
          rx="12"
          ry="18"
          fill="#fff"
          opacity={estagio === 2 ? 0.1 : 0.3}
          transform="rotate(-10 78 92)"
        />
      </g>
    ),
  },

  cenoura: {
    paletas: [
      { corpo: '#C9631F', sombra: '#96460F', luz: '#DE8340', acento: '#4F8038' },
      { corpo: '#ED7C26', sombra: '#B55212', luz: '#F9A05A', acento: '#4F8038' },
      { corpo: '#A9561D', sombra: '#7A3D12', luz: '#C87C45', acento: '#4F8038' },
    ],
    manchas: [[94, 112, 6], [104, 140, 5], [90, 158, 4]],
    desenhar: (p, estagio, uid) => (
      <g>
        <path
          d="M100 58c12 2 19 20 17 40l-9 66c-1 12-15 12-16 0l-9-66c-2-20 5-38 17-40z"
          fill={`url(#g-${uid})`}
        />
        <path d="M100 60c-8-14-18-22-30-24 10 8 14 14 16 24z" fill={p.acento} />
        <path d="M100 60c0-16 4-26 12-34-2 12-2 24 0 34z" fill="#5E9642" />
        <path d="M100 60c8-12 18-18 28-18-10 6-14 12-16 20z" fill={p.acento} />
        <path
          d="M84 86c8 8 24 8 32 0M87 108c7 7 19 7 26 0M90 132c6 6 14 6 20 0"
          stroke={p.sombra}
          strokeWidth="2.5"
          fill="none"
          opacity="0.45"
        />
        <ellipse
          cx="94"
          cy="88"
          rx="7"
          ry="16"
          fill="#fff"
          opacity={estagio === 2 ? 0.1 : 0.28}
        />
      </g>
    ),
  },

  repolho: {
    paletas: [
      { corpo: '#9DBE72', sombra: '#6E9048', luz: '#C0D89B', acento: '#6F9A45' },
      { corpo: '#7FAE4E', sombra: '#527E33', luz: '#A8CC74', acento: '#6F9A45' },
      { corpo: '#A8A860', sombra: '#7A7B3E', luz: '#C6C488', acento: '#8A8A3E' },
    ],
    manchas: [[74, 118, 8], [126, 112, 7], [100, 150, 6]],
    desenhar: (p, estagio, uid) => (
      <g>
        <path
          d="M46 128c-16-34 6-72 54-72s70 38 54 72c-6-26-26-44-54-44s-48 18-54 44z"
          fill={p.acento}
        />
        <circle cx="100" cy="118" r="56" fill={`url(#g-${uid})`} />
        <path
          d="M62 96c10-16 26-24 38-24s28 8 38 24"
          stroke={p.sombra}
          strokeWidth="3"
          fill="none"
          opacity="0.5"
        />
        <path
          d="M70 130c8 14 18 22 30 22s22-8 30-22"
          stroke={p.sombra}
          strokeWidth="3"
          fill="none"
          opacity="0.4"
        />
        <ellipse
          cx="76"
          cy="92"
          rx="16"
          ry="11"
          fill="#fff"
          opacity={estagio === 2 ? 0.1 : 0.28}
          transform="rotate(-18 76 92)"
        />
      </g>
    ),
  },

  alface: {
    paletas: [
      { corpo: '#8CC06A', sombra: '#5F9345', luz: '#B0D892', acento: '#6F9A45' },
      { corpo: '#9FD478', sombra: '#6CA34E', luz: '#C2E8A2', acento: '#7CAC55' },
      { corpo: '#A8A85E', sombra: '#7A7B3E', luz: '#C7C78C', acento: '#8A8A3E' },
    ],
    manchas: [[72, 116, 8], [128, 126, 7], [100, 156, 6]],
    desenhar: (p, estagio, uid) => (
      <g>
        {[-58, -30, 0, 30, 58].map((ang, i) => (
          <g key={i} transform={`rotate(${ang + (estagio === 2 ? 6 : 0)} 100 118)`}>
            <path
              d="M100 156c-32-6-46-36-36-64 10-26 46-34 70-14 24 20 20 58-6 72-8 4-20 6-28 6z"
              fill={i % 2 === 0 ? `url(#g-${uid})` : p.corpo}
              opacity={i % 2 === 0 ? 1 : 0.85}
            />
            <path
              d="M100 150c-4-22-4-44 0-64"
              stroke={p.sombra}
              strokeWidth="2.5"
              fill="none"
              opacity="0.45"
            />
          </g>
        ))}
        <ellipse cx="92" cy="108" rx="14" ry="18" fill="#fff" opacity="0.22" />
      </g>
    ),
  },
};

/** Paleta por estágio: 0 = espere, 1 = no ponto, 2 = passou. */
function paletaDoEstagio(tipo: TipoIlustracao, estagio: number) {
  const spec = FORMAS[tipo];
  const indice = estagio === 0 ? 0 : estagio === 1 ? 1 : 2;
  return spec.paletas[indice];
}

interface IlustracaoProdutoProps {
  tipo: TipoIlustracao;
  /** 0 = espere, 1 = no ponto, 2 = passou. */
  estagio?: 0 | 1 | 2;
  className?: string;
  /** Texto alternativo (a ilustração é decorativa por padrão). */
  titulo?: string;
}

/** Ilustração de um produto em um dos estágios do guia. */
export function IlustracaoProduto({
  tipo,
  estagio = 1,
  className = '',
  titulo,
}: IlustracaoProdutoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const spec = FORMAS[tipo];
  const p = spec.paletas[estagio];

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role={titulo ? 'img' : 'presentation'}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <defs>
        <linearGradient id={`g-${uid}`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={p.luz} />
          <stop offset="52%" stopColor={p.corpo} />
          <stop offset="100%" stopColor={p.sombra} />
        </linearGradient>
        <pattern id={`p-${uid}`} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.4" fill={p.sombra} opacity="0.35" />
          <circle cx="8" cy="7" r="1" fill={p.sombra} opacity="0.25" />
        </pattern>
      </defs>

      <ellipse cx="100" cy="183" rx="60" ry="9" fill="#1F2A22" opacity="0.08" />
      {spec.desenhar(p, estagio, uid)}

      {estagio === 2 &&
        spec.manchas?.map(([x, y, r], i) => (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={r}
            ry={r * 0.78}
            fill="#5B3A22"
            opacity="0.32"
            transform={`rotate(${i * 24 - 18} ${x} ${y})`}
          />
        ))}
    </svg>
  );
}
