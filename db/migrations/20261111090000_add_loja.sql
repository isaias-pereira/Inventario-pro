-- Multi-loja: separa os dados operacionais por loja.
--
-- O catálogo mestre (produto, produto_codigos, produto_eans, categoria,
-- produto_embalagens) continua COMPARTILHADO entre todas as lojas — as regras
-- de negócio e o cadastro de produtos são os mesmos em toda a empresa.
--
-- Todo dado OPERACIONAL (validade, inventário, consulta, metas, rebaixa,
-- arrastão, e-mail, WhatsApp) passa a ter a coluna `loja` com o código da
-- loja e é filtrado no servidor a partir do token do usuário. Os dados que já
-- existiam pertencem à loja 103 (onde o projeto foi usado até agora).
--
-- A loja padrão (103) fica como DEFAULT das colunas: assim uma gravação que
-- ainda não foi escopada continua funcionando, e o escopo explícito é
-- aplicado em todas as consultas.

-- ── Tabela de lojas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lojas (
  codigo INTEGER PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.lojas (codigo, nome) VALUES
  (83, 'Loja 83'),
  (88, 'Loja 88'),
  (92, 'Loja 92'),
  (103, 'Loja 103'),
  (104, 'Loja 104')
ON CONFLICT (codigo) DO NOTHING;

-- ── Usuários ───────────────────────────────────────────────────────────────
-- Cada usuário pertence a uma loja. O admin pode trocar de loja em tempo de
-- execução (action `switch_loja`, que re-assina o token), mas o vínculo do
-- usuário continua fixo.
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_loja_fkey'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_loja_fkey
      FOREIGN KEY (loja) REFERENCES public.lojas(codigo) ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_users_loja ON public.app_users (loja);

-- ── Validade ───────────────────────────────────────────────────────────────
ALTER TABLE public.validade_products ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
CREATE INDEX IF NOT EXISTS idx_validade_loja_status_validade
  ON public.validade_products (loja, status, validade);
CREATE INDEX IF NOT EXISTS idx_validade_loja_created_by
  ON public.validade_products (loja, created_by);

-- ── Inventário ─────────────────────────────────────────────────────────────
-- O número do lote volta a ser único por loja (cada loja tem a sua contagem).
ALTER TABLE public.shared_inventory ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;

-- O código deixa de ser único no mundo todo: o mesmo produto pode estar
-- contado em lojas diferentes (uma linha por loja/lote/produto).
ALTER TABLE public.shared_inventory DROP CONSTRAINT IF EXISTS shared_inventory_codigo_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_inventory_loja_codigo_lote
  ON public.shared_inventory (loja, codigo, lote_numero);

CREATE TABLE IF NOT EXISTS public.inventory_lotes (
  id SERIAL PRIMARY KEY,
  numero INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMP WITH TIME ZONE,
  nome TEXT,
  loja INTEGER NOT NULL DEFAULT 103
);

ALTER TABLE public.inventory_lotes ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.inventory_lotes ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;

ALTER TABLE public.inventory_lotes DROP CONSTRAINT IF EXISTS inventory_lotes_numero_key;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_lotes_loja_numero_key
  ON public.inventory_lotes (loja, numero);

CREATE TABLE IF NOT EXISTS public.inventory_lote_audit (
  id SERIAL PRIMARY KEY,
  lote_numero INTEGER NOT NULL,
  action TEXT NOT NULL,
  username TEXT,
  role TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  loja INTEGER NOT NULL DEFAULT 103
);

ALTER TABLE public.inventory_lote_audit ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
CREATE INDEX IF NOT EXISTS idx_inventory_lote_audit_loja_lote
  ON public.inventory_lote_audit (loja, lote_numero);

CREATE INDEX IF NOT EXISTS idx_shared_inventory_loja_lote
  ON public.shared_inventory (loja, lote_numero);

-- ── Consulta ───────────────────────────────────────────────────────────────
ALTER TABLE public.consulta_products ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
CREATE INDEX IF NOT EXISTS idx_consulta_products_loja_codigo
  ON public.consulta_products (loja, codigo);

-- ── Metas ──────────────────────────────────────────────────────────────────
ALTER TABLE public.metas_mensais ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
ALTER TABLE public.metas_mensais DROP CONSTRAINT IF EXISTS metas_mensais_ano_mes_dia_key;
CREATE UNIQUE INDEX IF NOT EXISTS metas_mensais_loja_ano_mes_dia_key
  ON public.metas_mensais (loja, ano, mes, dia);

-- ── Rebaixa ────────────────────────────────────────────────────────────────
ALTER TABLE public.rebaixa_products ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
CREATE INDEX IF NOT EXISTS idx_rebaixa_loja_status_created
  ON public.rebaixa_products (loja, status, created_at);

-- O mesmo item da Validade só pode estar uma vez no rascunho **da loja**:
-- o índice único parcial passa a ser composto pela loja.
DROP INDEX IF EXISTS public.idx_rebaixa_validade_draft;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rebaixa_loja_validade_draft
  ON public.rebaixa_products (loja, validade_id)
  WHERE status = 'rascunho' AND validade_id IS NOT NULL;

-- ── Arrastão ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arrastao_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corredor TEXT NOT NULL,
  started_by TEXT NOT NULL,
  participants TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'active',
  loja INTEGER NOT NULL DEFAULT 103
);

