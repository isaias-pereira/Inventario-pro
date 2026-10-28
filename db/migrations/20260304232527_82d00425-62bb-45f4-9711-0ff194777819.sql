
-- Enable RLS on both tables
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_inventory ENABLE ROW LEVEL SECURITY;

-- app_users: allow anon read for login (only via edge function, but needed for service role)
-- No direct access - will be accessed via edge functions only
CREATE POLICY "No direct access to app_users" ON public.app_users FOR ALL USING (false);

-- shared_inventory: allow all operations via anon key (auth handled at app level)
CREATE POLICY "Allow all on shared_inventory" ON public.shared_inventory FOR ALL USING (true) WITH CHECK (true);
