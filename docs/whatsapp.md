# Alertas de validade por WhatsApp (Meta Cloud API)

O SGS-PRO envia os alertas de validade por WhatsApp usando a **API oficial da
Meta (WhatsApp Cloud API)**. O envio é feito pelo servidor: o token nunca chega
ao navegador. Sem as credenciais configuradas o app continua funcionando
normalmente — a tela da Validade apenas avisa que a integração está indisponível.

## Como funciona

| Quando | O que acontece |
| --- | --- |
| Todos os dias às **07h** e **13h** (Brasília) | Os crons da Vercel chamam `GET /api/manage-validade`; o servidor monta o resumo + lista **de cada loja** e envia o template para os destinatários dela. |
| A qualquer momento | Na aba **Validade**, o botão verde do WhatsApp (admin/encarregado) mostra a prévia exata da **loja do usuário** e permite **Enviar agora**. |

- Só entram produtos **ativos** (`status = true`), **sem motivo** (os itens KG
  de balança não vencem) e com validade até `WHATSAPP_ALERT_DAYS` dias à frente
  — inclusive os já vencidos.
- Se não houver nenhum produto no período, **nada é enviado**.
- Cada slot do dia é enviado **uma única vez por loja**. Se o cron repetir (a
  Vercel pode executar com até ~59 min de atraso no plano Hobby), a segunda
  chamada responde `skipped` e não manda mensagem duplicada. O controle fica
  na tabela `whatsapp_envios` (loja + slot + dia em America/Sao_Paulo).
- O antigo webhook do Zapier que rodava no navegador foi removido para não
  duplicar as mensagens.

## Multi-loja

O alerta é **por loja** (detalhes em [multi-loja.md](./multi-loja.md)):

- o cron **itera as lojas ativas** e manda um alerta para cada uma — o digest,
  a lista e os destinatários são os da loja;
- os números ficam na tabela `whatsapp_destinatarios` (uma linha por loja);
  **sem número cadastrado**, a loja usa os números do servidor
  (`WHATSAPP_RECIPIENTS`) — é o fallback para nenhuma loja ficar sem alerta;
- o token e o número do remetente continuam **só no servidor**;
- a tela (botão verde) mostra e envia **os produtos da loja do usuário** para
  **os destinatários da loja**.

## 1. Configurar o app na Meta

1. Crie/abra um app em <https://developers.facebook.com/apps> e adicione o
   produto **WhatsApp**.
2. Em **WhatsApp → API Setup**, anote o **Phone number ID** (não é o número em
   si) e o **WhatsApp Business Account ID**.
3. Para testar, use o número de teste da Meta: cadastre o seu celular em
   **To** e confirme o código recebido no WhatsApp.
4. Para produção, conecte um número real da empresa e conclua a verificação do
   negócio (Business Verification) exigida pela Meta.

### Token permanente

O token exibido na tela de API Setup expira em 24h. Para o cron funcionar sem
manutenção, crie um **System User** no Business Manager:

1. **Configurações do negócio → Usuários → Usuários do sistema** → adicionar.
2. Dê acesso ao app e à conta do WhatsApp Business.
3. Gere um token com as permissões **`whatsapp_business_messaging`**,
   `business_management` e `whatsapp_business_management`.
4. Guarde o token: ele só aparece uma vez. Use-o em `WHATSAPP_TOKEN`.

## 2. Criar o template aprovado

Mensagens iniciadas pelo negócio (fora da janela de 24h de conversa) precisam
de um **template aprovado**. Em **WhatsApp → Gerenciador de modelos**, crie:

- **Nome:** `alerta_validade_sgs`
- **Categoria:** `Utilidade` (Utility)
- **Idioma:** `Português (BR)` → código `pt_BR`

Corpo do template (exatamente com duas variáveis, nesta ordem):

```text
🔔 *Alerta de validade — SGS-PRO*

{{1}}

{{2}}

Acesse o SGS-PRO para ver a lista completa.
```

- `{{1}}` recebe o **resumo** (ex.: `2 vencidos · 1 vence hoje · 4 vencem em até 4 dias — 7 produtos no total.`).
- `{{2}}` recebe a **lista** em uma única linha (ex.: `ARROZ 5KG — 3 un — vencido (08/11/2026) • …`).

> A Meta recusa parâmetros de template com quebra de linha ou tabulação. Por
> isso a lista usa ` • ` como separador e é cortada em 900 caracteres (o limite
> é 1024). Se houver mais produtos do que cabe, a mensagem termina com
> `e mais N produtos` e a lista completa fica no SGS-PRO.

