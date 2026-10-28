
-- Re-hash any passwords that weren't properly hashed (pgcrypto is in extensions schema)
UPDATE public.app_users 
SET password = extensions.crypt(password, extensions.gen_salt('bf')) 
WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%';
