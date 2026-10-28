# Backend sem Supabase — recomendação e plano

**Situação:** o app estava 100% apoiado no Supabase (auth via Edge Functions, tabelas no
Postgres do Supabase e `supabase.functions.invoke` no frontend). O Supabase **não faz mais
parte do projeto**: a recomendação é publicar o backend como **Serverless Functions na
Vercel**, acessando o **Neon** (Postgres serverless) que já era o banco real usado pelas
Edge Functions. Nada de credencial de banco chega ao navegador.

## Arquitetura

```
Navegador (React/Vite)
   └── fetch('/api/<função>')  ── Authorization: Bearer <JWT>
            │
   Vercel (funções serverless Node 22 — pasta api/)
            │
            ├── Connector gateway do Lovable  (LOVABLE_API_KEY + NEON_API_KEY)
            │      • consultas e lotes transacionais
            └── Driver Neon serverless        (NEON_DATABASE_URL)  [fallback]
```

- **Frontend**: `src/lib/api.ts` (`invokeFunction`) substitui `supabase.functions.invoke`,
  mantendo a mesma assinatura (`{ data, error }`) — nenhuma regra de negócio mudou.
- **Sessão**: JWT próprio (HS256) assinado com `JWT_SECRET`, em `api/_lib/jwt.ts`.
  O payload continua em base64 clássico para o `atob()` do navegador decodificar.
- **Banco**: `api/_lib/db.ts` escolhe o caminho automaticamente — se `NEON_DATABASE_URL`
  existir usa o driver Neon; senão usa o connector gateway. Lotes (`sql([...])`) continuam
  transacionais nos dois caminhos.
- **Tempo real**: o canal `postgres_changes` do Supabase saiu. O inventário passou a ser
  sincronizado por polling (15 s) e ao voltar para a aba (`DataContext`).

## Enduntos (rotas)

| Rota | Substitui | O que faz |
|---|---|---|
| `POST /api/auth-login` | `auth-login` | login (bcrypt) + emite JWT |
| `POST /api/query-product` | `query-product` | catálogo: buscar, cadastrar, editar (lock transacional) |
| `POST /api/manage-inventory` | `manage-inventory` | lotes do inventário, auditoria, finalizar/suspender |
| `POST /api/manage-users` | `manage-users` | usuários (admin) |
| `POST /api/manage-metas` | `manage-metas` | metas mensais |
| `POST /api/manage-consulta` | `manage-consulta` | catálogo de consulta (preço/estoque) |
| `POST /api/manage-arrastao` | `manage-arrastao` | sessões e itens do arrastão |
| `POST /api/manage-validade` | `manage-validade` | validade/rebaixa (motivo Excesso/Qualidade) |

Todas exigem `Authorization: Bearer <token>` (exceto `auth-login`).

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Obrigatória | Observação |
|---|---|---|
| `JWT_SECRET` | sim | segredo do token de sessão. **Trocar o valor antigo (era a service role key do Supabase) invalida as sessões ativas — todos fazem login de novo.** Use um valor aleatório longo. |
| `NEON_DATABASE_URL` | uma das duas | connection string do Neon (driver serverless) |
| `LOVABLE_API_KEY` + `NEON_API_KEY` | uma das duas | credenciais do connector gateway (lote transacional) |
| `VITE_API_BASE_URL` | não | vazio = mesma origem. Só para apontar a API em outro host |

> Hoje **nenhuma** variável existe no projeto da Vercel (`vercel env ls` retorna vazio) —
> sem elas a API responde 500/401. É o principal bloqueio do merge.

## O que saiu do projeto

- `src/integrations/supabase/` (client, types, previewAuthStorage) e a dependência
  `@supabase/supabase-js`.
- Pasta `supabase/` (funções Deno, `config.toml`). As 14 migrations passaram a viver em
  `db/migrations/` — aplique-as no banco antes de entrar no ar (a coluna `motivo` de
  `validade_products` também é criada de forma idempotente pela própria função).
- Variáveis `VITE_SUPABASE_*` do `.env`.

## Passos de deploy

1. Definir as variáveis de ambiente acima na Vercel (produção e preview).
2. Aplicar `db/migrations/*.sql` no Neon, na ordem dos prefixos de data.
   Os comandos exclusivos do Supabase (`supabase_realtime`, papel `service_role`)
   já estão protegidos por blocos condicionais, então rodam sem erro no Neon puro.
   A coluna `motivo` de `validade_products` também é criada de forma idempotente
   pela função `api/manage-validade.ts` — mas vale aplicá-la pela migration.
3. `npx vercel --prod` (ou push na branch, que já dispara o deploy).
4. Testar: login → inventário (adicionar/finalizar lote) → validade (KG com motivo,
   UN com data) → consulta → arrastão → metas → usuários.

### Comandos para configurar as variáveis (CLI)

```sh
# 1. Segredo do token (gere um valor aleatório, ex.: openssl rand -hex 32)
npx vercel env add JWT_SECRET production

# 2. Banco — escolha UMA das duas opções:
#    (a) connection string do Neon (driver serverless)
npx vercel env add NEON_DATABASE_URL production
#    (b) connector gateway (lote transacional no cadastro de produtos)
npx vercel env add LOVABLE_API_KEY production
npx vercel env add NEON_API_KEY production

# 3. Repita para preview:
npx vercel env add JWT_SECRET preview
...
```

### Como validar antes de mergear

Com a branch `feat/vercel-api-sem-supabase` deployada em preview:

```sh
# deve responder 401 {"error":"Token obrigatório"} (rota viva, sem token)
curl -X POST https://<preview>.vercel.app/api/manage-validade \
  -H 'Content-Type: application/json' -d '{"action":"list_all"}'
```


## Riscos e rollback

- **Sessões**: `JWT_SECRET` novo = relogin de todos (esperado, não é bug).
- **Polling em vez de realtime**: dois contadores na mesma tela podem divergir por até
  15 s; a verdade sempre vem do banco no próximo refresh.
- **Credenciais**: se `NEON_DATABASE_URL` e o gateway estiverem ausentes, a API degrada
  para 503 com mensagem amigável — melhor do que derrubar o front.
- **Rollback**: a `main` atual continua íntegra e no ar. Se algo falhar, volte o deploy
  para o commit anterior no painel da Vercel (instantâneo, sem rebuild).
