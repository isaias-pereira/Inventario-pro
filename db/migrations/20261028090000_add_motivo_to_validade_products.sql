-- Motivo do rebaixa (Excesso/Qualidade) para produtos de balança (KG).
-- Itens com motivo não vencem: são registrados na data do pedido de rebaixa.
ALTER TABLE public.validade_products ADD COLUMN IF NOT EXISTS motivo VARCHAR(20);
