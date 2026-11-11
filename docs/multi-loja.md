# Multi-loja (multi-tenant)

O SGS-PRO atende várias lojas da empresa: **73, 82, 83, 88, 92, 93, 96, 103,
104, 108, 143, 148 e 173** (13 lojas).

Todas usam o **mesmo catálogo** e as **mesmas regras de negócio**, mas cada
loja trata o **seu próprio dado operacional**. A loja 103 não enxerga a
validade da loja 92; a loja 92 não apaga a base de consulta da loja 103.

> O catálogo (produtos, códigos, EANs, seções, embalagens e **custo/PMZ**) é
> **compartilhado** — não tem coluna de loja. É decisão conscious: o custo é
> o mesmo em toda a empresa, então não existe tabela de custo por loja.

---

## 1. O modelo

### Compartilhado (sem loja)

| Tabela | Conteúdo |
| --- | --- |
| `produto` | Cadastro mestre (código, descrição, EAN, **custo/PMZ**, seção) |
| `produto_codigos` | Códigos alternativos do produto |
| `produto_eans` | EANs alternativos do produto |
| `categoria` | Taxonomia de seções (19 seções) |
| `produto_embalagens` | Embalagens (CX/FD/SC) e a quantidade do produto base |

### Operacional (com `loja`)

| Tabela | O que é | Chave/unicidade por loja |
| --- | --- | --- |
| `app_users` | Usuários e o vínculo com a loja | `username` único (global), `loja` do usuário |
| `validade_products` | Itens da Validade | id |
| `shared_inventory` | Itens contados no Inventário | `(loja, codigo, lote_numero)` |
| `inventory_lotes` | Lotes de contagem | `(loja, numero)` — um lote aberto por loja |
| `inventory_lote_audit` | Auditoria do Inventário | — |
| `consulta_products` | Base da Consulta (estoque/preço da loja) | `(loja, codigo)` |
| `metas_mensais` | Meta e realizado do mês | `(loja, ano, mes, dia)` |
| `rebaixa_products` | Rascunho e histórico da Rebaixa | rascunho deduplicado por `(loja, validade_id)` |
| `arrastao_sessions` | Sessões de arrastão | id |
| `arrastao_items` | Itens escaneados | id |
| `email_padrao` | Destinatários padrão da rebaixa | `(loja, e-mail)` + um "padrão" por loja |
| `email_config` | Assunto/mensagem padrão | **PK (loja)** — uma linha por loja |
| `whatsapp_envios` | Histórico/idempotência dos alertas | `(loja, slot, dia)` nos slots automáticos |
| `whatsapp_destinatarios` | Números que recebem o alerta da loja | `(loja, telefone)` |

A coluna `loja` é `INTEGER NOT NULL DEFAULT 103` com FK para
`public.lojas(codigo)`. O default cobre os dados herdados: **tudo que já
existia no banco (118 itens de validade, 520 de inventário, 13 de rebaixa,
os 18 usuários, as metas, os e-mails etc.) é da loja 103**.

---

## 2. Onde o escopo é aplicado

**No servidor, sempre, a partir do token.** O navegador nunca escolhe a loja.

```
login  →  app_users.loja  →  JWT { sub, role, loja, iat, exp }
                                    │
                     cada endpoint  ▼
                    resolveLoja(payload) →  WHERE loja = $1
```

O núcleo fica em `api/_lib/loja.ts`:

| Função | O que faz |
| --- | --- |
| `DEFAULT_LOJA` | `103` — loja usada quando ainda não há escopo definido |
| `ensureLojaSchema(sql)` | Cria `public.lojas` e `app_users.loja` de forma idempotente |
| `lojaDoToken(payload)` | Lê a claim `loja` do JWT (`null` em tokens antigos) |
| `resolveLoja(sql, payload)` | Claim do token → cadastro do usuário → `DEFAULT_LOJA` |
| `lojaDoUsuario(sql, username)` | Loja cadastrada do usuário (com cache em memória) |
| `listarLojas(sql)` | Lojas cadastradas (alimenta o seletor do admin) |
| `lojaAtiva(sql, codigo)` | A loja existe e está ativa? |
| `filtroLoja(params, loja, alias)` | Monta `alias.loja = $N` em consultas parametrizadas |

**Tokens antigos** (emitidos antes do multi-loja) não têm a claim `loja`: o
servidor busca a loja no cadastro do usuário e, em último caso, cai na 103.
Ou seja, **nenhum usuário fica sem escopo**.

### Endpoints escopados

