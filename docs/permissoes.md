# Permissões e perfis (SGS-PRO)

> **Fonte de verdade do comportamento atual.** O perfil `enc_flv` foi
> **removido** (migration `db/migrations/20261113090000_encarregados_e_remove_enc_flv.sql`);
> quem tinha esse perfil passou a ser `encarregado`. Tokens antigos com
> `enc_flv` são descartados no cliente e o login já devolve `encarregado`.

## 1. Perfis

| Perfil | Papel |
| --- | --- |
| `admin` | **Root** da loja atual: vê e faz tudo. Pode trocar de loja em runtime. |
| `encarregado` | Responsável por uma equipe (`user`, `promotor`, `col_validade`). Vê as validades dele **e as da equipe**. Edita/exclui os itens da equipe. Tem inventário (só o próprio), rebaixa, e-mail, cadastro de produto e cadastro de usuários da equipe. |
| `user` | Operador de validade. **Não tem acesso ao inventário.** |
| `promotor` | Promotor de loja. Só Validade. |
| `col_validade` | Coletor de validade. Só Validade e vê apenas as próprias coletas. |

A loja **sempre** vem do JWT (`payload.loja`, assinado no login a partir de
`app_users.loja`). Nenhuma tela ou endpoint aceita a loja enviada pelo cliente.

## 2. Vínculo usuário → encarregado(s)

- Tabela `public.usuario_encarregados (usuario, encarregado, loja)`, com
  `UNIQUE (usuario, encarregado)` e FKs para `app_users(username)` e
  `lojas(codigo)`.
- É **N:N**: um `user`/`promotor`/`col_validade` pode estar ligado a **um ou
  mais** encarregados.
- O **seed** liga todos os `user`/`promotor`/`col_validade` existentes ao(s)
  `admin`(s). Roda **uma única vez**, controlado por
  `public.app_schema_flags.encarregados_admin_seed` — se o admin remover um
  vínculo depois, o runtime não o recria.
- O **admin é root**: pode ser responsável por usuários de qualquer loja. O
  `encarregado` só pode ser responsável por usuários da **mesma loja**.
- O admin altera os vínculos na tela **Usuários** (checkbox múltiplo). As ações
  `add` e `update` de `api/manage-users.ts` recebem `newUser.encarregados: string[]`;
  sem escolha explícita, o admin que cadastra vira o responsável.
- O **encarregado** cadastra usuários pelo mesmo endpoint, mas **sem escolher o
  responsável**: o vínculo é automático (ele mesmo). O acesso nasce na **loja do
  token** e só pode ser `user`, `promotor` ou `col_validade`. Ele não edita nem
  remove acessos, e a `list` dele traz apenas a própria equipe.
- Um usuário que muda para `admin`/`encarregado` **perde** os vínculos antigos
  (não faz sentido um supervisor vinculado a outro).
- Código: `api/_lib/encarregados.ts` (`ensureEncarregadosSchema`,
  `encarregadosDoUsuario`, `usuariosDaEquipe`, `resolverEncarregados`,
  `substituirEncarregados`).

## 3. Visibilidade da Validade

`validade_products.created_by` guarda quem coletou (o Arrastão copia
`scanned_by`). A leitura aplica:

| Perfil | `list_all` | `list` / `notifications` | `consulta_periodo` / `list_users` |
| --- | --- | --- | --- |
| `admin` | Tudo da loja | Tudo da loja | Tudo da loja |
| `encarregado` | **Próprias + equipe vinculada** | **Próprias + equipe vinculada** | **Próprias + equipe vinculada** |
| `user` | Conjunto operacional amplo (`promotor`, `user`, `encarregado`, `col_validade`) | Tudo da loja (sino) | — |
| `promotor` | Todos os promotores | Tudo da loja (sino) | — |
| `col_validade` | Apenas as próprias | Tudo da loja (sino) | — |

O `consulta_all_items` do Arrastão (usado na Consulta por Período) também
limita o encarregado a `scanned_by` dele + da equipe.

O `list_users` do encarregado devolve o **roster da equipe** (ele + os usuários
vinculados a ele), mesmo os que ainda não coletaram nada — é o que alimenta o
dropdown "Coletado por" da Consulta por Período. Na tela, o encarregado **não
vê a opção "Arrastão"** nesse dropdown (o admin vê).

## 4. Telas por perfil

