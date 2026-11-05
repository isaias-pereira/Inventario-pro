-- E-mails padrão das rebaixas (destinatários cadastrados na aba E-mail)
-- e o padrão de assunto/mensagem usado no envio.
--
-- Observação: como as demais tabelas do projeto, estas ficam sem RLS — o
-- acesso acontece só pela Serverless Function, com a conexão do Neon.

CREATE TABLE IF NOT EXISTS public.email_padrao (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(60) NOT NULL,
  email VARCHAR(160) NOT NULL,
  padrao BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT email_padrao_email_check
    CHECK (email ~* '^[^@[:space:],;]+@[^@[:space:],;]+\.[^@[:space:],;]+$')
);

-- O mesmo e-mail não pode ser cadastrado duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_email
  ON public.email_padrao (lower(email));

-- Só pode existir um e-mail padrão.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_unico_padrao
  ON public.email_padrao (padrao)
  WHERE padrao;

CREATE INDEX IF NOT EXISTS idx_email_padrao_ativo
  ON public.email_padrao (ativo);

-- Assunto e mensagem padrão do envio (uma única linha, id = 1).
CREATE TABLE IF NOT EXISTS public.email_config (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  assunto VARCHAR(200) NOT NULL,
  mensagem VARCHAR(2000) NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT email_config_linha_unica CHECK (id = 1)
);