| Endpoint | O que é filtrado/gravado por loja |
| --- | --- |
| `api/manage-validade.ts` | `list`, `list_all`, `add`, `update`, `remove`, `consulta_periodo`, `list_users`, `notifications` |
| `api/manage-inventory.ts` | Lote aberto, itens contados, auditoria, `clear`, `update`, `remove` |
| `api/manage-consulta.ts` | `list` e o `replace` da importação (só apaga a base da loja) |
| `api/manage-metas.ts` | `get`, `save_meta`, `save_realizado` |
| `api/manage-rebaixa.ts` | Rascunho, histórico, `clear`, `mark_sent` |
| `api/manage-arrastao.ts` | Sessões, itens, `consulta_all_items`; o `finalizeSession` leva a loja da sessão para a Validade |
| `api/manage-emails.ts` | Destinatários e assunto/mensagem padrão |
| `api/send-rebaixa-email.ts` | Destinatário padrão da loja |
| `api/_lib/whatsapp-endpoint.ts` | Digest, destinatários, idempotência e o cron por loja |
| `api/manage-users.ts` | Cadastro de usuários, `list_lojas` e `switch_loja` |

> **Cuidado com os "apaga tudo":** o `DELETE FROM consulta_products` da
> importação e o `clear` da Rebaixa são os dois pontos onde uma loja poderia
> apagar o dado de outra. Ambos filtram por `loja` — e há teste para isso.

---

## 3. Usuários e a troca de loja

### Um usuário pertence a uma loja

`app_users.loja` é **fixo**. O vínculo do usuário com a loja não muda com a
troca em runtime: o admin está trabalhando "como" outra loja, mas o cadastro
dele continua apontando para a loja original.

### O admin troca de loja em runtime

No menu do usuário (canto superior direito) aparece **Trocar loja**. A troca:

1. chama `POST /api/manage-users` com `{ action: 'switch_loja', newUser: { loja } }`;
2. o servidor valida que a loja existe e está ativa (`lojaAtiva`);
3. **re-assina o token** com a nova loja (preservando o prazo que ainda resta);
4. o frontend grava o novo token e **recarrega a página** — todas as telas
   voltam a buscar os dados da nova loja.

Como o escopo vem do token assinado, o cliente não consegue pedir "a loja
que eu quiser": ele só pode pedir uma loja que o servidor validou.

### Ações de `api/manage-users.ts`

| Action | Quem pode | O que faz |
| --- | --- | --- |
| `list` | admin | Lista os usuários (com a loja) |
| `add` | admin | Cadastra um usuário numa loja |
| `update` | admin | Altera perfil, senha e loja |
| `delete` | admin | Remove um usuário |
| `list_lojas` | qualquer logado | Lista as lojas (alimenta o seletor e o badge) |
| `switch_loja` | admin | Troca a loja do token |

---

## 4. E-mail e WhatsApp por loja

### E-mail da Rebaixa

- `email_padrao` é da loja: a loja 103 tem os seus destinatários e a loja 92
  tem os dela. Só há **um** e-mail marcado como "padrão" **por loja**.
- `email_config` (assunto/mensagem padrão) tem **PK (loja)** — cada loja
  escreve o seu texto.
- No envio (`api/send-rebaixa-email.ts`), o destinatário segue esta ordem:
  1. o que o usuário digitou na tela;
  2. o e-mail **padrão da loja** (`email_padrao.padrao`);
  3. o `REBAIXA_EMAIL_TO` do servidor.
- A cópia em Cc (`REBAIXA_EMAIL_COPY`, padrão `isaiassilva@comper.com.br`)
  continua valendo para todas as lojas.

### WhatsApp da Validade

- Os números ficam em `whatsapp_destinatarios` (por loja). Se a loja **não**
  tiver nenhum número cadastrado, ela usa os números do servidor
  (`WHATSAPP_RECIPIENTS`) — é o fallback para não ficar loja sem alerta.
- O **cron** (`GET /api/manage-validade`) itera as lojas ativas e manda **um
  alerta por loja**: digest, lista e destinatários são os da loja.
- A idempotência é por `(loja, slot, dia)`: a loja 92 não "queima" o slot da
  loja 103 (e vice-versa).
- A tela (botão verde na Validade, admin/encarregado) mostra a prévia e envia
  manualmente **os produtos da loja do usuário** para **os destinatários da
  loja**.
- O token e o número do remetente continuam **só no servidor** — o navegador
  nunca vê a credencial.

Cadastrar os destinatários de uma loja (a tela ainda não tem cadastro — é
feito por SQL):

```sql
INSERT INTO public.whatsapp_destinatarios (loja, telefone, nome, ativo)
VALUES (92, '5511988888888', 'Encarregado Loja 92', TRUE)
ON CONFLICT (loja, telefone) DO UPDATE SET ativo = TRUE, nome = EXCLUDED.nome;
```

---

## 5. Aplicar a migration

