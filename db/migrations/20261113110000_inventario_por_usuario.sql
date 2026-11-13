-- 20261113110000_inventario_por_usuario.sql
--
-- O Inventário passa a ser **por login**: cada usuário tem o seu lote aberto e
-- só enxerga os lotes que criou (`inventory_lotes.created_by`). Antes o lote
-- era único por loja, então os itens contados por um login apareciam no
-- inventário de outro (o caso visto: o lote do "admin" com itens do Isaias
-- aparecendo para a Luana).
--
-- Esta migration:
--  1. divide os lotes misturados — cada coletor que não é o dono do lote
--     ganha um lote próprio, com os itens dele (nada se perde nem se mistura);
--  2. deixa no máximo **um lote aberto por (loja, usuário)** (os antigos
--     abertos viram 'suspenso', preservando o histórico);
--  3. cria o índice único parcial que garante a regra do lote aberto.
--
-- O runtime garante o mesmo schema em `api/manage-inventory.ts`; esta
-- migration é a fonte oficial.

-- ---------------------------------------------------------------------------
-- 1) Split: um lote por coletor
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  lote RECORD;
  coletor RECORD;
  novo_numero INTEGER;
  nome_novo TEXT;
BEGIN
  FOR lote IN
    SELECT l.loja, l.numero, l.nome, l.status, l.created_by AS dono,
           l.created_at, l.finalized_at
      FROM public.inventory_lotes l
     WHERE EXISTS (
             SELECT 1
               FROM public.shared_inventory s
              WHERE s.loja = l.loja
                AND s.lote_numero = l.numero
                AND s.created_by IS NOT NULL
                AND s.created_by IS DISTINCT FROM l.created_by)
  LOOP
    FOR coletor IN
      SELECT s.created_by AS nome, count(*)::int AS itens
        FROM public.shared_inventory s
       WHERE s.loja = lote.loja
         AND s.lote_numero = lote.numero
         AND s.created_by IS NOT NULL
         AND s.created_by IS DISTINCT FROM lote.dono
       GROUP BY s.created_by
       ORDER BY s.created_by
    LOOP
      SELECT COALESCE(MAX(numero), 0) + 1
        INTO novo_numero
        FROM public.inventory_lotes
       WHERE loja = lote.loja;

      nome_novo := COALESCE(lote.nome, 'Lote') || ' (' || coletor.nome || ')';

      INSERT INTO public.inventory_lotes
             (numero, status, created_by, created_at, finalized_at, nome, loja)
      VALUES (novo_numero, lote.status, coletor.nome, lote.created_at,
              lote.finalized_at, nome_novo, lote.loja);

      UPDATE public.shared_inventory
         SET lote_numero = novo_numero
       WHERE loja = lote.loja
         AND lote_numero = lote.numero
         AND created_by = coletor.nome;

      RAISE NOTICE 'Lote % (loja %) dividido: % item(ns) de % -> lote %',
        lote.numero, lote.loja, coletor.itens, coletor.nome, novo_numero;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Um lote aberto por (loja, usuário)
-- ---------------------------------------------------------------------------
-- Se sobrou mais de um lote aberto do mesmo dono, o mais antigo vira
-- 'suspenso' (continua no histórico e pode ser retomado pela tela).
UPDATE public.inventory_lotes l
   SET status = 'suspenso'
 WHERE l.status = 'aberto'
   AND EXISTS (
         SELECT 1
           FROM public.inventory_lotes o
          WHERE o.loja = l.loja
            AND o.created_by IS NOT DISTINCT FROM l.created_by
            AND o.status = 'aberto'
            AND o.numero > l.numero);

-- ---------------------------------------------------------------------------
-- 3) Índices
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_lotes_aberto_usuario
  ON public.inventory_lotes (loja, created_by)
  WHERE status = 'aberto' AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_lotes_loja_dono
  ON public.inventory_lotes (loja, created_by, status, numero DESC);

CREATE INDEX IF NOT EXISTS idx_shared_inventory_loja_lote_coletor
  ON public.shared_inventory (loja, lote_numero, created_by);
