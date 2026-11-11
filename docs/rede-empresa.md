# Usar o SGS-PRO em redes restritas (empresa)

Este documento explica por que o SGS-PRO pode "abrir mas travar na tela de
login" em uma rede corporativa e o que fazer para resolver.

## Por que às vezes o sistema "abria" e às vezes travava

São dois fatores somados — um do projeto e um da rede:

1. **Sessão salva (projeto).** O app guarda o token em `localStorage`. Sem
   "Lembrar-me", a sessão dura **6 h**; com "Lembrar-me", o servidor emite um
   token de **7 dias** e o app abre direto na tela principal por esse período,
   **sem pedir senha**. Passado esse prazo, o app volta a pedir o login — e é
   exatamente aí que a rede corporativa bloqueada trava. Por isso o sistema
   parecia funcionar "aleatoriamente": nos momentos em que a sessão ainda
   estava viva, ele abria; nos outros, ficava no login.
2. **Dois IPs para o mesmo domínio (rede).** `inventario-pro-one.vercel.app`
   resolve hoje para **64.29.17.130** e **216.198.79.130** (a Vercel usa
   anycast; não há registro IPv6 — `AAAA` — para esse alias). Se o firewall
   corporativo liberar um IP e bloquear o outro, a mesma URL ora responde ora
   fica pendurada — comportamento idêntico ao "às vezes funciona".

Para compensar o segundo fator, o login faz **uma nova tentativa automática**
quando a falha é de rede (o `invokeFunction` ganhou `retries`): a segunda
conexão cai em outro caminho e costuma passar. Erro do servidor (senha errada,
banco fora do ar) não é repetido.

### Como confirmar no computador da empresa

No **Prompt de comando** (PowerShell ou cmd), com o sistema aberto:

```bat
nslookup inventario-pro-one.vercel.app
curl -I --resolve inventario-pro-one.vercel.app:443:64.29.17.130 https://inventario-pro-one.vercel.app
curl -I --resolve inventario-pro-one.vercel.app:443:216.198.79.130 https://inventario-pro-one.vercel.app
```

- Se os dois `curl` responderem rápido: o bloqueio é em outro caminho (DNS,
  proxy, inspeção de TLS) — peça o allowlist do domínio.
- Se **um** deles ficar pendurado e o outro responder: é o caso do IP
  bloqueado — peça ao TI para liberar **os dois** IPs (ou o domínio, que
  normalmente já cobre os dois).
- Se os dois pendurarem: o domínio inteiro está bloqueado.

## Como o SGS-PRO se comunica

```
navegador  ──HTTPS──►  Vercel (inventario-pro-one.vercel.app)
                           │  (Serverless Functions: login, catálogo, validade…)
                           └──HTTPS──►  Neon (Postgres)
```

- O navegador **nunca** fala com o banco: quem consulta o Neon é a Function da
  Vercel. Se a tela de login trava, o bloqueio está no acesso do navegador ao
  domínio do sistema — **não** no banco.
- O app é um **PWA** (service worker): a tela (inclusive o login) é entregue do
  cache. Por isso "o sistema abre" mesmo sem internet e só trava na hora de
  falar com o servidor.

## Sintomas e causas

| Sintoma | Causa provável |
| --- | --- |
| Tela de login aparece e o botão fica em "Entrando..." para sempre | Firewall/proxy corporativo engole a requisição `POST /api/auth-login` |
| "Não foi possível conectar ao servidor do SGS-PRO" | DNS ou conexão bloqueados pelo proxy |
| "O servidor do SGS-PRO não respondeu a tempo" | A requisição sai, mas a resposta não volta (inspeção de TLS no proxy, por exemplo) |
| "Banco de dados indisponível no momento" | A Function chegou ao banco, mas o Neon não respondeu (problema do servidor, não da rede local) |

Desde a correção de timeout, **todas** essas situações terminam em até 25
segundos (15 s no login) com uma mensagem que diz exatamente o que aconteceu —
antes, a tela ficava em "carregando" indefinidamente.

## O que pedir ao TI

Liberar no proxy/firewall corporativo (HTTPS/TCP 443):

| Domínio | Motivo |
| --- | --- |
| `inventario-pro-one.vercel.app` | App **e** API (login, catálogo, validade, rebaixa) |
| `*.vercel.app` | Somente se forem usados deploys de homologação |

Observações para o TI:

- **Não** é preciso liberar acesso ao Neon (`*.neon.tech`) nas estações de
  trabalho: essa conexão sai da Vercel, não do computador do usuário.
- Se a rede faz **inspeção de TLS** (proxy que descriptografa HTTPS), o
  `POST` do login pode ser bloqueado ou demorar. Incluir
  `inventario-pro-one.vercel.app` na lista de bypass (sem inspeção) resolve.
- Se a máquina usa proxy configurado no navegador/antivírus, ele precisa
  permitir `inventario-pro-one.vercel.app`.

## Depois de um deploy: atualize o app

O SGS-PRO é um PWA: o service worker guarda o bundle em cache e o atualiza em
segundo plano. Na rede da empresa (lenta ou instável), o computador pode
continuar usando a **versão antiga** do app por um tempo — inclusive uma versão
sem as correções de timeout.

Para forçar a versão nova:

1. Feche o app (se estiver instalado, feche a janela) e abra de novo; ou
2. No navegador, faça uma recarga forçada: **Ctrl + Shift + R** (ou **Ctrl + F5**).

Para conferir a versão: no DevTools do navegador (F12) → aba **Application** →
**Service Workers** → botão **Unregister** e, em **Cache Storage**, apagar as
entradas; depois recarregue a página.

## Solução imediata (sem depender do TI)

Conectar pelo **4G/hotspot do celular** (desativando o Wi-Fi da rede da
empresa). O sistema funciona normalmente — a restrição é do caminho de rede, não
do aplicativo.

## Alternativa: domínio próprio

Redes corporativas costumam liberar com mais facilidade domínios da própria
empresa. O projeto não tem domínio customizado hoje (usa apenas
`inventario-pro-one.vercel.app`). Depois de adicionar um domínio (ex.:
`sgs-pro.comper.com.br`) no projeto da Vercel e apontar o DNS, o pedido ao TI
passa a ser por um domínio já conhecido da empresa.

## Detalhes técnicos

- Timeout do cliente: `src/lib/api.ts` (`invokeFunction`, padrão 25 s;
  login usa 15 s e **1 nova tentativa** em falha de rede). A corrida com
  `Promise.race` garante o fim da espera mesmo se o navegador não honre o
  `abort`.
- Falha rápida no servidor: `api/auth-login.ts` usa
  `withTimeout` (`api/_lib/timeout.ts`, padrão 10 s, ajustável por
  `DB_QUERY_TIMEOUT_MS`) e responde **503** com mensagem clara em vez de
  deixar a Function pendurada até o limite da Vercel.
- A tela de login (`src/pages/LoginPage.tsx`) diferencia falha de rede de
  credencial inválida e mostra a dica de Allowlist/hotspot.
