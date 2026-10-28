
CREATE TABLE public.metas_mensais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  dia INTEGER NOT NULL CHECK (dia >= 1 AND dia <= 31),
  meta NUMERIC NOT NULL DEFAULT 0,
  realizado NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (ano, mes, dia)
);

ALTER TABLE public.metas_mensais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny direct access to metas_mensais"
  ON public.metas_mensais
  FOR ALL
  USING (false);
