
CREATE TABLE public.consulta_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  descricao text NOT NULL,
  estoque numeric NOT NULL DEFAULT 0,
  preco numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.consulta_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny direct access to consulta_products"
  ON public.consulta_products
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false);
