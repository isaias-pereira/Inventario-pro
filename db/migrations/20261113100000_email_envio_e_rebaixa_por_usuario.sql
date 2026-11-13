-- 20261113100000_email_envio_e_rebaixa_por_usuario.sql
--
-- 1. Conta de e-mail de envio por usuário: cada encarregado (e o admin) tem
--    a própria caixa no servidor padrão (mail.comper.com.br, TLS na 465).
--    A senha fica criptografada (AES-256-GCM) — o texto puro nunca vai para
--    o banco nem para o navegador.
-- 2. Rebaixa por usuário: o rascunho e o histórico passam a ser de cada
--    login. O admin continua enxergando todos os lotes da loja; o
--    encarregado, só os dele (`rebaixa_products.created_by`).
--
-- O runtime garante o mesmo schema de forma idempotente em
-- `api/_lib/email-envio.ts` e `api/manage-rebaixa.ts`; esta migration é a
-- fonte oficial.

CREATE TABLE IF NOT EXISTS public.email_envio (
  id BIGSERIAL PRIMARY KEY,
  usuario TEXT NOT NULL
    REFERENCES public.app_users(username) ON UPDATE CASCADE ON DELETE CASCADE,
  loja INTEGER NOT NULL DEFAULT 103
    REFERENCES public.lojas(codigo) ON UPDATE CASCADE ON DELETE RESTRICT,
  email VARCHAR(160) NOT NULL,
  senha TEXT NOT NULL,
  host VARCHAR(120) NOT NULL DEFAULT 'mail.comper.com.br',
  porta INTEGER NOT NULL DEFAULT 465,
  secure BOOLEAN NOT NULL DEFAULT TRUE,
  remetente VARCHAR(160),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT email_envio_unico UNIQUE (loja, usuario)
);

CREATE INDEX IF NOT EXISTS idx_email_envio_loja
  ON public.email_envio (loja);

-- Rascunhos repetidos do mesmo usuário (o índice antigo era por loja):
-- mantém o mais recente de cada par (loja, usuário, item da validade).
DELETE FROM public.rebaixa_products a
 USING public.rebaixa_products b
 WHERE a.status = 'rascunho'
   AND b.status = 'rascunho'
   AND a.validade_id IS NOT NULL
   AND a.validade_id = b.validade_id
   AND a.loja = b.loja
   AND a.created_by IS NOT DISTINCT FROM b.created_by
   AND (a.created_at, a.id) < (b.created_at, b.id);

DROP INDEX IF EXISTS public.idx_rebaixa_validade_draft;
DROP INDEX IF EXISTS public.idx_rebaixa_loja_validade_draft;

-- O mesmo item da Validade só pode estar uma vez no rascunho **do usuário**.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rebaixa_usuario_validade_draft
  ON public.rebaixa_products (loja, created_by, validade_id)
  WHERE status = 'rascunho' AND validade_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rebaixa_loja_created_by
  ON public.rebaixa_products (loja, created_by, status);