| Tela | `admin` | `encarregado` | `user` | `promotor` | `col_validade` |
| --- | :---: | :---: | :---: | :---: | :---: |
| Consulta | ✅ | — | — | — | — |
| Inventário | ✅ (só o próprio) | ✅ (só o próprio) | — | — | — |
| Metas | ✅ | — | — | — | — |
| Validade | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rebaixa | ✅ | ✅ | — | — | — |
| E-mail | ✅ | ✅ (destinatários: só leitura · conta de envio: edita a própria) | — | — | — |
| Adicionar Produto | ✅ | ✅ (só cadastro) | — | — | — |
| Base de Dados | ✅ | — | — | — | — |
| Usuários | ✅ | ✅ (só cadastro e lista da equipe) | — | — | — |
| Revisão de Seções | ✅ | — | — | — | — |

## 5. Ações por endpoint

### `api/manage-validade.ts`

| Ação | Quem pode | Observação |
| --- | --- | --- |
| `list`, `list_all`, `notifications` | todos os logados | Filtro de visibilidade da seção 3 |
| `add` | todos os logados | Grava `created_by` = usuário do token |
| `update`, `remove` | admin, **encarregado** | O encarregado só alcança os itens **da própria equipe** (`created_by = ANY(equipe)`) |
| `consulta_periodo` | admin, encarregado | Encarregado limitado à equipe |
| `list_users` | admin, encarregado | Encarregado recebe o **roster da equipe** |
| `whatsapp_*` | **admin** | Credenciais só no servidor; o alerta é **da loja** (não é filtrado por equipe) |

### `api/manage-inventory.ts`

O inventário é **por usuário**: cada login tem o seu lote aberto e só enxerga
os lotes que criou (`inventory_lotes.created_by`). Antes o lote era único por
loja e os itens de um login apareciam no inventário de outro.

| Ação | Quem pode |
| --- | --- |
| `list`, `list_lotes`, `get_lote`, `list_audit`, `add`, `suspend`, `resume`, `rename`, `finalize` | admin, encarregado (sempre no lote do próprio login) |
| `update`, `remove`, `clear` | **admin** (só no lote aberto do próprio login) |

### `api/manage-rebaixa.ts`

`list`, `add`, `add_many`, `update`, `remove`, `clear`, `history`,
`history_items`, `mark_sent`: **admin e encarregado**.

A Rebaixa é da **loja** (não é filtrada por equipe) e **do usuário**:

| Perfil | Rascunho (`list`) | Histórico (`history`, `history_items`) | Escrita (`add`, `update`, `remove`, `clear`, `mark_sent`) |
| --- | --- | --- | --- |
| `admin` | Só o **próprio** | **Todos os lotes da loja** (supervisão) | Só nos itens do **próprio** usuário |
| `encarregado` | Só o **próprio** | Só os **próprios** lotes | Só nos itens do **próprio** usuário |

O rascunho é **sempre do próprio login** (inclusive para o admin): a lista que
ele monta, exporta e envia é a dele. Sem essa separação o admin veria os itens
de outro login na própria lista e o envio não marcaria o lote — o `mark_sent`
só alcança o que é dele. A supervisão do admin acontece no **histórico**, que
lista os lotes enviados da loja inteira (com o autor de cada um).

O dono do item é `rebaixa_products.created_by` (o `username` do token). As
ações destrutivas nunca alcançam a lista de outro login, mesmo para o admin.
O rascunho é deduplicado por `(loja, created_by, validade_id)` — o mesmo item
da Validade pode estar na rebaixa de dois logins diferentes.

### `api/query-product.ts`

| Ação | Quem pode |
| --- | --- |
| `check`, `costs`, `categorias` | qualquer logado |
| `insert`, `add_packaging` | **admin, encarregado** |
| `update`, `edit_lookup`, `remove_packaging`, `set_categoria` | **admin** |

O encarregado vê a tela **Adicionar Produto** sem o modo "Editar"
(`<AddProductView canEdit={false} />`).

### Outros

