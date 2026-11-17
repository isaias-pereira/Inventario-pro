-- Migration: Habilita Row Level Security (RLS) nas tabelas operacionais
-- Data: 2026-11-16
-- Objetivo: Garantir isolamento de dados por loja no nível do banco de dados
-- Como funciona: a aplicação define `SET LOCAL app.current_loja = <loja>` no início da transação

-- 1. Função auxiliar para obter a loja atual da sessão
CREATE OR REPLACE FUNCTION public.current_loja() RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_loja', true), '')::int;
$$;

-- 2. Habilita RLS nas tabelas operacionais
-- Catálogo (compartilhado entre lojas) NÃO recebe RLS:
-- produto, produto_codigos, produto_eans, categoria, produto_embalagens

-- Tabelas operacionais (uma por loja):
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validade_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lote_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulta_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_mensais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebaixa_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrastao_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrastao_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_padrao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_encarregados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_envio ENABLE ROW LEVEL SECURITY;

-- 3. Políticas para app_users (usuários veem apenas os da sua loja)
CREATE POLICY app_users_select_loja ON public.app_users
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY app_users_insert_loja ON public.app_users
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY app_users_update_loja ON public.app_users
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY app_users_delete_loja ON public.app_users
  FOR DELETE USING (loja = public.current_loja());

-- 4. Políticas para validade_products
CREATE POLICY validade_products_select_loja ON public.validade_products
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY validade_products_insert_loja ON public.validade_products
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY validade_products_update_loja ON public.validade_products
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY validade_products_delete_loja ON public.validade_products
  FOR DELETE USING (loja = public.current_loja());

-- 5. Políticas para shared_inventory
CREATE POLICY shared_inventory_select_loja ON public.shared_inventory
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY shared_inventory_insert_loja ON public.shared_inventory
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY shared_inventory_update_loja ON public.shared_inventory
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY shared_inventory_delete_loja ON public.shared_inventory
  FOR DELETE USING (loja = public.current_loja());

-- 6. Políticas para inventory_lotes (único por usuário+loja)
CREATE POLICY inventory_lotes_select_loja ON public.inventory_lotes
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY inventory_lotes_insert_loja ON public.inventory_lotes
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY inventory_lotes_update_loja ON public.inventory_lotes
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY inventory_lotes_delete_loja ON public.inventory_lotes
  FOR DELETE USING (loja = public.current_loja());

-- 7. Políticas para inventory_lote_audit
CREATE POLICY inventory_lote_audit_select_loja ON public.inventory_lote_audit
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY inventory_lote_audit_insert_loja ON public.inventory_lote_audit
  FOR INSERT WITH CHECK (loja = public.current_loja());

-- 8. Políticas para consulta_products
CREATE POLICY consulta_products_select_loja ON public.consulta_products
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY consulta_products_insert_loja ON public.consulta_products
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY consulta_products_update_loja ON public.consulta_products
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY consulta_products_delete_loja ON public.consulta_products
  FOR DELETE USING (loja = public.current_loja());

-- 9. Políticas para metas_mensais
CREATE POLICY metas_mensais_select_loja ON public.metas_mensais
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY metas_mensais_insert_loja ON public.metas_mensais
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY metas_mensais_update_loja ON public.metas_mensais
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY metas_mensais_delete_loja ON public.metas_mensais
  FOR DELETE USING (loja = public.current_loja());

-- 10. Políticas para rebaixa_products
CREATE POLICY rebaixa_products_select_loja ON public.rebaixa_products
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY rebaixa_products_insert_loja ON public.rebaixa_products
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY rebaixa_products_update_loja ON public.rebaixa_products
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY rebaixa_products_delete_loja ON public.rebaixa_products
  FOR DELETE USING (loja = public.current_loja());

-- 11. Políticas para arrastao_sessions
CREATE POLICY arrastao_sessions_select_loja ON public.arrastao_sessions
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY arrastao_sessions_insert_loja ON public.arrastao_sessions
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY arrastao_sessions_update_loja ON public.arrastao_sessions
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY arrastao_sessions_delete_loja ON public.arrastao_sessions
  FOR DELETE USING (loja = public.current_loja());

-- 12. Políticas para arrastao_items
CREATE POLICY arrastao_items_select_loja ON public.arrastao_items
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY arrastao_items_insert_loja ON public.arrastao_items
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY arrastao_items_update_loja ON public.arrastao_items
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY arrastao_items_delete_loja ON public.arrastao_items
  FOR DELETE USING (loja = public.current_loja());

-- 13. Políticas para email_padrao
CREATE POLICY email_padrao_select_loja ON public.email_padrao
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY email_padrao_insert_loja ON public.email_padrao
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY email_padrao_update_loja ON public.email_padrao
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY email_padrao_delete_loja ON public.email_padrao
  FOR DELETE USING (loja = public.current_loja());

-- 14. Políticas para email_config (PK é loja)
CREATE POLICY email_config_select_loja ON public.email_config
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY email_config_insert_loja ON public.email_config
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY email_config_update_loja ON public.email_config
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY email_config_delete_loja ON public.email_config
  FOR DELETE USING (loja = public.current_loja());

-- 15. Políticas para whatsapp_envios
CREATE POLICY whatsapp_envios_select_loja ON public.whatsapp_envios
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY whatsapp_envios_insert_loja ON public.whatsapp_envios
  FOR INSERT WITH CHECK (loja = public.current_loja());

-- 16. Políticas para whatsapp_destinatarios
CREATE POLICY whatsapp_destinatarios_select_loja ON public.whatsapp_destinatarios
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY whatsapp_destinatarios_insert_loja ON public.whatsapp_destinatarios
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY whatsapp_destinatarios_update_loja ON public.whatsapp_destinatarios
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY whatsapp_destinatarios_delete_loja ON public.whatsapp_destinatarios
  FOR DELETE USING (loja = public.current_loja());

-- 17. Políticas para usuario_encarregados
CREATE POLICY usuario_encarregados_select_loja ON public.usuario_encarregados
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY usuario_encarregados_insert_loja ON public.usuario_encarregados
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY usuario_encarregados_update_loja ON public.usuario_encarregados
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY usuario_encarregados_delete_loja ON public.usuario_encarregados
  FOR DELETE USING (loja = public.current_loja());

-- 18. Políticas para email_envio
CREATE POLICY email_envio_select_loja ON public.email_envio
  FOR SELECT USING (loja = public.current_loja());

CREATE POLICY email_envio_insert_loja ON public.email_envio
  FOR INSERT WITH CHECK (loja = public.current_loja());

CREATE POLICY email_envio_update_loja ON public.email_envio
  FOR UPDATE USING (loja = public.current_loja()) WITH CHECK (loja = public.current_loja());

CREATE POLICY email_envio_delete_loja ON public.email_envio
  FOR DELETE USING (loja = public.current_loja());

-- 19. Grant de uso da função para roles da aplicação
GRANT EXECUTE ON FUNCTION public.current_loja() TO PUBLIC;