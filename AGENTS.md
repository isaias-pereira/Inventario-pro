# Architecture rules
- Backend são Serverless Functions da Vercel (pasta `api/`, Node) que falam com o Postgres do Neon; o Supabase não faz mais parte do projeto.
- Credenciais de banco (`NEON_DATABASE_URL` ou `LOVABLE_API_KEY` + `NEON_API_KEY`) e `JWT_SECRET` vivem só nas variáveis de ambiente da Vercel — nunca no cliente.
- Product catalog requests go through `api/query-product.ts` (connector gateway, com fallback ao driver Neon); the frontend calls it via `invokeFunction` from `src/lib/api.ts`.
- Product edits are admin-only, validate identifiers and catalog column lengths, and save the master record and aliases in one locked transaction to avoid partial changes.
- Product edit validation lives in `api/_lib/product-validation.ts` and is covered by Vitest tests without importing the function entrypoint.
- A tabela `validade_products` tem coluna `motivo` (Excesso/Qualidade) usada nos produtos de balança (KG); itens com motivo não geram alerta de vencimento.
- Na planilha de rebaixa (`src/lib/validade-spreadsheet.ts`): PMZ recebe o custo do catálogo (`produto.Custo`, action `costs` do `query-product`), PREÇO SUGERIDO é sempre 50% do custo (piso de R$ 0,99) e MARGEM % é a fórmula viva `of:=IF([.E4]=0;"";(([.E4]-[.F4])/[.E4])*100)`.
- A planilha de rebaixa é exportada em **ODF (.ods)**, não em XLSX: o usuário usa LibreOffice Calc. O arquivo é montado à mão (XML ODF + ZIP "store" em `createValidadeOds`), com estilos automáticos, merges, moeda `R$ #.##0,00` e margem `0"%"` em vermelho. Testes leem o `.ods` de volta e o LibreOffice é usado para validar o arquivo real.