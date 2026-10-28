
-- Function to verify bcrypt password
CREATE OR REPLACE FUNCTION public.verify_password(_plain text, _hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT _hash = extensions.crypt(_plain, _hash);
$$;

-- Function to hash a password
CREATE OR REPLACE FUNCTION public.hash_password(_password text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.crypt(_password, extensions.gen_salt('bf'));
$$;
