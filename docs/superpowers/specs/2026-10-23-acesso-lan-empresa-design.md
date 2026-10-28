# Acesso via LAN da empresa — Design em andamento

**Data:** 2026-10-23
**Status:** ⏸️ AGUARDANDO TESTE na empresa (resultado amanhã, 2026-10-24)

---

## 1. Problema

O usuário acessa o Iventrio-Pro na empresa via rede LAN com **internet restrita por whitelist de domínios**. O frontend carrega (`*.lovable.app` é acessível), mas o login falha porque `*.supabase.co` (edge functions) e o Neon (banco) **não são acessíveis**.

> Obs.: o acesso completo funcionou uma vez — provavelmente porque o JWT (exp 6h) ainda estava válido no localStorage; quando expirou, o re-login precisou da nuvem e foi bloqueado.

## 2. Restrições levantadas

| Restrição | Valor |
|---|---|
| Instalar programas em máquinas da empresa | ❌ Não permitido (nenhuma máquina) |
| Pedir liberação de domínios ao TI | ❌ Sem chance (opção "b") |
| Domínios acessíveis na LAN | ✅ Google, WhatsApp Web, `*.lovable.app` |
| Bloqueados | ❌ `*.supabase.co`, Neon |
| Frontend hospedado em | `*.lovable.app` (Lovable — só frontend estático, sem backend custom) |
| Usuários simultâneos na empresa | ❓ A definir |

## 3. Arquitetura atual (descoberta da revisão)

**Todos os dados já estão no Neon.** O Supabase é apenas camada de execução:

- Usuários/senhas: **Neon** — tabela `app_users` (bcrypt)
- Catálogo: **Neon** — `produto`, `produto_codigos`, `produto_eans`
- Inventário/validade/metas: **Neon** — criados pelas functions `manage-*`
- Execução: **Supabase** — 8 edge functions (`auth-login`, `query-product`, `manage-inventory`, `manage-arrastao`, `manage-consulta`, `manage-metas`, `manage-users`, `manage-validade`) que só fazem proxy para o Neon

Fluxo do login: frontend → `auth-login` (Supabase) → consulta `app_users` no Neon → bcrypt → JWT custom (HS256, assinado com `SUPABASE_SERVICE_ROLE_KEY`, exp 6h) → localStorage. Demais functions verificam o mesmo JWT.

Frontend chama as functions via `supabase.functions.invoke()` (ver `src/contexts/DataContext.tsx:93` e `AuthContext.tsx`).

**Conclusão:** o Supabase é eliminável — basta um backend único que fale com o banco. Dados + auth podem viver num único lugar.

## 4. Abordagens

### ⭐ Abordagem 1 — Google Apps Script como gateway para o Neon (recomendada)

Um único Web App no Google Apps Script (`script.google.com`) substitui as 8 edge functions. Quem executa são os servidores do Google, então o acesso ao Neon funciona independentemente da LAN. A empresa só precisa alcançar `script.google.com` (Google — já liberado).

- Frontend: continua no Lovable
- Auth + dados: 1 script → banco único (Neon) — resolve o "um único lugar"
- Mesmo JWT, mesmas tabelas; frontend muda só a URL das chamadas (`fetch` direto em vez de `supabase.functions.invoke`)
- Zero instalação, zero pedido ao TI

**Trade-offs:** cold start ~1–2s; quotas do Google (URL Fetch 20k/dia, ok para equipe pequena); padrão alternativo, não convencional. HMAC-SHA256 disponível via `Utilities.computeHmacSignature`; bcrypt via port JS (bcryptjs) no runtime V8.

**Pré-requisito:** `https://script.google.com` deve estar acessível na LAN. ⏳ TESTE PENDENTE.

### Abordagem 2 — Migrar tudo para uma plataforma (Vercel/Cloudflare) + liberar 1 domínio

Frontend + API + banco na mesma plataforma (ex.: Cloudflare Pages + Workers + D1, ou Vercel + Neon). Solução convencional e limpa, mas depende do TI liberar um único domínio. **Plano B** se o Apps Script for bloqueado ou se o TI relents.

### Abordagem 3 — PWA 100% offline (sem servidor)

Service worker + IndexedDB. Cada máquina fica com cópia isolada (sem consolidação multiusuário), login local frágil. Descartada a menos que 1 e 2 falhem.

## 5. Teste pendente (amanhã, na empresa)

1. ⏳ **Abrir `https://script.google.com/home`** — se carregar, a Abordagem 1 é viável.
2. ❓ Confirmar **quantos colegas** usarão o sistema simultaneamente (impacta quotas do Apps Script).

## 6. Próximos passos (após o teste)

- Se `script.google.com` abrir → desenhar o design detalhado da Abordagem 1 (mapeamento endpoint-por-endpoint das 8 functions, estratégia de segredos no Apps Script, mudanças no frontend para trocar `functions.invoke` por `fetch`), aprovar, escrever spec final e plano de implementação.
- Se bloqueado → reavaliar Abordagem 2 (pedido mínimo ao TI) ou mapear outros domínios acessíveis que suportem execução de código.
