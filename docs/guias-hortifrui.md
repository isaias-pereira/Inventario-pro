# Guia de Hortifrui — QR code das bancas

Módulo que transforma a **bancada de hortifrui** em um canal de atendimento: o
cliente aponta a câmera do celular para um QR code colado na banca e abre uma
página curta que ensina **como escolher o produto no ponto certo**.

---

## 1. Como funciona

```
Encarregado (app interno, logado)
  └─ Menu do usuário → "Guias & QR"
       ├─ escolhe os produtos (checkbox)
       ├─ imprime a folha de etiquetas (A4, 2 colunas)
       └─ cola o QR na banca

Cliente (celular, SEM login)
  └─ escaneia o QR → abre  https://inventario-pro-one.vercel.app/g/tomate
       ├─ "Como escolher"  → 3 a 4 passos ilustrados
       ├─ "Está no ponto?"  → 3 estágios (espere / no ponto / passou)
       ├─ "Dica do encarregado"
       └─ "Como guardar em casa"
```

O QR aponta para **`/g/<slug>`** — URL curta, fácil de gerar e de ler.
A rota `/g` (índice com todos os produtos) existe como destino alternativo
(etiqueta de bancada com vários produtos) e como busca de etiqueta antiga.

## 2. Rotas

| Rota | Acesso | Quem usa |
|---|---|---|
| `/g/:slug` | **público** (sem login) | cliente que escaneou o QR |
| `/g` | **público** | índice de todos os guias |
| `/` → menu "Guias & QR" | admin e encarregado | impressão das etiquetas |

As rotas públicas ficam **fora** do `Index` (em `src/App.tsx`), que é a parte
autenticada do sistema — por isso o `if (!user) return <LoginPage />` do
`Index` não bloqueia o cliente. A página usa **só conteúdo estático do front**:
nenhum preço, estoque, validade ou dado de usuário é exposto.

## 3. Onde fica o conteúdo

**Versionado no código** (decisão do responsável): `src/data/guias.ts`.

- `GUIAS`: a lista de produtos, cada um com `passos`, `estagios`, `dica` e
  `armazenamento`.
- `buscarGuia(slug)`: usado pela rota pública.
- `guiaParaDescricao(descricao)`: liga a descrição do catálogo a um guia
  (usado pela tela interna de Consulta).
- `urlGuia(slug)`: monta a URL pública.

Não há migration nem endpoint: o que está no arquivo é o que vai para produção
no deploy. Para **ajustar um texto** ou **adicionar um produto**, edite o
arquivo, rode `npm test` e faça o deploy.

## 4. Ilustrações

As ilustrações são **SVG gerados em código** (`src/components/guias/IlustracaoProduto.tsx`):
cada produto tem uma silhueta e **3 paletas**, uma por estágio (espere / no
ponto / passou), mais as manchas do estágio "passou".

- Vantagens: zero arquivo de imagem, ~2 kB por ilustração, escala sem perder
  nitidez, estilo uniforme e cor controlável por estágio.
- Para trocar por **foto real** (fase futura): o campo `tipo` do guia aponta
  para o desenho; basta criar um componente que devolva `<img>` no lugar do SVG.

Os ícones dos passos (olhar, tocar, cheirar, pesar, som, casca, folha, talo)
estão em `src/components/guias/IlustracaoPasso.tsx`.

## 5. Tela interna (Guias & QR)

`src/components/GuiasAdminView.tsx` — admin e encarregado:

- busca por produto;
- QR gerado no navegador (`src/lib/qr.ts`, lib `qrcode` carregada por
  `import()` dinâmico → **não entra no bundle inicial**, o cliente do QR não
  paga esse download);
- "Copiar link" e "Imprimir etiqueta";
- folha de impressão em A4 com 2 colunas (`@page { size: A4 }`), escondida na
  tela (`hidden print:block`) e liberada no papel.