CREATE TABLE IF NOT EXISTS public.arrastao_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES arrastao_sessions(id) ON DELETE CASCADE,
  ean BIGINT NOT NULL,
  codigo BIGINT NOT NULL,
  descricao TEXT NOT NULL,
  validade TIMESTAMP WITH TIME ZONE NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  scanned_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  loja INTEGER NOT NULL DEFAULT 103
);

ALTER TABLE public.arrastao_sessions ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
ALTER TABLE public.arrastao_items ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
CREATE INDEX IF NOT EXISTS idx_arrastao_sessions_loja_status
  ON public.arrastao_sessions (loja, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_arrastao_items_loja_session
  ON public.arrastao_items (loja, session_id);

-- ── E-mail ─────────────────────────────────────────────────────────────────
-- Destinatários e texto padrão passam a ser por loja.
ALTER TABLE public.email_padrao ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;

DROP INDEX IF EXISTS public.idx_email_padrao_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_loja_email
  ON public.email_padrao (loja, lower(email));

DROP INDEX IF EXISTS public.idx_email_padrao_unico_padrao;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_padrao_loja_unico_padrao
  ON public.email_padrao (loja) WHERE padrao;

ALTER TABLE public.email_config ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
ALTER TABLE public.email_config DROP CONSTRAINT IF EXISTS email_config_linha_unica;
ALTER TABLE public.email_config DROP CONSTRAINT IF EXISTS email_config_pkey;
ALTER TABLE public.email_config ADD PRIMARY KEY (loja);

-- ── WhatsApp ───────────────────────────────────────────────────────────────
-- Um envio automático por loja/slot/dia: cada loja recebe o seu alerta.
CREATE TABLE IF NOT EXISTS public.whatsapp_envios (
  id BIGSERIAL PRIMARY KEY,
  slot VARCHAR(10) NOT NULL,
  dia DATE NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  destinatarios INTEGER NOT NULL DEFAULT 0,
  enviados INTEGER NOT NULL DEFAULT 0,
  falhas INTEGER NOT NULL DEFAULT 0,
  erro TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  loja INTEGER NOT NULL DEFAULT 103,
  CONSTRAINT whatsapp_envios_slot_check CHECK (slot IN ('manha', 'tarde', 'manual'))
);

ALTER TABLE public.whatsapp_envios ADD COLUMN IF NOT EXISTS loja INTEGER NOT NULL DEFAULT 103;
DROP INDEX IF EXISTS public.idx_whatsapp_envios_slot_dia;
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_envios_loja_slot_dia
  ON public.whatsapp_envios (loja, slot, dia)
  WHERE slot <> 'manual';

-- Destinatários do WhatsApp por loja (o número de cada loja recebe só o
-- alerta dela). O token e o número do remetente continuam no servidor.
CREATE TABLE IF NOT EXISTS public.whatsapp_destinatarios (
  id BIGSERIAL PRIMARY KEY,
  loja INTEGER NOT NULL DEFAULT 103,
  telefone VARCHAR(20) NOT NULL,
  nome VARCHAR(60),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_destinatarios_loja_fkey
    FOREIGN KEY (loja) REFERENCES public.lojas(codigo) ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_destinatarios_loja_telefone
  ON public.whatsapp_destinatarios (loja, telefone);
