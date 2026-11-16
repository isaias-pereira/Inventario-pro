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
       ├─ "Está no ponto?"  → estágios (ainda não / pode guardar / no ponto / passou)
       ├─ "Dica Importante"
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
| `/g/creditos` | **público** | crédito das fotos (CC BY / CC BY-SA) |
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

## 4. Fotos dos produtos

O cliente vê **foto de verdade**, não desenho. A primeira versão usava imagens
geradas por IA e o resultado foi reprovado na revisão: o tomate da capa não
parecia tomate e alguns estados saíram errados (fruta verde no lugar de
madura). Desde então o guia usa **fotos reais, de produto inteiro**, com o
estado bem visível.

- As fotos ficam em `public/guias/<slug>-<n>.webp` (800×600, WebP ~40 kB) e
  são **versionadas no repositório**: nada é baixado de fora em produção, o
  app funciona offline e a etiqueta impressa é sempre a mesma.
- Uma foto por **estado visual**: `tomate-1` (verde), `tomate-2` (no ponto),
  `tomate-3` (passou). Produtos que não amadurecem na banca (cebola, cenoura,
  repolho) têm só dois estados: "pode guardar" e "passou".
- Os **desenhos SVG antigos** continuam no código (`IlustracaoProduto`) só
  como **reserva**: se a foto não carregar, a página mostra o desenho e nunca
  quebra (`src/components/guias/FotoProduto.tsx`).
- Para trocar uma foto pela foto real da banca, basta substituir o arquivo
  `.webp` de mesmo nome — ou pela foto tirada pelo celular do encarregado —
  **e subir `VERSAO_FOTOS`** em `src/lib/fotos.ts`.
- **Por que existe a versão:** quando a foto é substituída mantendo o nome, o
  navegador pode continuar mostrando a imagem antiga que já tem em cache (foi
  o que aconteceu na troca das fotos de IA pelas reais: a tela ainda mostrava
  o tomate gerado). `fotoVersionada()` soma `?v=` na URL, o que cria um
  endereço novo e obriga o navegador a baixar a foto nova.

### De onde vêm as fotos

Do **Wikimedia Commons**, com licença livre (CC0, domínio público, CC BY ou
CC BY-SA). As que exigem atribuição (CC BY / CC BY-SA) aparecem na página
pública `/g/creditos`, com autor, licença e link do arquivo original — o
crédito é gerado junto com o download.

O fluxo é:

1. `scripts/buscar-fotos-guias.mjs` procura candidatas no Commons por
   produto/estado e salva os metadados;
2. `scripts/conferir-candidatas.mjs <lista.json>` monta `dist/candidatas.html`
   com as candidatas já recortadas em 800×600, para escolher olhando;
3. `scripts/fotos-escolhidas.json` guarda o arquivo escolhido para cada
   estado (`tomate-1`, `tomate-2`, …);
4. `scripts/baixar-fotos-guias.mjs` baixa as escolhidas, recorta em 4:3
   (`sharp`, `npm i sharp --no-save`), grava os `.webp` e reescreve
   `src/data/fotos-creditos.ts`.

```bash
node scripts/baixar-fotos-guias.mjs            # todas as escolhidas
node scripts/baixar-fotos-guias.mjs tomate-2   # uma foto só
```

O Commons aplica limite de requisições (HTTP 429); os scripts esperam e
tentam de novo, então uma execução completa pode levar alguns minutos.

**Estados difíceis de fotografar**: "fruta/verdura passada" quase não existe em
banco de imagens livre. O que foi feito:

- **abacaxi**: nenhuma foto real de abacaxi escurecido/mole — o guia ficou com
  **2 estágios** (espere → no ponto) e o alerta de "passou" (cheiro fermentado,
  casca escura e mole) vive na dica importante;
- **alface passada** e **cenoura ressecada**: usam a **melhor foto real
  disponível** (alface com podridão da cabeça, cenouras de feira) e o texto
  explica o defeito. Nesses dois o ideal é substituir pela foto tirada na
  própria banca, com o mesmo nome de arquivo.

## 5. Página pública: feita para o celular

O cliente abre a página no celular, na banca, com uma mão só. Por isso:

- coluna estreita (`max-w-md`), **fundo branco** e tipografia de sistema
  (sem gradiente, sem "vidro", sem serifa/mono decorativo);