Se você mudar o nome/idioma do template, ajuste `WHATSAPP_TEMPLATE` e
`WHATSAPP_TEMPLATE_LANG`.

## 3. Variáveis de ambiente na Vercel

Cadastre em **Project → Settings → Environment Variables** (Production e
Preview, conforme o caso). Nenhuma delas pode ter o prefixo `VITE_`.

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `WHATSAPP_TOKEN` | sim | Token permanente do System User (aceita o apelido `WHATSAPP_ACCESS_TOKEN`). |
| `WHATSAPP_PHONE_NUMBER_ID` | sim | Phone number ID do app Meta (aceita o apelido `WHATSAPP_PHONE_ID`). |
| `WHATSAPP_RECIPIENTS` | não (se houver destinatários por loja) | Números separados por vírgula, usados como **fallback**: valem para as lojas que não têm número cadastrado em `whatsapp_destinatarios`. Pode usar `+55 (11) 99999-9999` ou `5511999999999`; o servidor normaliza e remove repetidos. |
| `CRON_SECRET` | sim (para o cron) | Segredo que a Vercel envia no `Authorization: Bearer` ao chamar o cron. Sem ele o `GET` responde 503. |
| `WHATSAPP_TEMPLATE` | não | Nome do template. Padrão: `alerta_validade_sgs`. |
| `WHATSAPP_TEMPLATE_LANG` | não | Idioma do template. Padrão: `pt_BR`. |
| `WHATSAPP_API_VERSION` | não | Versão do Graph API. Padrão: `v23.0`. |
| `WHATSAPP_ALERT_DAYS` | não | Dias de antecedência do alerta. Padrão: `4`. |
| `WHATSAPP_MAX_ITEMS` | não | Máximo de produtos na lista da mensagem. Padrão: `30` (o limite de caracteres ainda se aplica). |

Depois de cadastrar, faça um novo deploy para as variáveis valerem.

## 4. Crons da Vercel

O `vercel.json` já declara os dois envios:

```json
"crons": [
  { "path": "/api/manage-validade", "schedule": "0 10 * * *" },
  { "path": "/api/manage-validade", "schedule": "0 16 * * *" }
]
```

Os horários são em **UTC**: `10:00 UTC = 07:00` e `16:00 UTC = 13:00` em
America/Sao_Paulo (UTC-3, sem horário de verão). O endpoint identifica o slot
pelo cabeçalho `x-vercel-cron-schedule`, então um atraso do cron não troca o
slot.

> **Por que `/api/manage-validade`?** O plano Hobby da Vercel aceita no máximo
> **12 Serverless Functions** por deploy. Como a Validade já usa
> `api/manage-validade.ts`, a lógica do WhatsApp fica em
> `api/_lib/whatsapp-endpoint.ts` e é chamada por essa função (o `_lib` não
> conta como função). A tela usa as ações `whatsapp_config`,
> `whatsapp_preview`, `whatsapp_send` e `whatsapp_history` no mesmo endpoint.

> **Plano Hobby:** cada expressão de cron roda no máximo **1x por dia** e pode
> atrasar até ~59 minutos. Como são duas expressões distintas, os dois envios
> diários funcionam. Em planos pagos a precisão é maior.

## 5. Testar

### Pela tela

1. Abra **Validade** como `admin` ou `encarregado`.
2. Clique no botão verde do WhatsApp no cabeçalho.
3. Confira o status da integração, os destinatários (mascarados) e a prévia.
4. Clique em **Enviar agora**.

### Pelo terminal (simulando o cron)

Use `dry=1` para conferir o que seria enviado **sem reservar o slot nem mandar
mensagem**:

```bash
curl -i "https://SEU-DOMINIO.vercel.app/api/manage-validade?dry=1&slot=manha" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Para enviar de verdade, remova o `dry=1`:

```bash
curl -i "https://SEU-DOMINIO.vercel.app/api/manage-validade?slot=manha" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Respostas comuns (o cron):

```json
{ "ok": true, "dryRun": true, "slot": "manha", "dia": "2026-11-10", "total": 7, "summary": "...", "list": "...", "lojas": [{ "loja": 103, "total": 7 }] }
```

```json
{ "ok": true, "slot": "manha", "dia": "2026-11-10", "total": 7, "enviados": 2, "falhas": 0, "lojas": [{ "loja": 103, "total": 7, "enviados": 2 }] }
```

```json
{ "ok": true, "skipped": "slot já enviado", "slot": "manha", "dia": "2026-11-10", "lojas": [{ "loja": 103, "skipped": "slot já enviado" }] }
```

