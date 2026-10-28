
-- Users table for custom auth
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);

-- Seed default users
INSERT INTO public.app_users (username, password, role) VALUES
  ('admin', '123', 'admin'),
  ('user', '123', 'user');

-- Shared inventory table
CREATE TABLE public.shared_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ean text NOT NULL,
  codigo text UNIQUE NOT NULL,
  descricao text NOT NULL,
  quantidade integer NOT NULL DEFAULT 0,
  created_by text,
  updated_at timestamptz DEFAULT now()
);

-- Enable realtime for shared inventory
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_inventory;
