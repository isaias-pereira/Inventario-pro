# Permissões e perfis (SGS-PRO)

> **Fonte de verdade do comportamento atual.** O perfil `enc_flv` foi
> **removido** (migration `db/migrations/20261113090000_encarregados_e_remove_enc_flv.sql`);
> quem tinha esse perfil passou a ser `encarregado`. Tokens antigos com
> `enc_flv` são descartados no cliente e o login já devolve `encarregado`.

## 1. Perfis

| Perfil | Papel |
| --- | --- |
| `admin` | **Root** da loja atual: vê e faz tudo. Pode trocar de loja em runtime. |
| `encarregado` | Responsável por uma equipe (`user`, `promotor`, `col_validade`). Vê as validades dele **e as da equipe**. Tem inventário, rebaixa, e-mail e cadastro de produto. |
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

## 4. Telas por perfil

| Tela | `admin` | `encarregado` | `user` | `promotor` | `col_validade` |
| --- | :---: | :---: | :---: | :---: | :---: |
| Consulta | ✅ | — | — | — | — |
| Inventário | ✅ | ✅ | — | — | — |
| Metas | ✅ | — | — | — | — |
| Validade | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rebaixa | ✅ | ✅ | — | — | — |
| E-mail | ✅ | ✅ (só leitura) | — | — | — |
| Adicionar Produto | ✅ | ✅ (só cadastro) | — | — | — |
| Base de Dados | ✅ | — | — | — | — |
| Usuários | ✅ | — | — | — | — |
| Revisão de Seções | ✅ | — | — | — | — |

## 5. Ações por endpoint

### `api/manage-validade.ts`

| Ação | Quem pode | Observação |
| --- | --- | --- |
| `list`, `list_all`, `notifications` | todos os logados | Filtro de visibilidade da seção 3 |
| `add` | todos os logados | Grava `created_by` = usuário do token |
| `update`, `remove` | admin | |
| `consulta_periodo` | admin, encarregado | Encarregado limitado à equipe |
| `list_users` | admin, encarregado | Encarregado limitado à equipe |
| `whatsapp_*` | admin, encarregado | Credenciais só no servidor; o alerta é **da loja** (não é filtrado por equipe) |

### `api/manage-inventory.ts`

| Ação | Quem pode |
| --- | --- |
| `list`, `list_lotes`, `get_lote`, `list_audit`, `add`, `suspend`, `resume`, `rename`, `finalize` | admin, encarregado |
| `update`, `remove`, `clear` | **admin** |

### `api/manage-rebaixa.ts`

`list`, `add`, `add_many`, `update`, `remove`, `clear`, `history`,
`history_items`, `mark_sent`: **admin e encarregado**.
A Rebaixa continua sendo da **loja** (não é filtrada por equipe).

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
| `api/manage-users.ts` | Todas as ações de gestão: **admin**. `list_lojas`: qualquer logado. |
| `api/manage-emails.ts` | Leitura: admin, encarregado. Cadastro/edição: **admin**. |
| `api/send-rebaixa-email.ts` | admin, encarregado. |
| `api/manage-consulta.ts` | `list`: qualquer logado. `replace`: **admin**. |
| `api/manage-metas.ts` | **admin**. |
| `api/ai-assist.ts` | `read_label`: qualquer logado. `import_review` e `review_categorias`: **admin**. |
| `api/manage-arrastao.ts` | Sessão/itens: participantes logados. `consulta_all_items`: admin (tudo) / encarregado (equipe). |
| `api/auth-login.ts` | Normaliza `enc_flv` → `encarregado` no token. |

## 6. O que continua igual

- O catálogo (`produto`, `produto_codigos`, `produto_eans`, `categoria`,
  `produto_embalagens`, custo/PMZ) é **compartilhado** entre as lojas.
- O preço da rebaixa é sempre `max(50% do PMZ, R$ 0,99)`; a IA nunca escreve no
  banco.
- Produto de KG (balança) não entra na Validade nem no Arrastão.
- A loja do escopo vem do JWT; o `admin` é o único que troca de loja.
- Nenhuma tela depende da IA: sem chave configurada, o app segue funcionando.