```json
{ "ok": true, "skipped": "sem produtos vencendo", "slot": "tarde", "dia": "2026-11-10", "total": 0 }
```

## 6. Banco de dados

As tabelas são criadas automaticamente na primeira chamada (`ensureSchema`),
mas as migrações ficam versionadas em
`db/migrations/20261110090000_create_whatsapp_envios.sql` e
`db/migrations/20261111090000_add_loja.sql`:

```sql
CREATE TABLE public.whatsapp_envios (
  id BIGSERIAL PRIMARY KEY,
  slot VARCHAR(10) NOT NULL,        -- manha | tarde | manual
  dia DATE NOT NULL,                -- dia em America/Sao_Paulo
  total INTEGER NOT NULL DEFAULT 0,
  destinatarios INTEGER NOT NULL DEFAULT 0,
  enviados INTEGER NOT NULL DEFAULT 0,
  falhas INTEGER NOT NULL DEFAULT 0,
  erro TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  loja INTEGER NOT NULL DEFAULT 103 -- loja do alerta
);

-- Um envio automático por loja/slot/dia (o manual pode repetir).
CREATE UNIQUE INDEX idx_whatsapp_envios_loja_slot_dia
  ON public.whatsapp_envios (loja, slot, dia)
  WHERE slot <> 'manual';

-- Números que recebem o alerta de cada loja.
CREATE TABLE public.whatsapp_destinatarios (
  id BIGSERIAL PRIMARY KEY,
  loja INTEGER NOT NULL DEFAULT 103,
  telefone VARCHAR(20) NOT NULL,
  nome VARCHAR(60),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_destinatarios_loja_fkey
    FOREIGN KEY (loja) REFERENCES public.lojas(codigo) ON UPDATE CASCADE
);

CREATE UNIQUE INDEX idx_whatsapp_destinatarios_loja_telefone
  ON public.whatsapp_destinatarios (loja, telefone);
```

Para cadastrar os números de uma loja:

```sql
INSERT INTO public.whatsapp_destinatarios (loja, telefone, nome, ativo)
VALUES (92, '5511988888888', 'Encarregado Loja 92', TRUE)
ON CONFLICT (loja, telefone) DO UPDATE SET ativo = TRUE, nome = EXCLUDED.nome;
```

## 7. Problemas comuns

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `Integração do WhatsApp não configurada no servidor` (503) | Falta token, Phone Number ID ou destinatários | Confira as env vars e faça novo deploy. |
| `CRON_SECRET não configurado no servidor` (503) | O cron não tem como autenticar | Cadastre `CRON_SECRET` na Vercel. |
| `401 Não autorizado` no cron | O `Authorization` não bate com `CRON_SECRET` | Confira o valor e o deploy. |
| Erro `132000` / `number of parameters does not match` | O template tem quantidade/ordem de variáveis diferente de 2 | Ajuste o template para `{{1}}` (resumo) e `{{2}}` (lista). |
| Erro `131026` / `recipient is not a valid WhatsApp user` | Número sem WhatsApp ou fora da lista de teste | Use o formato `55DDDNÚMERO` e, no modo de teste, cadastre/confirme o número na Meta. |
| Erro `132001` / template não encontrado | Nome ou idioma diferente | Confira `WHATSAPP_TEMPLATE` e `WHATSAPP_TEMPLATE_LANG`. |
| Erro `190` / token inválido | Token expirado (o temporário dura 24h) | Gere um token permanente de System User. |
| Mensagem não chega | Template ainda em análise, número bloqueado ou opt-out | Veja o status no Gerenciador de modelos e os logs da função na Vercel. |

Os logs da função mostram uma linha por loja e por envio:

```text
[whatsapp] loja=103 manha 2026-11-10 total=7 enviados=2 falhas=0
```

## 8. Desligar a integração

Remova `WHATSAPP_TOKEN` ou `WHATSAPP_PHONE_NUMBER_ID` (e faça novo deploy).
O botão da tela passa a mostrar "Integração não configurada" e os crons
respondem 503 sem enviar nada. O restante do SGS-PRO continua igual.

Para **uma loja** parar de receber o alerta, desative o número dela:

```sql
UPDATE public.whatsapp_destinatarios SET ativo = FALSE WHERE loja = 92;
```

> Se a loja não tiver nenhum número **ativo**, ela volta a usar o fallback do
> servidor (`WHATSAPP_RECIPIENTS`). Para isso não acontecer, mantenha a env var
> vazia e cadastre os números por loja.