- **foto do produto** como imagem principal, logo abaixo do nome;
- "Como escolher" em linhas compactas (ícone + título + uma frase);
- "Está no ponto?" em **linhas com miniatura da foto** (não cartões grandes),
  com o selo do estado (âmbar / azul / verde / laranja);
- dica e "como guardar" em duas caixas curtas no fim.

No total, o conteúdo cabe em pouco mais de uma tela de celular — o cliente
lê sem rolar a página inteira.

## 6. Tela interna (Guias & QR)

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

## 7. Guia também na tela interna

Na **Consulta** (admin), quando o produto consultado tem guia, aparece o
botão **"Guia do cliente"**, que abre a mesma página pública em outra aba — a
equipe segue exatamente o mesmo critério que o cliente lê.

> A correspondência é por palavra-chave na descrição (`palavras` do guia), então
> é uma aproximação: "BANANA NANICA" cai no guia de banana prata.

## 8. Métricas

`trackEvent('guia_view', { slug })` e `trackEvent('guia_indice')` no Vercel
Analytics: dá para saber **qual guia é mais consultado** (e se algum QR não
está sendo usado). Nenhum dado pessoal do cliente é coletado.

## 9. Testes

`src/test/guias.test.tsx` (18 casos): integridade do conteúdo (13 produtos,
slugs únicos, coerência dos estágios, passos com ícone válido), busca de guia,
URL pública, ligação com a descrição do catálogo, desenho de todas as
ilustrações de reserva e a página pública renderizando **sem login**.

Dois casos travam as **regras de conteúdo** (ver seção 10):

- `tem os estágios coerentes com a regra de maturação` — produtos que não
  amadurecem na banca têm 2 estágios (`guardar` + `passou`); os demais têm 3
  (`espere`/`guardar` → `no-ponto` → `passou`);
- `nunca manda o cliente embora da loja` — nenhum veredito, descrição, passo,
  dica ou texto de armazenamento pode conter "não leve / não levar / não compre
  / avoid".

E dois travam as **fotos**:

- `todos os estágios têm foto e o arquivo existe no projeto` — cada estágio
  aponta para `/guias/<slug>-<n>.webp` e o arquivo precisa estar em
  `public/guias/` (senão a banca receberia uma página sem foto);
- `a foto de capa é a do estado "no ponto"`.

## 10. Regras de conteúdo (revisão do encarregado)

O guia é material do **cliente final**. As regras validadas na revisão:

1. **O guia nunca manda o cliente embora da loja.** Nenhum "não leve", "não
   compre", "evite". O veredito convida a **escolher outra peça da banca**
   (`Prefira outro` / `Prefira outra`, conforme o gênero) ou mostra que a peça
   **ainda é boa** (`Use logo`).
2. **Produtos que não amadurecem na banca** (laranja, batata, cebola, cenoura,
   repolho, alface) não têm estágio "espere": o 1º estágio é **`guardar`**,
   com selo azul "Pode guardar" — a fala é de **conservação**, não de
   maturação.
3. **Melancia** não amadurece fora do pé: a sola ainda clara vira `Prefira
   outra` (o 1º estágio), e o 3º também (`Muito amarela, mole ou rachada`).
4. **Alface fechada e firme é o melhor estado** (mais crocante): o 1º estágio
   é `Melhor para guardar`, não "use em 1 a 2 dias".
5. **Cebola, cenoura e repolho** têm 2 estágios — os dois primeiros eram
   quase idênticos e foram fundidos.
6. **Abacaxi** tem 2 estágios (`espere` → `no ponto`): não existe foto real de
   abacaxi "passado" em banco livre, então o alerta (cheiro fermentado, casca
   escura e mole) fica na dica importante.
6. **Prazos de maturação mantidos**: banana e mamão 3 a 5 dias, abacate 3 a 4
   dias, tomate 2 a 3 dias, abacaxi 2 a 4 dias, maçã 1 a 2 dias.
7. **Tom de voz em 2ª pessoa** ("leve", "espere", "escolha") e **concordância de
   gênero** no veredito: "outro tomate", "outra batata", "outra alface".
8. A quantidade de passos fica **como cada produto precisa** (3 ou 4).

### Vereditos em uso

