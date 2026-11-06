- [x] Add free-text Tipo to product creation.
- [x] Add admin product search/edit for description, type, code and linked EANs with atomic saves.
- [x] Test validation, creation/edit form submissions and real Neon product reads (10 tests passed).
- [ ] Verify authenticated save/read-back through the live UI; blocked by unavailable custom admin session/test credentials.

## IA (plano completo em `docs/plano-ia.md`)
- [x] Fase 0: guardar o plano de IA no projeto (`docs/plano-ia.md`) e nas regras de arquitetura (`AGENTS.md`).
- [x] Fase 1.1: ler a etiqueta por foto na tela de Validade (`api/ai-assist.ts` ação `read_label`, `api/_lib/ai-label.ts`, `src/lib/ai-image.ts`).
- [x] Fase 1.2: importação assistida na Base de Dados (`api/ai-assist.ts` ação `import_review`, `src/lib/ai-import.ts`, prévia antes de gravar).
- [x] Fase 1.1 validada com etiqueta real (preço): leitura correta de EAN/código/descrição/tipo, sem confundir `Data:` com validade nem preço com quantidade; modelo NVIDIA Super-VL (15 s na etiqueta, 4 s na planilha), chave `NVIDIA_API_KEY` na Vercel, `reasoning_effort=low` e timeout de 55 s ajustados pelo teste.
- [ ] Fase 0 pendente: corrigir `manage-metas.save_realizado` (UPDATE sem upsert), verificar o UNIQUE de `shared_inventory.codigo`, alinhar o schema de `metas_mensais` e popular a aba Perdas a partir de `rebaixa_products`.
- [ ] Fase 0 pendente: criar `vendas_diarias` (SKU × dia × quantidade × valor) — é o que destrava a previsão de perda/curva ABC.
- [ ] Fase 1.3: normalização do catálogo em lote (descrição → tipo/categoria, com revisão antes de gravar).
- [ ] Fase 2: briefing do encarregado (prioridade por risco em R$), retrospectiva de perda e explicador de divergência de inventário.
- [ ] Fase 3: previsão de ruptura / NL→SQL (depende da Fase 0).