# Ficha técnica FLV — MVP (Fort Atacadista)

Fonte: `Ficha Tecnica FLV Fort Atacadista.pdf` (245 páginas, documento controlado
`FP-REC-<n>-C`, revisão `01`, data `21/07/2026`). A ficha passa a fazer parte do
padrão da empresa; o sistema guarda revisão/data/fonte e trata nova revisão como
nova versão (nunca sobrescreve histórico).

## Escopo do MVP

- **Top 30 fichas** por cobertura do catálogo (ranking em `scripts/gerar-fichas-flv.mjs`:
  quantos códigos da ficha já existem em `produto.codigo`/`produto.ean`).
- **Consulta**: botão "Ficha técnica FLV" abre `FichaFlvDialog` com grupo, códigos,
  pontos de atenção e tabela de defeitos/tolerâncias.
- **Recebimento FLV**: tela nova (menu do usuário, admin/encarregado) para bipar o
  código, informar a amostra, contar cada defeito e registrar a decisão
  (`aprovado`, `ressalva`, `rebaixa`, `rejeitado`) na loja do token.
- Fora do MVP por enquanto: sazonalidade por cor (grade colorida no PDF), fotos
  (1.251 imagens), vínculo automático com Rebaixa/Validade e IA para novas revisões.

## Mapeamento de códigos (convenção do catálogo)

| Código na ficha | Significado | Campo no catálogo | Tipo em `flv_ficha_codigo` |
| --- | --- | --- | --- |
| `E` | código de entrada | `produto.codigo` | `ENTRADA` |
| `B` | código de balança (PLU) | `produto.ean` | `BALANCA` |
| `EAN` | EAN da embalagem | `produto.ean` / `produto_eans` | `EAN` |

Auditoria real no catálogo: 164/170 códigos `E` já existem em `produto.codigo`;
142/170 códigos `B` já existem em `produto.ean`; 20/21 EANs de embalagem existem em
`produto.ean`; 112/115 fichas têm ao menos um código no catálogo. Conflitos no
próprio PDF (ex.: melão especial/mexerica compartilham E/B; milho/nabo repetem
`632023`/`1021905`) são acusados na geração e a ficha de maior rank vence — nunca
sobrescrever silenciosamente.

## Modelo de dados

Migration: `db/migrations/20261126090000_ficha_flv_mvp.sql` — aplicada no banco
configurado (`NEON_DATABASE_URL`) em 2026-11-26; verificação: 30 fichas,
194 códigos, 326 defeitos, 0 recebimentos, políticas RLS de `flv_recebimento`
criadas.

- Catálogo compartilhado (sem coluna de loja, sem RLS — mesmo padrão de `produto`):
  - `flv_ficha(codigo PK, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao jsonb, ativo, created_at)`
  - `flv_ficha_codigo(ficha_codigo, tipo, codigo, PK(tipo, codigo))`
  - `flv_ficha_defeito(id, ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe, UNIQUE(ficha_codigo, ordem))`
- Operacional por loja (RLS no padrão das demais): `flv_recebimento(id, loja, created_by, produto_codigo, produto_ean, descricao, ficha_codigo, amostra, decisao, defeitos jsonb, observacao, created_at)`.

Nome proposital: na ficha, `CATEGORIA` é a **classe** (Especial/Embalagem). Não
confundir com `categoria`/seção do catálogo.

## API

Não existe `api/manage-flv.ts`: o plano Hobby da Vercel limita o total de funções,
então as ações `flv_*` são roteadas por `api/manage-validade.ts` para
`api/_lib/flv-endpoint.ts`.

| Ação | Quem pode | Descrição |
| --- | --- | --- |
| `flv_ficha` | admin, encarregado | `codigo` (E/B/EAN) → `{ ficha, produto }` |
| `flv_listar_fichas` | admin, encarregado | índice das fichas ativas |
| `flv_registrar_recebimento` | admin, encarregado | grava `flv_recebimento` na loja do JWT |
| `flv_list_recebimentos` | admin, encarregado | últimos 100 da loja do JWT |

Cliente: `src/lib/flv.ts` (`buscarFicha`, `registrarRecebimento`,
`listarRecebimentos`, `calcularIndicadores`).

## Regra do checklist (CAT I por defeito)

Para cada defeito, `% = quantidade na amostra / amostra * 100` é comparado com o
`cat1` da ficha:

- `PODRIDAO` acima do CAT I → **rejeitado**
- qualquer `GRAVE` acima do CAT I → **rebaixa**
- qualquer `LEVE` acima do CAT I → **ressalva**
- nenhum acima → **aprovado**

A sugestão aparece na tela, mas a decisão final é sempre humana. **CAT II está
`-` na maioria das fichas** e precisa ser confirmado com a Qualidade antes de
virar regra automática.

## Telas

- `src/components/ConsultaView.tsx`: após consultar, chama `flv_ficha` e mostra o
  botão verde "Ficha técnica FLV"; o modal é `src/components/FichaFlvDialog.tsx`.
- `src/components/RecebimentoFlvView.tsx`: busca por código/EAN/PLU (com
  `BarcodeScanner`), mostra a ficha, monta o checklist com `%` por defeito,
  registra a decisão e lista os últimos recebimentos da loja.
- Navegação: view `recebimento` em `src/lib/permissoes.ts`, item "Recebimento FLV"
  no menu do usuário (`Header.tsx`) para admin/encarregado, renderizada em
  `src/pages/Index.tsx`.

## Geração do seed

```bash
python scripts/extrair-fichas-flv.py "C:\caminho\Ficha Tecnica FLV Fort Atacadista.pdf" scripts/fichas-flv-extraidas.json
node scripts/gerar-fichas-flv.mjs --top 30
# gera db/migrations/20261126090000_ficha_flv_mvp.sql
```

A extração reconstrói as linhas por coordenadas X/Y (as células vêm em spans
separados), extrai códigos/defeitos/pontos e gera a migration idempotente
(`ON CONFLICT DO NOTHING`).

## Riscos e cuidados

- Não aplicar a migration automaticamente em produção sem revisão: rode primeiro em
  ambiente de teste/Neon branch.
- Sazonalidade é grade colorida no PDF; o texto só traz `J F M ...`. Para o MVP ela
  fica de fora; quando entrar, precisa de leitura visual/curation ou parser de cor.
- Fotos são ativo de treinamento, mas têm direito autoral do Fort Atacadista — usar
  internamente e registrar a fonte.
- Produtos de balança (KG) continuam bloqueados na Validade/Arrastão e aceitos na
  Rebaixa; a ficha não muda essa regra.
- Testes: `src/test/flv.test.ts` cobre `calcularIndicadores` e a permissão da tela.
