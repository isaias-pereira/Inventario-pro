-- 20261113090000_encarregados_e_remove_enc_flv.sql
--
-- 1. Remove o perfil `enc_flv`: quem tinha esse perfil passa a ser
--    `encarregado` (é o perfil operacional mais próximo, com inventário,
--    validade e rebaixa).
-- 2. Cria o vínculo N:N entre um usuário operacional
--    (`user`, `promotor`, `col_validade`) e um ou mais encarregados.
-- 3. Liga os usuários existentes ao(s) admin(s), uma única vez.
--
-- O runtime também garante a tabela e o seed de forma idempotente em
-- `api/_lib/encarregados.ts`; esta migration é a fonte oficial do schema.

UPDATE public.app_users
   SET role = 'encarregado'
 WHERE role = 'enc_flv';

-- Marcador para o seed rodar uma única vez (mesmo que o admin remova todos os
-- vínculos depois, o runtime não volta a ligá-los ao admin).
CREATE TABLE IF NOT EXISTS public.app_schema_flags (
  flag TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.usuario_encarregados (
  id BIGSERIAL PRIMARY KEY,
  usuario TEXT NOT NULL
    REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE,
  encarregado TEXT NOT NULL
    REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE,
  loja INTEGER NOT NULL
    REFERENCES public.lojas(codigo) ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usuario_encarregados_nao_self CHECK (usuario <> encarregado)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_encarregados_unique
  ON public.usuario_encarregados (usuario, encarregado);
CREATE INDEX IF NOT EXISTS idx_usuario_encarregados_encarregado
  ON public.usuario_encarregados (loja, encarregado);
CREATE INDEX IF NOT EXISTS idx_usuario_encarregados_usuario
  ON public.usuario_encarregados (loja, usuario);

-- Seed único: cada user/promotor/col_validade existente passa a ter o(s)
-- admin(s) como encarregado(s). O admin é root e continua vendo tudo.
WITH flag AS (
  INSERT INTO public.app_schema_flags (flag)
  VALUES ('encarregados_admin_seed')
  ON CONFLICT (flag) DO NOTHING
  RETURNING flag
)
INSERT INTO public.usuario_encarregados (usuario, encarregado, loja)
SELECT u.username, a.username, u.loja
  FROM public.app_users u
  JOIN public.app_users a ON a.role = 'admin'
 WHERE u.role IN ('user', 'promotor', 'col_validade')
   AND EXISTS (SELECT 1 FROM flag)
ON CONFLICT (usuario, encarregado) DO NOTHING;
