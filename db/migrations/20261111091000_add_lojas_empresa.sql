-- Completa o cadastro de lojas da empresa.
--
-- A migration multi-loja (20261111090000_add_loja.sql) criou as 5 lojas que
-- já usavam o sistema. A empresa tem 13 lojas: as 8 abaixo faltavam no
-- cadastro e passam a aparecer no seletor "Trocar loja" e no cadastro de
-- usuários. Nenhum dado operacional é migrado: cada loja nova começa vazia.
--
-- Idempotente: rodar de novo não altera as lojas já cadastradas (inclusive o
-- nome/ativo que o admin tenha ajustado).

INSERT INTO public.lojas (codigo, nome) VALUES
  (73, 'Loja 73'),
  (82, 'Loja 82'),
  (93, 'Loja 93'),
  (96, 'Loja 96'),
  (108, 'Loja 108'),
  (143, 'Loja 143'),
  (148, 'Loja 148'),
  (173, 'Loja 173')
ON CONFLICT (codigo) DO NOTHING;
