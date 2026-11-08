# Plano de IA (SGS-PRO)

> Documento de referência para decisões futuras. **Atualizado:** 08/11/2026.
> Status do código: Fase 1 (itens 1 e 2) implementada + item 3 **parcial** (seção/categoria)
> — ver [§7](#7-status-atual).

Este documento responde: **onde uma API de IA traria valor real neste projeto**, o que
**não** vale a pena, o que falta nos dados e por onde começar. Ele foi escrito a partir
da leitura de todo o frontend (9 telas), das 11 Serverless Functions, das 16 migrations
e das libs de regras.

---

## 1. Resposta curta

A IA **cabe bem** neste projeto, mas **não onde se costuma pensar**. O maior ganho não é
"prever vendas" — hoje **não existe histórico de vendas por produto**, então qualquer
previsão seria ficção. O ganho real é:

> **transformar trabalho manual e texto livre em decisão validável** — leitura de etiqueta
> por foto, importação de planilha assistida, normalização do catálogo e um briefing que
> prioriza o que o encarregado deve fazer hoje.

| # | Onde | O que a IA faria | Ganho | Viabilidade hoje | Esforço |
|---|------|------------------|-------|------------------|---------|
| 1 | **Catálogo / Adicionar Produto** (foto da etiqueta) | Lê EAN, código, descrição e tipo (KG/UN) a partir da foto e preenche o cadastro | Alto | ✅ Total | 1–2 dias |
| 2 | **Base de Dados** (importação) | Mapeia colunas de planilha real, valida linhas, sugere correções antes de gravar | Alto | ✅ Total | 2–3 dias |
| 3 | **Catálogo** (normalização em lote) | Descrição → tipo KG/UN, categoria, limpeza de duplicatas | Médio | ✅ Total | 2–3 dias |
| 4 | **Rebaixa / Validade** (briefing) | Prioriza por risco (prazo × quantidade × valor), explica o porquê | Médio | ✅ Boa | 3–5 dias |
| 5 | **Inventário** (divergências) | Explica "contado 12 × sistema 40" cruzando vencimentos/arrastão | Médio | ⚠️ Precisa cruzar 3 fontes | 3–5 dias |
| 6 | **Metas** (narração/anomalia) | Texto do mês + alerta de anomalia no realizado diário | Baixo-Médio | ⚠️ Só `metas_mensais` (R$/dia) | 2 dias |
| 7 | **Previsão de perda / sugestão de compra** | Curva por SKU, giro, ponto de pedido | Muito alto (se houver) | ❌ Bloqueado — falta venda por produto | ~1 mês |

---

## 2. Panorama do sistema (base da análise)

**9 telas** (`src/pages/Index.tsx`): Consulta, Inventário, Metas, Validade, Rebaixa,
E-mail, Base de Dados, Usuários, Adicionar Produto.

**Backend**: 11 Functions em `api/` (Neon/Postgres serverless, JWT HS256, tudo POST +
`invokeFunction` do frontend). Roles: `admin`, `encarregado`, `enc_flv`, `promotor`,
`col_validade`, `user`.

**Dados que existem**:

| Tabela | Conteúdo | Observação |
|---|---|---|
| `public.produto` | catálogo mestre: `ean`, `codigo`, `descricao`, `tipo`, `"Custo"` | schema completo **não** versionado neste repo |
| `produto_codigos` / `produto_eans` / `produto_embalagens` | aliases e embalagens CX/FD/SC | `produto_embalagens` tem FK para `produto` |
| `consulta_products` | `codigo`, `descricao`, `estoque`, `preco` | **1 snapshot**: cada upload apaga o anterior |
| `validade_products` | validade, quantidade (int), status, motivo (Excesso/Qualidade), `created_by` | `status=false` = vencido/soft-delete |
| `arrastao_sessions` / `arrastao_items` | sessão por **corredor**, itens com validade e qtd | na finalização os itens vão para a validade **sem o corredor** |
| `rebaixa_products` | pmz, preco_sugerido, preco_final, tipo, validade, motivo, status, batch_id | **único dado de perda com valor** |
| `shared_inventory` + `inventory_lotes` + `inventory_lote_audit` | contagem por lote com auditoria | `shared_inventory.codigo` ainda é `UNIQUE` global (ver §5) |
| `metas_mensais` | dia, meta, **realizado em R$** | única série de vendas; agregada, sem SKU |
| `email_padrao` / `email_config` / `app_users` | destinatários, texto padrão, usuários | |

**Lacunas confirmadas**:

- ❌ **Nenhuma venda por produto/SKU** — só realizado agregado em R$ por dia.
- ❌ **Sem histórico de estoque** (`consulta_products` é substituído a cada upload).
- ❌ **Sem histórico de preço** (custo ou venda).
- ❌ **Abas Perdas e Sortimento mortas**: `setPerdaItems`/`setVendaSortimentoItems` nunca
  são chamados → sempre vazias; `SortimentoTab.tsx` tem 14 produtos hardcoded.
  **Mas:** o dado de perda com valor existe em `rebaixa_products` (`status='enviada'`) —
  falta apenas persistir/agregar.
- ❌ `tipo` do produto é texto livre (sem padronização).
- ❌ Sem compra, fornecedor, pedido, recebimento, lead time, estoque mínimo/máximo.

---

## 3. Onde a IA se encaixa (detalhamento)

### 3.1 Cadastro de produto — ler a etiqueta pela foto (P0) ✅ Implementado

O cadastro de produto (`Adicionar Produto`) exige: EAN → código interno → descrição →
tipo. Em piso de loja, com celular na mão, datilhar isso é o gargalo — e a etiqueta
da prateleira já tem tudo isso impresso.

A IA lê a **foto da etiqueta** (visão) e devolve `{ean, codigo, descricao, tipo}`; o
backend ainda cruza com o catálogo e a **pessoa confirma antes de salvar** → alucinação
é contida pelos olhos humanos.

- **Desenho**: `api/ai-assist.ts` (ação `read_label`) + `api/_lib/ai-label.ts`
  (parse/validação puros) + `src/lib/ai-image.ts` (compressão no cliente) +
  `src/lib/ai-label.ts` (`labelToProductFields`, puro).
- **Tela**: botão **"Scanear Etiqueta"** ao lado de **"Adicionar Produto"**
  (`src/components/AddProductView.tsx`); ele abre a câmera e preenche EAN, código,
  descrição e tipo. A leitura da etiqueta **não** fica na tela de Validade — lá ela
  nada tinha a ver (a validade do produto continua digitada).
- **Fallback**: sem `NVIDIA_API_KEY`, a função responde **503** e o cadastro manual
  continua.

### 3.2 Base de Dados — importação assistida (P0) ✅ Implementado

`BaseView` importa 3 formatos rígidos (Consulta: código/descrição/estoque/preço;
Meta: dia/meta; Realizado: dia/venda). Planilha real de loja quase nunca vem assim.

- **Desenho**: a IA **propõe o mapeamento de colunas** e aponta problemas; o código
  **aplica o mapeamento deterministicamente** e mostra uma **prévia com avisos** antes
  de gravar. A IA nunca reescreve linha por linha.
- **Fallback**: `guessMapping` (heurística por nome de cabeçalho, sem accents/caixa)
  funciona sem IA; a IA só refina o mapeamento e acrescenta avisos.

### 3.3 Catálogo — normalização em lote (P1) — 🟡 parcial: **seção (categoria) ✅ Implementado**

O catálogo passou a ter uma taxonomia de **19 seções de mercearia** (tabela `categoria`,
FK `produto.categoria_codigo`). A cobertura já é de 12.172/12.173 produtos — mas
**1.248 (~10%) estão em "Outros"**, a seção genérica: é aí que a IA entra.

- **Desenho**: a action `review_categorias` (`api/ai-assist.ts` + `api/_lib/ai-categoria.ts`)
  sorteia um lote de produtos em "Outros" (ou sem seção), manda o **nome + descrição** para
  o modelo e recebe propostas de seção. A resposta é **validada contra a taxonomia**
  (seção inexistente ou "Outros" é descartada) e a **pessoa confere antes de gravar**:
  a gravação usa a action `set_categoria` do `query-product`, que revalida o código.
- **Tela**: **Revisão de Seções** (`src/components/RevisaoSecoesView.tsx`), no menu do
  usuário (**admin only**). Cada proposta vem com checkbox, seletor de seção (a pessoa
  pode trocar a sugestão) e a confiança declarada pelo modelo.
- **Regra que não muda**: a IA **proíbe**, a pessoa **decide**. Nada é gravado no banco
  pela chamada de IA.
- **Fallback**: sem `NVIDIA_API_KEY` → 503 e a seção continua se ajustando manualmente
  no cadastro de produto (campo **Seção**).
- **Ainda falta** (o resto do item 3): normalização de **tipo KG/UN** e limpeza de
  **descrição** em lote.

### 3.4 Rebaixa + Validade: briefing do encarregado (P1) — não iniciado

Cruzar validade + quantidade + PMZ → lista ordenada por **risco de perda em R$**, com
motivo ("vence em 2 dias, 40 kg, corredor 4"). A IA prioriza, redige e explica; **não
inventa regra**. Não deve tocar no e-mail atual (que está estável).

### 3.5 Inventário: divergências (P1/P2) — não iniciado

Cruzar `shared_inventory` × `consulta_products.estoque` × `produto."Custo"` × vencimentos
do mesmo produto × arrastão do corredor → hipóteses priorizadas. **A IA nunca "corrige"
estoque sozinha: ela sugere, o humano decide.**

### 3.6 Arrastão (P2) — baixa prioridade

Sessão por corredor com itens e validade: o conteúdo é aritmético puro. **SQL resolve**;
IA aqui seria enfeite e custo sem ganho.

### 3.7 Metas (P2) — só depois de consertar o dado

Detectar anomalia no realizado diário e escrever a narrativa do mês. Para Perdas/
Sortimento, a IA é irrelevante enquanto a fonte não existir — isso é problema de dados.

---

## 4. Onde a IA **não** vale a pena

1. **Prever vendas / curva por produto agora** — não existe histórico de vendas por SKU.
2. **Trocar a regra de preço da Rebaixa por IA** — 50% do PMZ com piso de R$ 0,99 é regra
   de negócio, testada e auditável. IA explica e recomenda fora do fluxo, nunca decide.
3. **Chat genérico com os dados** — 9 telas heterogêneas, usuário de campo com pressa,
   custo por pergunta, risco de alucinação. Não substitui nenhum passo do fluxo atual.
4. **Embeddings / banco vetorial** — o problema é taxonomia fechada (KG/UN + categoria) em
   catálogo de dezenas de milhares de itens: LLM em lote + revisão resolve mais barato.
5. **Gerar arte/texto da oferta (ODS/PDF)** — o gerador é determinístico, tem 13 colunas,
   fórmulas vivas, cores e testes. IA só tiraria reprodutibilidade.
6. **IA offline no PWA** — latência de celular e **chave no cliente = vazamento**.
   Server-side, sempre.

---

## 5. Bugs/dívidas que a IA tropeçaria (Fase 0)

| # | Problema | Impacto |
|---|----------|---------|
| 1 | `shared_inventory.codigo` é `UNIQUE` global, mas o código chaveia por `(codigo, lote_numero)` → contar o mesmo código num 2º lote pode falhar com 23505 | quebra a análise de divergência de inventário |
| 2 | `manage-metas.save_realizado` faz `UPDATE` sem upsert → realizado é **descartado** se a meta do dia não existir | mata a série de metas antes de qualquer análise |
| 3 | `manage-inventory.add` e `manage-validade.add` **não são idempotentes** | ação com IA precisa de idempotência por hash |
| 4 | `metas_mensais` com schema divergente entre migration (`id uuid` + CHECKs) e `ensureSchema` (`id SERIAL`) | confunde quem mexer depois |
| 5 | Só `send-rebaixa-email` tem `maxDuration: 60`; as outras usam o default do plano (10 s Hobby / 15 s Pro) | **a function de IA precisa de `maxDuration` explícito** |
| 6 | `manage-consulta.replace` não limita o tamanho do array | risco de estourar 4,5 MB |
| 7 | Zero cache no backend (só cache no cliente) | função de IA precisa de cache próprio |

**Verificações a rodar no Neon** (leitura pura):

```sql
-- 1) colunas reais de public.produto (pode ter preço de venda, categoria, seção…)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='produto' ORDER BY ordinal_position;

-- 2) constraint de shared_inventory
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.shared_inventory'::regclass;

-- 3) tamanho do problema do save_realizado
SELECT count(*) FILTER (WHERE realizado IS NULL) AS sem_realizado,
       count(*) AS total FROM public.metas_mensais;
```

---

## 6. Arquitetura (server-side, conforme as regras do projeto)

```
Navegador ──invokeFunction('ai-assist', {action, ...})──▶ Vercel Function
                                                                │
                                              api/_lib/ai.ts ──▶ provedor de IA
                                              (timeout, retry, cache)
                                                                │
                                                       Neon (cache + auditoria)
```

- **Functions**: `api/ai-assist.ts` com ações `config`, `read_label`, `import_review` e
  `review_categorias` (admin only).
  Padrão de `send-rebaixa-email.ts`: `requirePost` → `authenticate` → `readJsonBody` →
  `sendJson`; permissões por `payload.role`.
- **Chave só no servidor**: `AI_API_KEY` (+ `AI_MODEL`) nas **env vars da Vercel**. O
  cliente nunca vê a chave; `src/lib/api.ts` já centraliza as chamadas.
- **Fallback sem IA (obrigatório)**: chave ausente ou provedor fora → **503** e a tela
  segue no fluxo atual. Nenhuma tela pode depender da IA para funcionar.
- **Cache**: por hash do payload (imagem/planilha) para não reprocessar o mesmo item.
- **Auditoria**: tabela `ai_sugestoes(id, acao, entrada_hash, entrada, saida, modelo,
  tokens, custo, criado_por, aceito_em, criado_at)` → mede taxa de aceite e custo.
- **LGPD**: dados são de produto/estoque. **Não enviar `created_by`/username ao modelo**;
  reter prompt/inputs por prazo definido (ex.: 90 dias) e limpar imagens após o uso.
- **Limites**: payload da Vercel = **4,5 MB** → a foto é comprimida no cliente antes do
  base64 (alvo < 3 MB, lado maior 1600 px, JPEG); `maxDuration: 60` na função de IA e
  timeout interno de **55 s**. O plano da Vercel é *hobby* (teto de 60 s por função) e
  a latência do provedor varia muito (4 s a 140 s conforme o modelo e a fila): em
  latência do provedor varia muito (4 s a 140 s conforme o modelo e a fila): em
  provider instável a função pode ser cortada pela Vercel com 504. Nesse caso a tela
  avisa e o fluxo manual continua — a IA nunca é obrigatória.
- **Custo**: modelo barato para classificar em lote, modelo maior só para o briefing.
  Registrar token/custo por chamada na tabela de auditoria (os valores por token mudam —
  confirmar a tabela vigente do provedor).
- **Idempotência**: toda ação de IA é idempotente por hash da entrada.

---

## 7. Status atual

| Fase | Item | Status |
|------|------|--------|
| 0 | Correções de dados (bugs §5) | ⏳ Pendente |
| 0 | `vendas_diarias` (SKU × dia × qtd × valor) | ⏳ Pendente — destrava previsão |
| 0 | Popular a aba Perdas a partir de `rebaixa_products` | ⏳ Pendente |
| 1 | **Leitura de etiqueta por foto (cadastro de produto)** | ✅ Implementado |
| 1 | **Importação assistida (Base de Dados)** | ✅ Implementado |
| 1 | **Seção (categoria) do catálogo revisada por IA** | ✅ Implementado — falta tipo KG/UN + descrição |
| 1 | Normalização do catálogo em lote (tipo/descrição) | ⏳ Pendente |
| 2 | Briefing do encarregado + retrospectiva de perda | ⏳ Pendente |
| 2 | Explicador de divergência de inventário | ⏳ Pendente |
| 3 | Previsão / NL→SQL (depende da Fase 0) | ⏳ Pendente |

### Configuração necessária

| Variável | Onde | Obrigatória |
|---|---|---|
| `NVIDIA_API_KEY` | Vercel (env) | para as funções de IA |
| `AI_MODEL` | Vercel (env) | opcional — padrão `nvidia/nemotron-3.5-super-vl-120b-a12b` |

Sem essas variáveis, `ai-assist` responde **503** e o app funciona normalmente sem IA.

**Provedor**: NVIDIA Integrate API (compatível com Chat Completions) —
`https://integrate.api.nvidia.com/v1/chat/completions`. A chave é lida em
`api/_lib/ai.ts` e enviada no header `Authorization: Bearer`. Trocar de provedor ou
modelo é mexer só nesse arquivo (ou na env `AI_MODEL`).

### Validação com etiqueta real (NVIDIA Integrate API)

Teste da ação `read_label` com uma etiqueta de preço de supermercado recriada
(fundo amarelo, EAN `7509546707761`, código interno `3265420`, preço 8,99,
"PREÇO POR KG", `Data: 20/11/2026`, loja 160, código 2D), em duas versões:

| Cenário | Tempo | Tokens (entrada/saída) | Leitura |
|---|---|---|---|
| Etiqueta limpa (PNG 1024 px) | — | 856 / 534 | ✅ ean, código, descrição, tipo UN, validade `null` |
| "Foto de celular" (JPEG 1024 px, ruído + perspectiva + sombra) | 37,6 s | 1443 / 1182 | ✅ idêntico |
| "Foto de celular" (JPEG 1600 px — o que o app envia) | 24,5 s | 2621 / 304 | ✅ idêntico |

### Escolha do modelo (benchmark com a etiqueta real)

| Modelo | Leitura da etiqueta | Revisão de planilha | Qualidade |
|---|---|---|---|
| `nvidia/nemotron-3.5-super-vl-120b-a12b` | **15 s** | **4 s** | ✅ ean, código, descrição, tipo UN |
| `mistralai/mistral-large-4-1t-a52b` | 35–43 s | **140 s** | ✅ igual |
| `meta/llama-3.2-90b-vision-instruct` | 66 s | 60 s | ❌ não leu EAN nem código |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | — | 23 s | ✅ (não testado na visão) |

**Decisão**: padrão `nvidia/nemotron-3.5-super-vl-120b-a12b` (2–9× mais rápido,
mesma leitura). O modelo antigo continua disponível pela env `AI_MODEL`.

Conclusões que viraram regra no código:

- `reasoning_effort: 'low'` (o provedor recusa `minimal` com HTTP 400) — no
  modelo antigo economiza ~55% dos tokens; no novo é neutro (aceito, sem efeito).
- `temperature: 0.1` e `max_tokens: 4096` na leitura; `2048` na revisão de importação.
  **O teto precisa sobrar para a resposta**: com 1024–1200 tokens os modelos
  raciocinadores gastam tudo pensando e devolvem `content: null` (a API responde
  200 com resposta vazia → o `ai-assist` responde 502).
- Timeout do cliente de **55 s** (antes 25 s → 504 em produção; leitura real em
  produção: 43,3 s com o modelo antigo).
- O prompt passou a descartar as armadilhas de etiqueta de preço: data de emissão
  não é validade, preço/peso não são quantidade, "PREÇO POR KG" não é venda a peso.
- Log por chamada: `[ai] <ação> model=… in=… out=… tokens em …ms`.

**Validação em produção** (app publicado, chave na Vercel):

| Chamada | Resultado |
|---|---|
| `config` | `{ enabled: true, model: "nvidia/nemotron-3.5-super-vl-120b-a12b" }` |
| `read_label` (etiqueta real, 1600 px) | HTTP 200 em **28,5 s** — EAN, código, descrição e tipo corretos |
| `import_review` (6 colunas, 2 linhas) | HTTP 200 em **8,8 s** — mapeamento correto (`codigo`, `descricao`, `estoque`, `preco`) |
| Fluxo pela tela (botão da câmera → arquivo → formulário) | ✅ formulário preenchido; produto **não** cadastrado no catálogo → a tela deixa o código lido na busca em vez de apresentar "Produto Encontrado" |

### Validação da revisão de seções (catálogo)

Ação `review_categorias` medida contra o banco real (produtos de "Outros", taxonomia
completa de 19 seções), modelo padrão `nvidia/nemotron-3.5-super-vl-120b-a12b`,
`reasoning_effort: 'low'`, `temperature: 0.1`:

| Lote | `max_tokens` | Tempo | Resultado |
|---|---|---|---|
| 12 | 4096 | 28,5 s | ✅ 12/12 propostas válidas |
| 20 | 4096 | — | ❌ `finish_reason: length` — o modelo gasta tudo no raciocínio e devolve vazio |
| 20 | **8192** | **22,5 s** | ✅ 20/20 propostas válidas |
| 30 | 8192 | 44,7 s | ✅ (no limite do timeout) |
| 50 | 8192 | — | ❌ não cabe no teto de tokens |

Regras que viraram código (`api/_lib/ai-categoria.ts`):

- Lote padrão **20** produtos (`CANDIDATOS_PADRAO`), máximo **30** (`MAX_CANDIDATOS`).
- `max_tokens: 8192` (`CATEGORIA_MAX_TOKENS`) — o teto precisa sobrar para a resposta.
- A proposta é validada contra a taxonomia: seção que não existe é descartada e
  **"Outros" nunca é aceito** (é justamente o que a revisão quer corrigir).
- A gravação é sempre pela action `set_categoria` (admin only), que revalida o código
  da seção no banco — **a IA nunca escreve**.

### Métricas de acompanhamento

1. **Taxa de aceite das sugestões** por ação (KPI mais importante)
2. Tempo médio de cadastro de produto (antes × depois) e % de cadastros via foto
3. % de linhas de importação aceitas sem correção manual
4. % do catálogo com `tipo` preenchido e padronizado
5. **R$ de perda evitada** (precisa de baseline antes da Fase 1)
6. Custo por operação e custo total mensal (da tabela de auditoria)
7. Latência p95 da função de IA
