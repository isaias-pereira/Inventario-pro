-- Lista de rebaixa (rascunho e histórico).
--
-- A Rebaixa é independente da Validade: o item pode vir da tela de Validade
-- (validade_id) ou ser buscado direto no catálogo. Produtos UN usam validade;
-- produtos KG usam motivo (Excesso/Qualidade/Excesso-qualidade) e quantidade
-- fracionada em kg.
CREATE TABLE IF NOT EXISTS public.rebaixa_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ean BIGINT NOT NULL,
  codigo BIGINT NOT NULL,
  descricao VARCHAR(150) NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'UN',
  validade TIMESTAMP WITH TIME ZONE,
  motivo VARCHAR(20),
  quantidade NUMERIC(12,3) NOT NULL DEFAULT 0,
  pmz NUMERIC(12,4),
  preco_sugerido NUMERIC(12,4),
  preco_final NUMERIC(12,4),
  validade_id UUID,
  status VARCHAR(12) NOT NULL DEFAULT 'rascunho',
  batch_id UUID,
  sent_at TIMESTAMP WITH TIME ZONE,
  sent_to TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT rebaixa_products_status_check CHECK (status IN ('rascunho', 'enviada')),
  CONSTRAINT rebaixa_products_tipo_check CHECK (tipo IN ('KG', 'UN')),
  CONSTRAINT rebaixa_products_quantidade_check CHECK (quantidade > 0)
);

-- Rascunho corrente e histórico por lote enviado.
CREATE INDEX IF NOT EXISTS idx_rebaixa_status_created
  ON public.rebaixa_products(status, created_at);
CREATE INDEX IF NOT EXISTS idx_rebaixa_batch
  ON public.rebaixa_products(batch_id);

-- Um item da Validade só pode estar uma vez no rascunho; depois de enviado,
-- pode voltar para uma nova solicitação.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rebaixa_validade_draft
  ON public.rebaixa_products(validade_id)
  WHERE status = 'rascunho' AND validade_id IS NOT NULL;

ALTER TABLE public.rebaixa_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny direct access to rebaixa_products" ON public.rebaixa_products;
CREATE POLICY "Deny direct access to rebaixa_products" ON public.rebaixa_products
  AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);