| Endpoint | Regra |
| --- | --- |
| `api/manage-users.ts` | `list`: admin (loja inteira) / **encarregado (só a equipe)**. `list_encarregados`: admin (loja) / **encarregado (só ele)**. `add`: **admin** (qualquer perfil, qualquer loja da lista) / **encarregado** (só `user`/`promotor`/`col_validade`, na loja do token, com vínculo automático nele). `update`, `delete`, `switch_loja`: **admin**. `list_lojas`: qualquer logado. |
| `api/manage-emails.ts` | Leitura: admin, encarregado. Destinatários (`add`, `update`, `remove`, `setDefault`, `setDefaults`): **admin**. Conta de envio: `my_account`/`save_account` = o próprio login; `list_accounts`/`update_account`/`remove_account` = **admin**. |
| `api/send-rebaixa-email.ts` | admin, encarregado. |
| `api/manage-consulta.ts` | `list`: qualquer logado. `replace`: **admin**. |
| `api/manage-metas.ts` | **admin**. |
| `api/ai-assist.ts` | `read_label`: qualquer logado. `import_review` e `review_categorias`: **admin**. |
| `api/manage-arrastao.ts` | Sessão/itens: participantes logados. `consulta_all_items`: admin (tudo) / encarregado (equipe). |
| `api/auth-login.ts` | Normaliza `enc_flv` → `encarregado` no token. |

## 6. Conta de e-mail de envio (remetente)

Cada login que envia rebaixa pode ter a **própria caixa** no servidor padrão
da empresa (`mail.comper.com.br`, TLS na porta 465). O servidor é o mesmo
para todos — o que muda é o par **usuário/senha**:

- Tabela `public.email_envio (loja, usuario)` — uma conta por login e loja
  (unicidade em `(loja, usuario)`).
- A senha fica **criptografada** (AES-256-GCM, `api/_lib/email-crypto.ts`),
  com a chave derivada de `EMAIL_ENC_SECRET` (ou, na falta, `JWT_SECRET`).
  **Ela nunca volta para o navegador** — a tela só sabe se existe (`temSenha`).
- No envio (`api/send-rebaixa-email.ts`), a conta do usuário tem **precedência**
  sobre a configuração do servidor: a rebaixa sai da caixa de quem montou a
  lista. Sem conta cadastrada, vale o fallback do servidor (Resend ou SMTP das
  env vars).
- Os **destinatários** (`email_padrao`) continuam sendo **por loja** e são
  gerenciados pelo admin — o encarregado não altera a lista da loja.

### Quem faz o quê

| Ação | Admin | Encarregado |
| --- | :---: | :---: |
| Ver a própria conta (`my_account`) | ✅ | ✅ |
| Salvar a própria conta (`save_account`) | ✅ | ✅ |
| Ver as contas da loja (`list_accounts`) | ✅ | — |
| Editar a conta de outro login (`update_account`) | ✅ | — |
| Remover a conta de outro login (`remove_account`) | ✅ | — |
| Destinatários e assunto/mensagem padrão | ✅ | — |

Quando o admin edita a conta de outro login e deixa a senha em branco, a
senha guardada **continua valendo** (`api/_lib/email-envio.ts`
→ `atualizarContaDeEnvio`).

## 7. Inventário por usuário

O inventário é **por login**, não por loja:

- Cada login tem **um lote aberto** — `inventory_lotes.created_by` é o usuário
  do token — e só enxerga os lotes que criou (`list`, `list_lotes`,
  `get_lote`, `list_audit`, `rename`, `suspend`, `resume`, `finalize`).
- O índice único parcial `idx_inventory_lotes_aberto_usuario`
  (`(loja, created_by)` onde `status = 'aberto'`) garante a regra de um lote
  aberto por usuário.
- A migration `db/migrations/20261113110000_inventario_por_usuario.sql`
  **dividiu** os lotes que tinham itens de coletores diferentes do dono: cada
  coletor ganhou um lote próprio, com os itens dele (nada foi perdido nem
  misturado).
- `shared_inventory.created_by` continua sendo quem **contou** o item — é a
  origem do split.

## 8. O que continua igual

- O catálogo (`produto`, `produto_codigos`, `produto_eans`, `categoria`,
  `produto_embalagens`, custo/PMZ) é **compartilhado** entre as lojas.
- O preço da rebaixa é sempre `max(50% do PMZ, R$ 0,99)`; a IA nunca escreve no
  banco.
- Produto de KG (balança) não entra na Validade nem no Arrastão.
- A loja do escopo vem do JWT; o `admin` é o único que troca de loja.
- Nenhuma tela depende da IA: sem chave configurada, o app segue funcionando.
