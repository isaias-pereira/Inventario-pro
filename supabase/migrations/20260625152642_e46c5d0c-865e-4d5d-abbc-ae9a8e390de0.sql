
-- Revoke EXECUTE on SECURITY DEFINER password helpers from anon/authenticated/public
REVOKE EXECUTE ON FUNCTION public.hash_password(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_password(text, text) FROM PUBLIC, anon, authenticated;

-- Recreate deny policies as RESTRICTIVE
DROP POLICY IF EXISTS "No direct access to app_users" ON public.app_users;
CREATE POLICY "No direct access to app_users" ON public.app_users AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct access to consulta_products" ON public.consulta_products;
CREATE POLICY "Deny direct access to consulta_products" ON public.consulta_products AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct access to produto" ON public.produto;
CREATE POLICY "Deny direct access to produto" ON public.produto AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all on shared_inventory" ON public.shared_inventory;
CREATE POLICY "Deny all on shared_inventory" ON public.shared_inventory AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct access to validade_products" ON public.validade_products;
CREATE POLICY "Deny direct access to validade_products" ON public.validade_products AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);
