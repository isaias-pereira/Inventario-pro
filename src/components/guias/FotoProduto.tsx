import { useState } from 'react';
import { IlustracaoProduto } from './IlustracaoProduto';
import { fotoVersionada } from '@/lib/fotos';
import type { TipoIlustracao } from '@/data/guias';

interface Props {
  /** Caminho da foto dentro de `public/` (ex.: `/guias/tomate-2.webp`). */
  src?: string;
  /** Descrição da foto para quem usa leitor de tela. */
  alt: string;
  /** Produto e estágio usados no desenho de reserva, caso a foto falhe. */
  tipo: TipoIlustracao;
  estagio: 0 | 1 | 2;
  /** Classes do `<img>` (tamanho, arredondado, enquadramento). */
  className?: string;
}

/**
 * Foto do produto.
 *
 * A foto é o que o cliente vê na banca — por isso o guia usa foto de verdade
 * (versionada em `public/guias/`), não desenho. O SVG continua existindo só
 * como **reserva**: se o arquivo não carregar (cache antigo, offline sem a
 * foto), a página mostra o desenho e nunca quebra.
 */
export function FotoProduto({ src, alt, tipo, estagio, className = '' }: Props) {
  const [falhou, setFalhou] = useState(false);

  if (!src || falhou) {
    return <IlustracaoProduto tipo={tipo} estagio={estagio} className={className} titulo={alt} />;
  }

  return (
    <img
      src={fotoVersionada(src)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
      className={className}
    />
  );
}
