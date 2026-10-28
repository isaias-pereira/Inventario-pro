ALTER TABLE public.teste ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teste FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.teste FROM anon, authenticated;
-- O papel service_role existe apenas no Supabase; no Neon puro pulamos o grant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.teste TO service_role';
  END IF;
END $$;