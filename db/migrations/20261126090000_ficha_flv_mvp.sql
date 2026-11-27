-- Migration: MVP da ficha técnica FLV (Fort Atacadista) + registro de qualidade no recebimento
-- Data: 2026-11-26
--
-- Tabelas do CATÁLOGO (compartilhadas entre lojas, sem coluna de loja, sem RLS —
-- mesmo padrão de produto/produto_eans/categoria):
--   flv_ficha, flv_ficha_codigo, flv_ficha_defeito
-- Tabela OPERACIONAL (por loja, com RLS no mesmo padrão das demais):
--   flv_recebimento
--
-- Seed: top 30 fichas por cobertura do catálogo (ver scripts/gerar-fichas-flv.mjs).

CREATE TABLE IF NOT EXISTS public.flv_ficha (
  codigo TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  grupo TEXT NOT NULL,
  pagina_pdf INTEGER NOT NULL,
  revisao TEXT,
  data_revisao TEXT,
  fonte TEXT NOT NULL,
  pontos_atencao JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.flv_ficha_codigo (
  ficha_codigo TEXT NOT NULL REFERENCES public.flv_ficha(codigo) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'BALANCA', 'EAN')),
  codigo BIGINT NOT NULL,
  PRIMARY KEY (tipo, codigo)
);

CREATE TABLE IF NOT EXISTS public.flv_ficha_defeito (
  id BIGSERIAL PRIMARY KEY,
  ficha_codigo TEXT NOT NULL REFERENCES public.flv_ficha(codigo) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  grupo TEXT NOT NULL CHECK (grupo IN ('PODRIDAO', 'GRAVE', 'LEVE')),
  nome TEXT NOT NULL,
  cat1 NUMERIC(5,2),
  cat2 NUMERIC(5,2),
  detalhe TEXT,
  UNIQUE (ficha_codigo, ordem)
);
CREATE INDEX IF NOT EXISTS idx_flv_ficha_defeito_ficha ON public.flv_ficha_defeito(ficha_codigo, ordem);

