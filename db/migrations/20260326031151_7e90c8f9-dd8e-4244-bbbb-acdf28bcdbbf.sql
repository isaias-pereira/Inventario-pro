CREATE TABLE public.validade_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ean BIGINT NOT NULL,
  codigo BIGINT NOT NULL,
  descricao VARCHAR(150) NOT NULL,
  validade TIMESTAMP WITH TIME ZONE NOT NULL,
  status BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.validade_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny direct access to validade_products" ON public.validade_products FOR ALL TO public USING (false);