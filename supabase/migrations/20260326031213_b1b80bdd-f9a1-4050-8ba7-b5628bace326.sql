ALTER TABLE public.meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny direct access to meta" ON public.meta FOR ALL TO public USING (false);