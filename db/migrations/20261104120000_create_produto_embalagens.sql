-- Embalagens fechadas (caixa/fardo/saco) vinculadas a um produto.
-- O tipo da embalagem (CX/FD/SC) fica separado do tipo do produto (KG/UN).
CREATE TABLE IF NOT EXISTS public.produto_embalagens (
  id BIGSERIAL PRIMARY KEY,
  ean_fechado BIGINT NOT NULL,
  produto_codigo BIGINT NOT NULL REFERENCES public.produto(codigo) ON UPDATE CASCADE ON DELETE CASCADE,
  tipo_embalagem VARCHAR(2) NOT NULL,
  quantidade_fechada NUMERIC(12,3) NOT NULL,
  descricao VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT produto_embalagens_ean_fechado_key UNIQUE (ean_fechado),
  CONSTRAINT produto_embalagens_tipo_check CHECK (tipo_embalagem IN ('CX', 'FD', 'SC')),
  CONSTRAINT produto_embalagens_quantidade_check CHECK (quantidade_fechada > 0)
);

CREATE INDEX IF NOT EXISTS produto_embalagens_produto_codigo_idx
  ON public.produto_embalagens (produto_codigo);
