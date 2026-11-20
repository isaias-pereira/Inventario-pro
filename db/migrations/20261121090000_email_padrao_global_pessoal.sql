-- Migração: separa contatos de e-mail em globais (por loja) e pessoais (por usuário)
-- 
-- Contatos globais: gerencia, carlos, horacio - visíveis para todos os encarregados da loja
-- Contatos pessoais: cada encarregado gerencia os seus (daniele, valeria, cassio para Isaias)

-- Adiciona colunas para distinguir tipo e dono
ALTER TABLE public.email_padrao
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'global'
    CHECK (tipo IN ('global', 'pessoal')),
  ADD COLUMN IF NOT EXISTS usuario TEXT
    REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_email_padrao_loja_tipo
  ON public.email_padrao (loja, tipo);

CREATE INDEX IF NOT EXISTS idx_email_padrao_usuario
  ON public.email_padrao (usuario);

-- Unicidade:
-- - global: único por (loja, email) - admin gerencia
-- - pessoal: único por (usuario, email) - cada encarregado gerencia os seus
DROP INDEX IF EXISTS idx_email_padrao_loja_email;
DROP INDEX IF EXISTS idx_email_padrao_loja_unico_padrao;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_global_unico
  ON public.email_padrao (loja, lower(email))
  WHERE tipo = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_pessoal_unico
  ON public.email_padrao (usuario, lower(email))
  WHERE tipo = 'pessoal';

-- Unicidade do padrão:
-- - global: apenas 1 padrão por loja
-- - pessoal: apenas 1 padrão por usuário
DROP INDEX IF EXISTS idx_email_padrao_loja_unico_padrao;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_global_padrao
  ON public.email_padrao (loja)
  WHERE tipo = 'global' AND padrao;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_pessoal_padrao
  ON public.email_padrao (usuario)
  WHERE tipo = 'pessoal' AND padrao;

-- Dados existentes viram 'global' (já é o default)
-- O admin deve reclassificar os pessoais manualmente ou via script:
-- UPDATE email_padrao SET tipo = 'pessoal', usuario = 'Isaias' WHERE email IN ('daniele@...', 'valeria@...', 'cassio@...');

-- Comentários para documentação
COMMENT ON COLUMN public.email_padrao.tipo IS 'global = visível para todos da loja (admin gerencia); pessoal = só do usuário dono';
COMMENT ON COLUMN public.email_padrao.usuario IS 'Dono do contato pessoal (NULL para globais)';