CREATE TABLE IF NOT EXISTS public.flv_recebimento (
  id UUID PRIMARY KEY,
  loja INTEGER NOT NULL REFERENCES public.lojas(codigo) ON UPDATE CASCADE,
  created_by TEXT NOT NULL,
  produto_codigo BIGINT,
  produto_ean BIGINT,
  descricao TEXT,
  ficha_codigo TEXT REFERENCES public.flv_ficha(codigo),
  amostra INTEGER NOT NULL CHECK (amostra > 0 AND amostra <= 10000),
  decisao TEXT NOT NULL CHECK (decisao IN ('aprovado', 'ressalva', 'rebaixa', 'rejeitado')),
  defeitos JSONB NOT NULL DEFAULT '[]'::jsonb,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flv_recebimento_loja_created ON public.flv_recebimento(loja, created_at DESC);

-- RLS da tabela operacional (mesmo padrão das demais tabelas por loja).
-- A função é recriada aqui (OR REPLACE) para a migration não depender de outra.
CREATE OR REPLACE FUNCTION public.current_loja() RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_loja', true), '')::int;
$$;
ALTER TABLE public.flv_recebimento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flv_recebimento_select_loja ON public.flv_recebimento;
CREATE POLICY flv_recebimento_select_loja ON public.flv_recebimento FOR SELECT USING (loja = public.current_loja());
DROP POLICY IF EXISTS flv_recebimento_insert_loja ON public.flv_recebimento;
CREATE POLICY flv_recebimento_insert_loja ON public.flv_recebimento FOR INSERT WITH CHECK (loja = public.current_loja());
DROP POLICY IF EXISTS flv_recebimento_delete_loja ON public.flv_recebimento;
CREATE POLICY flv_recebimento_delete_loja ON public.flv_recebimento FOR DELETE USING (loja = public.current_loja());

-- Seed das fichas (ON CONFLICT DO NOTHING: re-rodar é idempotente).

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-34-C', 'PIMENTÕES - VERDE, AMARELO, VERMELHO,', 'Legumes', 212, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa de todos os pimentões é 8 Kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'ENTRADA', 631493) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'ENTRADA', 632082) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'ENTRADA', 632090) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'ENTRADA', 830143) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'ENTRADA', 830160) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'ENTRADA', 830178) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'BALANCA', 118) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'BALANCA', 119) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'BALANCA', 239) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'BALANCA', 2608) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'BALANCA', 2609) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-34-C', 'BALANCA', 2610) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 1, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 4, 'GRAVE', 'Queimadura de Sol', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 5, 'GRAVE', 'Imatura', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 6, 'GRAVE', 'Amarelado', 3, NULL, 'Perda de coloração.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 7, 'LEVE', 'Sem Pedúnculo', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 8, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 9, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-34-C', 10, 'LEVE', 'Sujidade', 10, NULL, 'Residual de sujeira encontrado no fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-172-C', 'UVAS ESCURAS COM SEMENTES: BENITAKA,', 'Frutas', 116, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa da uva Niágara é de 10 bandeja de 1kg, as demais 10 bandeja de 500 gr.;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'ENTRADA', 683582) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'ENTRADA', 729019) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'ENTRADA', 743038) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'ENTRADA', 856541) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'ENTRADA', 856568) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'BALANCA', 184) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'BALANCA', 1950) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'BALANCA', 249) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'BALANCA', 354) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'BALANCA', 470) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'EAN', 7908046701222) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-172-C', 'EAN', 7908046701338) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 1, 'GRAVE', 'Baga partida', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 2, 'GRAVE', 'Raquis seca (Talo)', 3, NULL, 'Talo seco') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 4, 'GRAVE', 'Degrana', 3, NULL, 'Bagas soltas') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 6, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 7, 'GRAVE', 'Oídio', 3, NULL, 'Ataque de fungos') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 8, 'GRAVE', 'Queimada', 3, NULL, 'Queimada de sol ou Gelo') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 9, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 10, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 11, 'LEVE', 'Ausência de pruína', 10, NULL, 'Cera que recobre as bagas') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 12, 'LEVE', 'Sujidade', 10, NULL, 'Restos culturais') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 13, 'LEVE', 'Amarelada', 10, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-172-C', 14, 'LEVE', 'Cicatriz', 10, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-78-C', 'MELÕES ESPECIAIS: GALIA / NET MELON / ORANGE', 'Frutas', 96, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa do melão Gália 9kg, Net Melon e Orange 6kg e Cantaloupe, Matisse e Melão Rei (Redinha)","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'ENTRADA', 1326333) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'ENTRADA', 717223) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'ENTRADA', 732915) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'ENTRADA', 880400) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'ENTRADA', 958557) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'BALANCA', 160) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'BALANCA', 1706) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'BALANCA', 498) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'BALANCA', 6179) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-78-C', 'BALANCA', 946) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 4, 'GRAVE', 'Doença Pedúnculo', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 6, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 7, 'LEVE', 'Barriga Branca', 10, NULL, 'Coloração branca na casca') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 8, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 9, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-78-C', 10, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-36-C', 'TOMATES - CAQUI, SALADA, ITALIANO E HOLANDÊS', 'Legumes', 216, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso da caixa do tomate Holandês é de 4 a 8 kg;","O peso da caixa do tomate Italiano, Salada e Débora é de 18 kg;","O peso da caixa do tomate Caqui é de 2 kg;","Produto passível de devolução com percentual de maturação acima de 20%."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'ENTRADA', 1135759) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'ENTRADA', 207969) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'ENTRADA', 716430) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'ENTRADA', 777528) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'ENTRADA', 871990) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'BALANCA', 153) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'BALANCA', 246) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'BALANCA', 2613) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'BALANCA', 5133) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-36-C', 'BALANCA', 9673) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 1, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 2, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 3, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 4, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 5, 'GRAVE', 'Imatura', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 6, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 7, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 8, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-36-C', 9, 'LEVE', 'Dano Mecânico', 10, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-92-C', 'PERAS IMPORTADAS: D`ANJOU / WILLIANS /', 'Frutas', 109, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa do Pera D’anjou, Importada, Red e Packans 18 kg e Pera Portuguesa 10 kg.","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'ENTRADA', 683590) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'ENTRADA', 778346) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'ENTRADA', 795496) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'ENTRADA', 866830) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'ENTRADA', 929999) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'BALANCA', 353) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'BALANCA', 528) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'BALANCA', 632) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'BALANCA', 736) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-92-C', 'BALANCA', 9126) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 4, 'GRAVE', 'Queimada', 3, NULL, 'Queimadura grave de sol ou frio.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 6, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 7, 'GRAVE', 'Antracnose', 3, NULL, 'Doença causada por fungos.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 8, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 9, 'LEVE', 'Queimadura Leve', 10, NULL, 'Manchas leves de sol') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 10, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 11, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-92-C', 12, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-82-C', 'MEXERICAS COMUNS: CRAVO / RIO / MURCOTE /', 'Frutas', 99, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da Murcote, Rio e Pokan 18kg e Cravo 10kg.","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-82-C', 'ENTRADA', 725994) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-82-C', 'BALANCA', 289) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 4, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 6, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 7, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 8, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-82-C', 9, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-43-C', 'ABACAXIS: GOMOS DE MEL, HAWAI, PÉROLA,', 'Frutas', 60, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["A caixa dos abacaxis Pérola e Hawaí deverão vir com dez unidades;","A caixa do abacaxi Gomos de mel deverá vir com 4 unidades;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-43-C', 'ENTRADA', 2511711) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-43-C', 'ENTRADA', 632112) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-43-C', 'ENTRADA', 654850) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-43-C', 'ENTRADA', 961906) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-43-C', 'BALANCA', 1114102) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-43-C', 'BALANCA', 11533903) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-43-C', 'BALANCA', 3000014093019) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-43-C', 'BALANCA', 7898366000139) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-43-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (brocado)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-43-C', 1, 'GRAVE', 'Gomose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-43-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-43-C', 3, 'GRAVE', 'Dano', 3, NULL, 'Danos comuns que ocorre no transporte ou manuseio') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-43-C', 4, 'GRAVE', 'Sem coroa', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-43-C', 5, 'GRAVE', 'Passado', 3, NULL, 'Estágio avançado de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-43-C', 6, 'GRAVE', 'Amassado', 3, NULL, 'Produto com amassamento, estrutura afetada') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-43-C', 7, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-141-C', 'MANGAS ESPECIAIS: ROSA / ESPADA / KEITY /', 'Frutas', 84, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa das mangas Espada e Hadem é de 4,5kg; Keity 4kg e Rosa 5,5kg.","As mangas deverão chegar com uma proteção papel;","Seguir a sazonalidade na negociação.","Produto passível de devolução com percentual de maturação acima de 20%."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-141-C', 'ENTRADA', 1445782) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-141-C', 'ENTRADA', 2254646) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-141-C', 'ENTRADA', 829412) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-141-C', 'ENTRADA', 829765) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-141-C', 'BALANCA', 352) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-141-C', 'BALANCA', 5242) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-141-C', 'BALANCA', 5291) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-141-C', 'BALANCA', 664) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 1, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 4, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 5, 'GRAVE', 'Imatura', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 6, 'GRAVE', 'Mancha grave', 3, NULL, 'Manchas escuras.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 7, 'GRAVE', 'Amassado', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 8, 'GRAVE', 'Passado', 3, NULL, 'Fruto com estágio de maturação avançado') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 9, 'GRAVE', 'Colapso interno', 3, NULL, 'Passada internamente') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 10, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 11, 'LEVE', 'Mancha leve', 10, NULL, 'Manchas escuras.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 12, 'LEVE', 'Resíduo de cal', 10, NULL, 'Restos de cal no fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-141-C', 13, 'LEVE', 'Resina', 10, NULL, 'Secreção do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-137-C', 'LARANJAS - PERA / BAHIA / GRAPE FRUIT / LIMA / LIMA', 'Frutas', 72, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa das laranjas Bahia e Grape Fruit é 14 kg;","O peso padrão da caixa das laranjas Lima e Lima da Pérsia é 17 Kg;","O peso padrão da caixa da laranja pera é 20 Kg;0","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-137-C', 'ENTRADA', 207993) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-137-C', 'ENTRADA', 631876) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-137-C', 'ENTRADA', 736074) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-137-C', 'ENTRADA', 794589) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-137-C', 'BALANCA', 1337) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-137-C', 'BALANCA', 1821) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-137-C', 'BALANCA', 226) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-137-C', 'BALANCA', 737) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 1, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 4, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 5, 'GRAVE', 'Mancha grave', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 6, 'GRAVE', 'Desidratada', 3, NULL, 'Sem suco, seca.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 7, 'GRAVE', 'Pinta preta', 3, NULL, 'Manchas pretas.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-137-C', 8, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-01-C', 'ABÓBORA MORANGA, KABOTIA, PAULISTA E SECA', 'Legumes', 198, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da abóbora kabotia é moranga 20 Kg;","O peso padrão da abóbora paulista é 10 Kg;","A abóbora seca é recebida por unidade;","As abóboras deverão chegar impreterivelmente em caixas HB ou SACO – não receber em caixa de madeira;","Sempre seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-01-C', 'ENTRADA', 25750355) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-01-C', 'ENTRADA', 633151) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-01-C', 'ENTRADA', 633178) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-01-C', 'ENTRADA', 844985) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-01-C', 'BALANCA', 203) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-01-C', 'BALANCA', 205) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-01-C', 'BALANCA', 6679) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-01-C', 'BALANCA', 977) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 1, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 2, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 3, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 4, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 5, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 6, 'GRAVE', 'Imatura', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 7, 'LEVE', 'Queimadura de Sol', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 8, 'LEVE', 'Sem Pedúnculo', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 9, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 10, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-01-C', 11, 'LEVE', 'Sujidade', 10, NULL, 'Residual de sujeira encontrado no fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-64-C', 'MAÇÃS ESPECIAIS: RED / GRANNY SMITH / PINK LAIDE', 'Frutas', 76, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa das maças importadas é de 18 Kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-64-C', 'ENTRADA', 1010921) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-64-C', 'ENTRADA', 716413) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-64-C', 'ENTRADA', 875953) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-64-C', 'BALANCA', 3345) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-64-C', 'BALANCA', 703) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-64-C', 'BALANCA', 9398) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 1, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 4, 'GRAVE', 'Queimadura de Sol', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 5, 'GRAVE', 'Antracnose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 6, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 7, 'GRAVE', 'Mancha grave', 3, NULL, 'Manchas escuras') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 8, 'GRAVE', 'Passado', 3, NULL, 'Fruto com o estágio de maturação avançado.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 9, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-64-C', 10, 'LEVE', 'Queimadura de sol', 10, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-31-C', 'PEPINOS - SALADA, CAIPIRA E JAPONES', 'Legumes', 210, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso da caixa dos pepinos é de 18 Kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-31-C', 'ENTRADA', 632040) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-31-C', 'ENTRADA', 632058) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-31-C', 'ENTRADA', 632066) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-31-C', 'BALANCA', 10) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-31-C', 'BALANCA', 291) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-31-C', 'BALANCA', 78) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-31-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-31-C', 1, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-31-C', 2, 'GRAVE', 'Amarelado', 3, NULL, 'O produto perdeu a sua coloração original.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-31-C', 3, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-31-C', 4, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-31-C', 5, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-31-C', 6, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-31-C', 7, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-173-C', 'UVAS ESCURAS SEM SEMENTES: BLACK, CANDY', 'Outros', 119, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa das uvas é de 10 bandeja de 500 gr.;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-173-C', 'ENTRADA', 792756) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-173-C', 'BALANCA', 6498) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-173-C', 'EAN', 7899276552510) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-173-C', 'EAN', 7908046701406) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-173-C', 'EAN', 7908046701468) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-173-C', 'EAN', 79080467070735) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-173-C', 'EAN', 7908046710200) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 1, 'GRAVE', 'Baga partida', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 2, 'GRAVE', 'Raquis seca (Talo)', 3, NULL, 'Talo seco') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 4, 'GRAVE', 'Degrana', 3, NULL, 'Bagas soltas') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 6, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 7, 'GRAVE', 'Oídio', 3, NULL, 'Ataque de fungos') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 8, 'GRAVE', 'Queimada', 3, NULL, 'Queimada de sol ou Gelo') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 9, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 10, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 11, 'LEVE', 'Ausência de pruína', 10, NULL, 'Cera que recobre as bagas') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 12, 'LEVE', 'Sujidade', 10, NULL, 'Restos culturais') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 13, 'LEVE', 'Amarelada', 10, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-173-C', 14, 'LEVE', 'Cicatriz', 10, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-17-C', 'CEBOLAS - NACIONAL, IMPORTADA, ROXA E', 'Legumes', 232, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa da cebola nacional e importada é de 20 kg;","O produto deverá ser armazenado em local fresco e arejado, fora da refrigeração;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-17-C', 'ENTRADA', 1004808) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-17-C', 'ENTRADA', 206865) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-17-C', 'ENTRADA', 631728) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-17-C', 'BALANCA', 218) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-17-C', 'BALANCA', 7023) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-17-C', 'BALANCA', 8980) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-17-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-17-C', 1, 'GRAVE', 'Brotamento', 3, NULL, 'Surgimento de um novo broto na superfície do produto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-17-C', 2, 'GRAVE', 'Camisa d`água', 3, NULL, 'Concentração de umidade no produto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-17-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-17-C', 4, 'GRAVE', 'Bico d`água', 3, NULL, 'Concentração de umidade nas extremidades externas.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-17-C', 5, 'GRAVE', 'Melando', 3, NULL, 'Secreção decorrente do início da podridão.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-17-C', 6, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-17-C', 7, 'LEVE', 'Sujidade', 10, NULL, 'Residual de sujeira encontrado no fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-118-C', 'FIGOS: ÍNDIA / ROXO / VERDE', 'Frutas', 146, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão do Figo da Índia é de 3 bdj de 300 gr., Figo Roxo 3 bdj de 300 gr. e Figo Verde de 2kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-118-C', 'ENTRADA', 857173) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-118-C', 'ENTRADA', 957011) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-118-C', 'ENTRADA', 993425) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-118-C', 'BALANCA', 1066) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-118-C', 'BALANCA', 1100) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-118-C', 'BALANCA', 1726) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 4, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 6, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 7, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-118-C', 8, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-103-C', 'BANANA DA TERRA/ MAÇÃ / OURO / PRATA / NANICA', 'Frutas', 62, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa para todas as bananas e de 20 kg.","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-103-C', 'ENTRADA', 631590) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-103-C', 'ENTRADA', 631612) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-103-C', 'ENTRADA', 631620) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-103-C', 'ENTRADA', 631639) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-103-C', 'BALANCA', 210) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-103-C', 'BALANCA', 2119) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-103-C', 'BALANCA', 212) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-103-C', 'BALANCA', 2330) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 4, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 5, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 6, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 7, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 8, 'GRAVE', 'Imaturo', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 9, 'GRAVE', 'Queimada', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 10, 'GRAVE', 'Despenca', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 11, 'LEVE', 'Sujidade', 10, NULL, 'Restos de materiais.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 12, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 13, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-103-C', 14, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-08-C', 'BATATA - ASTERIX, BOLINHA E LAVADA', 'Legumes', 222, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso da caixa da batata Asterix é 20 Kg;","O peso da caixa da batata Lavada é 25 e 50 Kg;","Seguir a sazonalidade na negociação;","O produto deverá ser armazenado em local com poucas luzes para evitar o esverdeamento;","Evitar armazenar em local refrigerado;"]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-08-C', 'ENTRADA', 206873) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-08-C', 'ENTRADA', 778834) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-08-C', 'ENTRADA', 855529) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-08-C', 'BALANCA', 1959) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-08-C', 'BALANCA', 217) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-08-C', 'BALANCA', 279) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 1, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 2, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 4, 'GRAVE', 'Esfolada', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 5, 'GRAVE', 'Esverdeada', 3, NULL, 'Produto com coloração verde por conta de exposição a luz.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 6, 'GRAVE', 'Brotamento', 3, NULL, 'Surgimento de um novo broto na superfície do produto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 7, 'GRAVE', 'Manchada', 3, NULL, 'Produto com partes escurecidas.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-08-C', 8, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-179-C', 'UVAS CLARAS SEM SEMENTES: ARRA, COTTON', 'Frutas', 113, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa das uvas é de 10 bandeja de 500 gr.;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-179-C', 'ENTRADA', 856622) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-179-C', 'BALANCA', 355) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-179-C', 'EAN', 7908046701291) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-179-C', 'EAN', 7908046701444) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-179-C', 'EAN', 7908046701451) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 1, 'GRAVE', 'Baga partida', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 2, 'GRAVE', 'Raquis seca (Talo)', 3, NULL, 'Talo seco') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 4, 'GRAVE', 'Degrana', 3, NULL, 'Bagas soltas') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 6, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 7, 'GRAVE', 'Oídio', 3, NULL, 'Ataque de fungos') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 8, 'GRAVE', 'Queimada', 3, NULL, 'Queimada de sol ou Gelo') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 9, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 10, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 11, 'LEVE', 'Ausência de pruína', 10, NULL, 'Cera que recobre as bagas') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 12, 'LEVE', 'Sujidade', 10, NULL, 'Restos culturais') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 13, 'LEVE', 'Amarelada', 10, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-179-C', 14, 'LEVE', 'Cicatriz', 10, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-112-C', 'CAQUI - CHOCOLATE (KYOTO) / RAMA FORTE / FUYU', 'Frutas', 138, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa de todos os Caquis são de 6 kg;","Todos os frutos deverão vir envolvidos com papel para proteger da ação do frio;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-112-C', 'ENTRADA', 1006517) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-112-C', 'ENTRADA', 631710) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-112-C', 'ENTRADA', 933074) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-112-C', 'BALANCA', 1365) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-112-C', 'BALANCA', 1797) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-112-C', 'BALANCA', 358) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 3, 'GRAVE', 'Queimada', 3, NULL, 'Queimadura grave de sol ou frio.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 4, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 5, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 6, 'GRAVE', 'Pinta preta', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 7, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 8, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 9, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-112-C', 10, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-77-C', 'MELÕES COMUNS: AMARELO (ESPANHOL) / PELE', 'Frutas', 94, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa do melão Amarelo (Espanhol) 13kg e o Pele de Sapo é de 10 kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-77-C', 'ENTRADA', 631990) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-77-C', 'ENTRADA', 712302) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-77-C', 'BALANCA', 319) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-77-C', 'BALANCA', 7068) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 4, 'GRAVE', 'Doença Pedúnculo', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 6, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 7, 'LEVE', 'Barriga Branca', 10, NULL, 'Coloração branca na casca') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 8, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 9, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-77-C', 10, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-68-C', 'MANGAS COMUNS: TOMMY / PALMER', 'Frutas', 82, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa de manga é 17 kg;","As mangas deverão chegar com uma proteção papel;","Seguir a sazonalidade na negociação.","Produto passível de devolução com percentual de maturação acima de 20%."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-68-C', 'ENTRADA', 631930) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-68-C', 'ENTRADA', 631949) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-68-C', 'BALANCA', 6091) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-68-C', 'BALANCA', 725) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 1, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 4, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 5, 'GRAVE', 'Imatura', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 6, 'GRAVE', 'Mancha grave', 3, NULL, 'Manchas escuras.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 7, 'GRAVE', 'Amassado', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 8, 'GRAVE', 'Passado', 3, NULL, 'Fruto com estágio de maturação avançado') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 9, 'GRAVE', 'Colapso interno', 3, NULL, 'Passada internamente.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 10, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 11, 'LEVE', 'Mancha leve', 10, NULL, 'Manchas escuras.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 12, 'LEVE', 'Resíduo de cal', 10, NULL, 'Restos de cal no fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-68-C', 13, 'LEVE', 'Resina', 3, NULL, 'Secreção do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-193-C', 'CHEIRO VERDE, CEBOLINHA, COENTRO E', 'Folhagens', 36, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O padrão do cheiro verde é por maço;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-193-C', 'ENTRADA', 629227) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-193-C', 'ENTRADA', 631736) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-193-C', 'ENTRADA', 631787) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-193-C', 'ENTRADA', 824550) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-193-C', 'BALANCA', 1030518) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-193-C', 'BALANCA', 1043037) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-193-C', 'BALANCA', 1067279) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-193-C', 'BALANCA', 1114133) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-193-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-193-C', 1, 'GRAVE', 'Amarelada', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-193-C', 2, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-193-C', 3, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos a planta.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-193-C', 4, 'GRAVE', 'Queimada', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-193-C', 5, 'GRAVE', 'Doenças fúngicas', 3, NULL, 'Ataque de fungos') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-193-C', 6, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-193-C', 7, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-187-C', 'REPOLHOS: ROXO E VERDE', 'Folhagens', 52, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa do repolho verde e roxo é de 15kg;","Seguir a sazonalidade na negociação.","Considerar o peso líquido após limpeza das folhas."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-187-C', 'ENTRADA', 631531) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-187-C', 'ENTRADA', 631540) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-187-C', 'BALANCA', 244) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-187-C', 'BALANCA', 245) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 4, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 6, 'GRAVE', 'Dano por inseto', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 7, 'GRAVE', 'Queimado', 3, NULL, 'Resíduos de agro tóxico.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 8, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 9, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-187-C', 10, 'LEVE', 'Sujidade', 10, NULL, 'Restos culturais') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-16-C', 'CARÁ / INHAME', 'Legumes', 230, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa do Cará é 18 Kg;","O peso padrão da caixa do Inhame é 15 Kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-16-C', 'ENTRADA', 631841) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-16-C', 'ENTRADA', 687510) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-16-C', 'BALANCA', 183) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-16-C', 'BALANCA', 281) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 1, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 4, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 5, 'GRAVE', 'Quebrado', 3, NULL, 'Talhado.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 6, 'GRAVE', 'Brotamento', 3, NULL, 'Surgimento de um novo broto na superfície do produto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 7, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-16-C', 8, 'LEVE', 'Sujidade', 10, NULL, 'Residual de sujeira encontrado no fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-148-C', 'MEXERICAS ESPECIAIS: IMPORTADA', 'Frutas', 101, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da Mexerica Importada (Clemeville) 9kg, Dekopon 10kg","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-148-C', 'ENTRADA', 793388) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-148-C', 'ENTRADA', 957038) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-148-C', 'BALANCA', 1336) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-148-C', 'BALANCA', 6857) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 4, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 5, 'GRAVE', 'Mancha Grave', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 6, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 7, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 8, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-148-C', 9, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-144-C', 'MELANCIAS ESPECIAIS:BABY / PINGO DOCE', 'Frutas', 92, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa da melancia Baby 16kg, Pingo doce amarela ou vermelha é de 14 kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-144-C', 'ENTRADA', 1300970) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-144-C', 'ENTRADA', 1679376) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-144-C', 'ENTRADA', 2618184) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-144-C', 'BALANCA', 1597) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-144-C', 'BALANCA', 376) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-144-C', 'BALANCA', 3921) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-144-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-144-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-144-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-144-C', 3, 'GRAVE', 'Polpa branca', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-144-C', 4, 'GRAVE', 'Manchada', 3, NULL, 'Produto com partes escurecidas Grave.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-144-C', 5, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-144-C', 6, 'LEVE', 'Manchas leves', 10, NULL, 'Produto com partes escurecidas leves.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-139-C', 'LIMÃO TAITI / SICILIANO', 'Frutas', 74, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa do limão Thaiti é de 20 kg;","O peso padrão da caixa do limão siciliano é 15 kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-139-C', 'ENTRADA', 631892) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-139-C', 'ENTRADA', 729337) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-139-C', 'BALANCA', 227) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-139-C', 'BALANCA', 3338) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 1, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 4, 'GRAVE', 'Queimadura de Sol', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 5, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 6, 'GRAVE', 'Amarelado', 3, NULL, 'Perda da coloração original.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 7, 'GRAVE', 'Desidratado', 3, NULL, 'Sem suco, seco.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 8, 'GRAVE', 'Manchas graves', 3, NULL, 'Machas escuras') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 9, 'GRAVE', 'Passado', 3, NULL, 'Produto em estágio de maturação avançada.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 10, 'GRAVE', 'Pinta preta', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 11, 'LEVE', 'Sem Pedúnculo', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 12, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 13, 'LEVE', 'Manchas leves', 10, NULL, 'Manchas escuras') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-139-C', 14, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-123-C', 'GOIABA - VERMELHA / BRANCA / BRANCA', 'Frutas', 68, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso padrão da caixa das goiabas é 6 Kg;","Seguir a sazonalidade na negociação.","Produto passível de devolução com percentual de maturação acima de 20%."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-123-C', 'ENTRADA', 631825) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-123-C', 'ENTRADA', 631833) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-123-C', 'BALANCA', 224) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-123-C', 'BALANCA', 366) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 1, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 2, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 3, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 4, 'GRAVE', 'Amassado', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 5, 'GRAVE', 'Mancha grave', 3, NULL, 'Produto com partes escurecidas.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 6, 'GRAVE', 'Passado', 3, NULL, 'Passou o ponto de maturação.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 7, 'LEVE', 'Mancha leve', 3, NULL, 'Produto com partes escurecidas.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-123-C', 8, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-100-C', 'AMEIXAS - NACIONAL E IMPORTADA', 'Frutas', 124, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso da caixa da ameixa importada é 9 Kg;","O peso da caixa da ameixa nacional é 6 Kg;","Tanto a ameixa nacional quanto a importada deverá vir envolvida com papel para proteger da ação do frio;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-100-C', 'ENTRADA', 632147) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-100-C', 'ENTRADA', 880647) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-100-C', 'BALANCA', 364) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-100-C', 'BALANCA', 71) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo. (broca)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 1, 'GRAVE', 'Virose', 3, NULL, 'Escurecimento e deformação da superfície do fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 2, 'GRAVE', 'Dano Profundo', 3, NULL, 'Qualquer lesão que atinge a polpa.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 4, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 5, 'GRAVE', 'Mancha grave', 3, NULL, 'Que não está maduro.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 6, 'GRAVE', 'Congelamento', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 7, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à --%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-100-C', 8, 'LEVE', 'Tortuoso', 10, NULL, 'Frutos deformados (Fora das características originais)') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('FP-REC-10-C', 'BATATA DOCE: BRANCA E ROXA', 'Legumes', 224, '01', '21/07/2026', 'Fort Atacadista — apostila de fichas técnicas FLV', '["O peso da caixa da batata doce Branca é 20 Kg;","O peso da caixa da batata doce Roxa é 18 Kg;","Seguir a sazonalidade na negociação."]'::jsonb) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-10-C', 'ENTRADA', 631671) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-10-C', 'ENTRADA', 827460) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-10-C', 'BALANCA', 1338) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('FP-REC-10-C', 'BALANCA', 216) ON CONFLICT (tipo, codigo) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 0, 'PODRIDAO', 'Podridão', 1, NULL, 'Bolor e mofo.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 1, 'GRAVE', 'Ataque de pragas', 3, NULL, 'Dano causado por insetos ao fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 2, 'GRAVE', 'Brotamento', 3, NULL, 'Surgimento de um novo broto na superfície do produto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 3, 'GRAVE', 'Dano Mecânico', 3, NULL, NULL) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 4, 'GRAVE', 'Murchamento', 3, NULL, 'Perda de líquido.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 5, 'GRAVE', 'Cortada', 3, NULL, 'Talhado, quebrado.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 6, 'GRAVE', 'Esfolado', 3, NULL, 'Quando o produto está arranhado, escoriado, saindo a pele') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 7, 'LEVE', 'Dano Superficial', 10, NULL, 'Lesão superior à 10%') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;
INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('FP-REC-10-C', 8, 'LEVE', 'Sujidade', 10, NULL, 'Residual de sujeira encontrado no fruto.') ON CONFLICT (ficha_codigo, ordem) DO NOTHING;