Na impressão, o cabeçalho do sistema sai fora: o `Header` ganhou a classe
`app-header` e o `index.css` esconde `.app-header` e `.no-print` em
`@media print`.

## 6. Guia também na tela interna

Na **Consulta** (admin), quando o produto consultado tem guia, aparece o
botão **"Guia do cliente"**, que abre a mesma página pública em outra aba — a
equipe segue exatamente o mesmo critério que o cliente lê.

> A correspondência é por palavra-chave na descrição (`palavras` do guia), então
> é uma aproximação: "BANANA NANICA" cai no guia de banana prata.

## 7. Métricas

`trackEvent('guia_view', { slug })` e `trackEvent('guia_indice')` no Vercel
Analytics: dá para saber **qual guia é mais consultado** (e se algum QR não
está sendo usado). Nenhum dado pessoal do cliente é coletado.

## 8. Testes

`src/test/guias.test.tsx` (14 casos): integridade do conteúdo (13 produtos,
slugs únicos, 3 estágios, passos com ícone válido), busca de guia, URL pública,
ligação com a descrição do catálogo, desenho de todas as ilustrações e a
página pública renderizando **sem login**.

## 9. Cuidados

- O conteúdo é **do setor**: revisar os textos com o encarregado antes de
  imprimir as etiquetas — o material vai para o cliente final.
- As ilustrações são **estilizadas**, não são fotos: servem para ensinar o
  critério, não para "mostrar o produto exato da banca".
- Para trocar o conteúdo de um produto, edite `src/data/guias.ts` e reimprima
  a etiqueta — o QR não muda (o slug é a chave).

## 10. Estado atual (ponto de parada)

**Branch:** `feature/guias-hortifrui` (worktree em
`C:\Users\isaia\AppData\Local\Temp\opencode\guias-hortifrui`, fora do OneDrive
para o build minificado funcionar).

**Já feito e validado:**

- 13 guias escritos (tomate, banana prata, mamão papaia, abacate, maçã,
  laranja, melancia, abacaxi, batata, cebola, cenoura, repolho, alface);
- rotas públicas `/g/:slug` e `/g` funcionando **sem login** ( conferidas no
  navegador, sem erro de console);
- ilustrações SVG dos 13 produtos × 3 estágios + 8 ícones de passo;
- tela interna "Guias & QR" (menu do usuário → admin e encarregado) com busca,
  QR gerado no navegador, copiar link e folha A4 (13 etiquetas conferidas no
  DOM: a folha está fora do container `no-print` e o `app-header` some no
  papel);
- botão "Guia do cliente" na Consulta interna;
- `sitemap.xml` com as 15 URLs públicas (base trocada para o domínio de
  produção);
- validações: `npm run typecheck` **sem erros**, `npm test` **542 testes
  verdes** (53 arquivos, 14 novos em `src/test/guias.test.tsx`),
  `npx eslint` limpo nos arquivos novos, `npm run build` **minificado OK**
  (rodado fora do OneDrive).

**Pendente (para quando voltarmos):**

1. **Revisão do conteúdo com o encarregado** — os textos e as dicas são a
   parte que só o setor valida antes de ir para o cliente final.
2. **Subir para produção**: merge da branch em `main` + deploy na Vercel.
   Depois disso as URLs ficam `https://inventario-pro-one.vercel.app/g/tomate`
   (o QR já é gerado com a origem atual, então basta gerar/imprimir as
   etiquetas **depois** do deploy).
3. **Impressão de prova**: gerar a folha, imprimir em A4 e testar a leitura do
   QR com o celular antes de colar nas bancas.
4. Opcional (fases futuras): fotos reais no lugar das ilustrações, guia por
   bancada com vários produtos, edição do conteúdo pelo admin, contagem de
   acessos por guia no Analytics.

**Como retomar localmente:**

```bash
cd C:\Users\isaia\AppData\Local\Temp\opencode\guias-hortifrui
npm ci
npm run dev        # http://localhost:8080
# a página pública abre direto: http://localhost:8080/g/tomate
```

