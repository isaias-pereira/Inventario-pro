
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash existing plain text passwords using bcrypt
UPDATE public.app_users SET password = crypt(password, gen_salt('bf')) WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%';

-- Change shared_inventory RLS to deny all for anon
DROP POLICY IF EXISTS "Allow all on shared_inventory" ON public.shared_inventory;
CREATE POLICY "Deny all on shared_inventory" ON public.shared_inventory FOR ALL USING (false);