| Veredito | Significado | Selo na tela |
|---|---|---|
| `Espere X dias` | ainda não está no ponto, ripa em casa | âmbar (Ainda não) |
| `Pode guardar` | não amadurece na banca — guarde para depois | azul (Pode guardar) |
| `Melhor para guardar` | estado ideal para conservar alguns dias | azul |
| `Lever hoje` / `Coma hoje` / `Cozinhe hoje` / `Esprema hoje` / `Use hoje` | está no ponto | verde (No ponto) |
| `Use logo` | passou do ponto, mas ainda rende (bolo, sopa, suco) | rust (Passou do ponto) |
| `Prefira outro` / `Prefira outra` | escolha outra peça da banca | rust (Passou do ponto) |
| `Corte e sirva` | corte ao meio para conferir (melancia) | verde |

O estágio `guardar` usa o campo `ilustracao` só para o **desenho de reserva**
(caso a foto não carregue): ele mostra o produto no estado bom, não no "cru".

## 11. Cuidados

- O conteúdo é **do setor**: revisar os textos com o encarregado antes de
  imprimir as etiquetas — o material vai para o cliente final.
- As fotos são **reais e de banco livre**, não são fotos da banca: servem para
  ensinar o critério, não para "mostrar o produto exato da banca". Para trocar
  por uma foto tirada na loja, basta substituir o arquivo de `public/guias/`
  mantendo o mesmo nome (e atualizar o crédito em `fotos-creditos.ts`).
- Para trocar o conteúdo de um produto, edite `src/data/guias.ts` e reimprima
  a etiqueta — o QR não muda (o slug é a chave).

## 12. Estado atual (ponto de parada)

**Branch:** `feature/guias-hortifrui` (worktree em
`C:\Users\isaia\AppData\Local\Temp\opencode\guias-hortifrui`, fora do OneDrive
para o build minificado funcionar).

**Já feito e validado:**

- 13 guias escritos (tomate, banana prata, mamão papaia, abacate, maçã,
  laranja, melancia, abacaxi, batata, cebola, cenoura, repolho, alface);
- **conteúdo revisado com o encarregado** (regras da seção 9): nenhum veredito
  manda o cliente embora da loja, estágio novo `guardar` (selo azul), melancia
  e alface com 1º estágio corrigido, cebola/cenoura/repolho/abacaxi com 2
  estágios, concordância de gênero e tom em 2ª pessoa;
- rotas públicas `/g/:slug`, `/g` e `/g/creditos` funcionando **sem login**
  (conferidas no navegador, sem erro de console);
- **35 fotos reais** (Wikimedia Commons, licenças livres) em `public/guias/`,
  no lugar das imagens geradas por IA — a capa de cada guia é a foto do estado
  "no ponto";
- página de créditos `/g/creditos` com autor, licença e link de cada foto;
- bustador de cache em `src/lib/fotos.ts` (`VERSAO_FOTOS`) para a foto nova
  aparecer na hora de substituir um arquivo pelo mesmo nome;
- tela interna "Guias & QR" (menu do usuário → admin e encarregado) com busca,
  QR gerado no navegador, copiar link e folha A4 (13 etiquetas conferidas no
  DOM: a folha está fora do container `no-print` e o `app-header` some no
  papel);
- botão "Guia do cliente" na Consulta interna;
- `sitemap.xml` com as 15 URLs públicas (base trocada para o domínio de
  produção);
- validações: `npm run typecheck` **sem erros**, `npx vitest run
  src/test/guias.test.tsx` **19 testes verdes**, `npx eslint` limpo nos
  arquivos do módulo e `vite build` **minificado OK** (rodado fora do
  OneDrive).

**Pendente (para quando voltarmos):**

1. **Aprovação final do texto pelo encarregado** — a tabela dos 13 guias foi
   apresentada; falta o "ok" para subir.
2. **Subir para produção**: merge da branch em `main` + deploy na Vercel.
   Depois disso as URLs ficam `https://inventario-pro-one.vercel.app/g/tomate`
   (o QR já é gerado com a origem atual, então basta gerar/imprimir as
   etiquetas **depois** do deploy).
3. **Impressão de prova**: gerar a folha, imprimir em A4 e testar a leitura do
   QR com o celular antes de colar nas bancas.
4. Opcional (fases futuras): trocar as fotos de banco pelas fotos da própria
   banca (tiradas pelo celular do encarregado), guia por bancada com vários
   produtos, edição do conteúdo pelo admin e contagem de acessos por guia no
   Analytics.

**Como retomar localmente:**

```bash
cd C:\Users\isaia\AppData\Local\Temp\opencode\guias-hortifrui
npm ci
npm run dev        # http://localhost:8080
# a página pública abre direto: http://localhost:8080/g/tomate
```

