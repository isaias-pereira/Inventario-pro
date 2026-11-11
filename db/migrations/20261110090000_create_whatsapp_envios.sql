-- Histórico e idempotência dos alertas de validade enviados por WhatsApp.
--
-- Como as demais tabelas do projeto, fica sem RLS: o acesso acontece só pela
-- Serverless Function, com a conexão do Neon.
--
-- `slot` identifica o envio automático (`manha` = 07h, `tarde` = 13h em
-- Brasília) ou `manual` quando disparado pela tela. `dia` é o dia civil em
-- America/Sao_Paulo.
--
-- `loja` identifica a loja do alerta: cada loja tem o seu slot do dia, os
-- seus destinatários e os seus produtos (multi-loja — ver
-- `20261111090000_add_loja.sql`).

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

-- Um envio automático por loja/slot/dia. O manual pode repetir.
DROP INDEX IF EXISTS public.idx_whatsapp_envios_slot_dia;
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_envios_loja_slot_dia
  ON public.whatsapp_envios (loja, slot, dia)
  WHERE slot <> 'manual';

CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_created
  ON public.whatsapp_envios (created_at DESC);
