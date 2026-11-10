-- Histórico e idempotência dos alertas de validade enviados por WhatsApp.
--
-- Como as demais tabelas do projeto, fica sem RLS: o acesso acontece só pela
-- Serverless Function, com a conexão do Neon.
--
-- `slot` identifica o envio automático (`manha` = 07h, `tarde` = 13h em
-- Brasília) ou `manual` quando disparado pela tela. `dia` é o dia civil em
-- America/Sao_Paulo.

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
  CONSTRAINT whatsapp_envios_slot_check CHECK (slot IN ('manha', 'tarde', 'manual'))
);

-- Um envio automático por slot/dia. O manual pode repetir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_envios_slot_dia
  ON public.whatsapp_envios (slot, dia)
  WHERE slot <> 'manual';

CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_created
  ON public.whatsapp_envios (created_at DESC);
