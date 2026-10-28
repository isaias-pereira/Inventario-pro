ALTER TABLE public.teste ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teste FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.teste FROM anon, authenticated;
GRANT ALL ON public.teste TO service_role;