A migration oficial é `db/migrations/20261111090000_add_loja.sql` (schema
multi-loja) e `db/migrations/20261111091000_add_lojas_empresa.sql` (as 8 lojas
que faltavam no cadastro).
**No Neon elas já foram aplicadas** (as 13 lojas estão ativas, as 14 tabelas
operacionais têm a coluna `loja` e os dados herdados ficaram na 103).

O driver HTTP do Neon (`neon().query`) recusa múltiplos comandos numa
prepared statement. Para aplicar o arquivo inteiro use o driver websocket:

```js
import { Client } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const client = new Client(process.env.NEON_DATABASE_URL);
await client.connect();
for (const arquivo of [
  'db/migrations/20261111090000_add_loja.sql',
  'db/migrations/20261111091000_add_lojas_empresa.sql',
]) {
  await client.query(readFileSync(arquivo, 'utf8'));
}
await client.end();
```

O script roda numa transação implícita: uma falha reverte tudo.

> **Nota:** a tabela `whatsapp_envios` **não existia** no Neon (a migration
> antiga do WhatsApp nunca havia sido aplicada). A migration multi-loja cria
> ela e a `whatsapp_destinatarios`.

### Rede de segurança no runtime

Cada endpoint continua chamando o seu `ensureSchema`, que agora também
garante a coluna `loja` (e os índices por loja) de forma idempotente. Se a
migration ainda não tiver sido aplicada, a aplicação não quebra — o `DEFAULT
103` segura a gravação e o filtro explícito devolve erro claro na leitura.

---

## 6. Checklist de operação

### Cadastrar um usuário de outra loja

Na tela **Usuários** (menu do usuário → Usuários), o campo **Loja** aparece no
cadastro e na edição. O mesmo e-mail pode existir em lojas diferentes — a
unicidade do e-mail do WhatsApp e da Rebaixa é por loja.

### Criar uma loja nova

```sql
INSERT INTO public.lojas (codigo, nome) VALUES (110, 'Loja 110');
```

Depois disso a loja aparece no seletor "Trocar loja" do admin (a lista é lida
do banco a cada carregamento) e no campo de loja do cadastro de usuários.
Para desligar uma loja: `UPDATE public.lojas SET ativo = FALSE WHERE codigo = 110;`
(loja inativa não aparece no seletor e não recebe o alerta do WhatsApp).

### Verificar o estado no banco

```sql
-- dados por loja
SELECT 'validade' AS tabela, loja, count(*) FROM public.validade_products GROUP BY loja
UNION ALL SELECT 'inventario', loja, count(*) FROM public.shared_inventory GROUP BY loja
UNION ALL SELECT 'rebaixa', loja, count(*) FROM public.rebaixa_products GROUP BY loja;

-- usuários por loja
SELECT loja, role, count(*) FROM public.app_users GROUP BY loja, role;
```

---

## 7. Cobertura de testes

| Arquivo | O que trava |
| --- | --- |
| `src/test/loja-escopo.test.ts` | 22 casos: cada endpoint filtra e grava pela loja do token (Validade, Consulta, Inventário, Metas, Rebaixa, Arrastão, Usuários, E-mails), inclusive a troca de loja re-assinando o token |
| `src/test/whatsapp-validade.test.ts` | Cron por loja, destinatários por loja e prévia da tela mostrando só a loja do usuário |
| `src/test/auth-login.test.ts` | A claim `loja` no token e o fallback para a loja padrão |
| `src/test/header-username.test.tsx` | O selo de loja no cabeçalho |
| `src/test/send-rebaixa-email.test.ts` | O destinatário padrão da loja |

> Ao mockar `useAuth` em testes, inclua `loja`, `lojas` e `switchLoja` — o
> Header usa `lojas.find(...)` para o nome da loja.

---

## 8. Regras para quem mexer no código

1. **Nunca confie numa loja vinda do cliente.** O escopo é o `payload.loja`
   (ou `resolveLoja(sql, payload)`). Se um endpoint novo precisar do escopo,
   ele resolve a loja **no servidor**.
2. **Toda tabela operacional nova ganha coluna `loja`** com
   `DEFAULT 103` + FK para `public.lojas(codigo)`, e um índice por loja.
3. **Toda query operacional filtra por loja** — inclusive `DELETE`, `UPDATE`,
   `COUNT` e os `INSERT ... ON CONFLICT`. `ON CONFLICT` que involve unicidade
   por loja precisa da loja na chave (`ON CONFLICT (loja, ano, mes, dia)`).
4. **O `ensureSchema` de cada endpoint também cria a coluna `loja`** — é a
   rede de segurança quando a migration ainda não foi aplicada.
5. **Nada de endpoint novo em `api/`**: o plano Hobby da Vercel limita a
   **12 Serverless Functions** e o projeto já tem 12. A lógica nova vai para
   `api/_lib/` ou para um endpoint existente.
6. **Não criar tabela de custo por loja** — o custo é compartilhado (decisão
   do negócio).
