# Setup detalhado

## Variáveis de ambiente

Arquivo principal: `.env.local` (não comitar; templates em `.env.example` e `.env.local.template`).

### Supabase

```env
SUPABASE_URL=https://<seu-ref>.supabase.co
SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxx   # ⚠️ NUNCA expor publicamente
SUPABASE_STORAGE_BUCKET=public                    # opcional, padrão "public"

VITE_SUPABASE_URL=<igual ao SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<igual ao SUPABASE_ANON_KEY>
```

**Como pegar**:
- Dashboard → Project Settings → API Keys
- URL: aba "Project URL" ou Project ID
- ANON_KEY: aba "Publishable key" (formato novo) ou "anon public" (legado)
- SERVICE_ROLE_KEY: aba "Secret keys" → clique no olho 👁

### Mercado Pago

```env
# Para desenvolvimento — use credenciais de TESTE
MERCADOPAGO_ACCESS_TOKEN=TEST-xxxx-xxxx-xxxx
MERCADOPAGO_PUBLIC_KEY=TEST-xxxx-xxxx-xxxx

# Produção (descomentar quando for ao ar)
# MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxx
# MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxx
```

**Como pegar**:
- https://www.mercadopago.com.br/developers/panel/app
- Selecione (ou crie) sua aplicação
- Menu lateral → **Credenciais** → aba **Credenciais de teste**

### Segurança (gerados aleatoriamente)

```env
# Cookies HttpOnly — gere com `openssl rand -hex 32` ou `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
ADMIN_SESSION_SECRET=<64 chars hex>
CUSTOMER_SESSION_SECRET=<64 chars hex>

# Webhook Mercado Pago — você define no painel do MP e copia
WEBHOOK_SECRET=<copie do dashboard MP>

# Tokens de download (válidos por algumas horas)
DOWNLOAD_TOKEN_SECRET=<64 chars hex>
```

### Servidor + URLs

```env
APP_URL=http://localhost:5173                     # base URL pública (frontend)
APP_ENV=development                                # development | test | production
NODE_ENV=development

# CORS — em prod, lista explícita; em dev, deixa vazio para permitir qualquer localhost
CORS_ORIGINS=                                     # ex prod: https://atelie.com.br,https://www.atelie.com.br

# Rate limits
RATE_LIMIT_MAX=250
AUTH_RATE_LIMIT_MAX=30
```

### E-mail (Resend) — obrigatório para reset de senha e confirmação de compra

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxxxxxx          # API key do Resend
SMTP_FROM="Ateliê da Escola <onboarding@resend.dev>"   # ou pedidos@seudominio.com.br se já verificou
```

**Por que Resend e não Gmail?** O Gmail SMTP funciona até ~500/dia mas o `From:` precisa ser o próprio Gmail — pouco profissional. Resend tem 3.000 emails/mês grátis, `From:` próprio, e setup nativo no Supabase Dashboard.

**Como pegar a API key:**
1. Conta em [resend.com](https://resend.com)
2. Onboarding gera uma key automática (`re_...`)
3. Pra produção: [resend.com/domains](https://resend.com/domains) → adicionar SPF, DKIM, DMARC no DNS

**Importante:** o `.env.local` cobre só os emails transacionais do app ([api/send-confirmation-email.js](../api/send-confirmation-email.js)). Os emails do Supabase Auth (reset de senha, signup confirm) são configurados **separadamente** via dashboard — veja seção "Configurando SMTP no Supabase Auth" abaixo.

---

## Configurando SMTP no Supabase Auth

Necessário para que reset de senha e confirmação de cadastro enviem email. Sem isso, o Supabase usa o SMTP grátis dele que **só entrega para members da org** (não para clientes reais).

### Opção A — Via dashboard (manual)

1. Dashboard → **Project Settings** → **Authentication** → **SMTP Settings**
2. Habilite **"Enable custom SMTP"**
3. Preencha:
   - Host: `smtp.resend.com`
   - Port: `465`
   - User: `resend`
   - Pass: sua API key Resend (`re_...`)
   - Admin email: `onboarding@resend.dev` (sandbox) ou `pedidos@seudominio.com.br`
   - Sender name: `Ateliê da Escola`
4. Save

### Opção B — Via Management API (script)

```powershell
# Requer SUPABASE_PAT e RESEND_API_KEY no ambiente
python -c "
import urllib.request, json, os
PAT = os.environ['SUPABASE_PAT']
REF = os.environ['SUPABASE_PROJECT_REF']
KEY = os.environ['RESEND_API_KEY']
body = json.dumps({
    'smtp_host': 'smtp.resend.com',
    'smtp_port': '465',
    'smtp_user': 'resend',
    'smtp_pass': KEY,
    'smtp_admin_email': 'onboarding@resend.dev',
    'smtp_sender_name': 'Ateliê da Escola',
    'rate_limit_email_sent': 30
}, ensure_ascii=True).encode('ascii')
req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{REF}/config/auth',
    data=body, method='PATCH',
    headers={'Authorization': f'Bearer {PAT}', 'Content-Type': 'application/json', 'User-Agent': 'curl/8.0'})
print(urllib.request.urlopen(req).read().decode()[:200])
"
```

**⚠️ Encoding no Windows:** ao enviar JSON com caracteres não-ASCII (`ê`, `ã`) via Git Bash + curl, os bytes UTF-8 podem ser convertidos pra cp1252 e o Supabase armazena replacement char (`�`). Use Python com `ensure_ascii=True` (que gera `ê`) — funciona em qualquer shell.

### Limites do Resend

| Plano | Limite | Custo |
|-------|--------|-------|
| Free | 100 emails/dia (~3.000/mês) | R$ 0 |
| Pro | 50.000/mês | US$ 20/mês |

Pra dev/produção pequena, free é suficiente.

---

## Configurando Google OAuth

### 1. No Google Cloud Console

1. Acesse https://console.cloud.google.com/apis/credentials
2. Crie um projeto (ou selecione um existente)
3. **APIs & Services** → **OAuth consent screen**:
   - Tipo: Externo
   - Nome do app: Ateliê da Escola
   - E-mail de suporte: seu e-mail
   - Domínios: `supabase.co` (importante!)
4. **Credentials** → **Create Credentials** → **OAuth Client ID**:
   - Tipo: Web application
   - Authorized JavaScript origins:
     ```
     http://localhost:5173
     https://<seu-ref>.supabase.co
     https://<seu-domínio-prod>.com
     ```
   - Authorized redirect URIs:
     ```
     https://<seu-ref>.supabase.co/auth/v1/callback
     ```
5. Copie o **Client ID** e **Client Secret**.

### 2. No Supabase

1. Dashboard → **Authentication** → **Providers**
2. Localize **Google** → clique para expandir
3. Habilite o toggle
4. Cole Client ID e Client Secret
5. Salvar

### 3. Verificar URLs permitidas

Rode (PAT necessário):

```bash
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/configure-auth.js
```

Isso adiciona `http://localhost:5173`, `5174`, `5175`, `5176` e `3000` ao `uri_allow_list`.

---

## Banco de dados (Supabase)

### Setup inicial em projeto novo

1. **Schema base** — Dashboard → SQL Editor → cole `supabase/schema.sql` e rode
2. **Segurança** — cole `supabase/security-hardening.sql` (RLS + policies + funções)
3. **Dados de exemplo** (opcional) — cole `supabase/seed-sample-data.sql`

Ou via Management API com PAT:

```bash
# Verificar Security Advisor
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/check-advisor.js

# Atualizar config de auth (URLs permitidas)
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/configure-auth.js
```

### Criar usuário admin

O fluxo padrão é:
1. Usuário se cadastra normalmente via `/login` → trigger `handle_new_user` cria profile com `role='customer'`
2. Promover via SQL no dashboard:
   ```sql
   update public.profiles set role = 'ADMIN' where email = 'voce@example.com';
   ```
3. Logar em `/painel-acesso-privado-atelie` (URL obscurecida) — também acessível pelo link "· admin ·" no rodapé do `/login`

**Atalho via Management API** (cria usuário direto, sem precisar passar pelo signup):

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"SenhaForte123!","email_confirm":true}'

# Depois promover:
# update public.profiles set role='ADMIN' where email='admin@example.com';
```

**⚠️ Cuidado:** se você inserir direto em `auth.users` via `INSERT` SQL (em vez de Admin API), o `instance_id` vai ficar NULL e o usuário será invisível pro GoTrue. Veja `docs/SECURITY.md` seção 4c.

---

### Plano gratuito vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| HIBP password check | ❌ | ✅ |
| Auto-pause após 7 dias inativo | ✅ | ❌ |
| Backup automático | 7 dias | 30 dias |
| Storage | 1 GB | 100 GB |

Sem HIBP, a proteção é via regra de senha: mín 8 chars com letra maiúscula, minúscula e número (já configurado).

---

## Testar pagamento (sandbox MP)

Veja [E2E-CHECKLIST-SANDBOX.md](./E2E-CHECKLIST-SANDBOX.md).

### Cartões de teste

| Bandeira | Número |
|----------|--------|
| Visa | `4509 9535 6623 3704` |
| Mastercard | `5031 4332 1540 6351` |
| Amex | `3711 803032 57522` |

| Titular | Resultado |
|---------|-----------|
| `APRO` | ✅ Aprovado |
| `OTHE` | ❌ Recusado |
| `CONT` | ⏳ Pendente |
| `FUND` | ❌ Saldo insuficiente |
| `SECU` | ❌ CVV inválido |
| `EXPI` | ❌ Cartão vencido |

CPF: `12345678909` · CVV: `123` · Validade: qualquer data futura.

---

## Problemas comuns

### DNS local não resolve `*.supabase.co`

Algumas ISPs filtram Cloudflare. Solução:

**Opção A (recomendado)**: trocar DNS do Windows para `1.1.1.1` e `8.8.8.8`.

**Opção B**: rodar `scripts/fix-dns.ps1` como administrador (faz A automaticamente; se falhar, adiciona no `hosts`).

### Vite sobe em porta diferente de 5173

`vite.config.js` está com `strictPort: true` — se 5173 estiver ocupado, **falha em vez de subir em outra porta**. Mate o processo zumbi:

```powershell
netstat -ano | findstr 5173
taskkill /F /PID <pid>
```

### CORS bloqueia chamada da API

- Em dev: qualquer `localhost:*` é liberado (configurado em `server.js`)
- Em prod: adicione sua origem em `CORS_ORIGINS=https://seu-dominio.com`

### Webhook Mercado Pago não chega

Em dev, o MP precisa de URL pública HTTPS. Solução:

```bash
# Instalar ngrok
choco install ngrok

# Criar túnel
ngrok http 3000

# No .env.local
APP_URL=https://abc123.ngrok.io
```

Reinicie `npm run dev:all`. O `notification_url` passado ao MP agora é a URL do ngrok.

---

## Deploy (Vercel)

Configurado em `vercel.json`:
- Frontend: build em `dist/`, servido como estático
- API: cada arquivo em `api/*.js` vira função serverless
- Routes: `/api/*` → função; resto → SPA fallback

### Variáveis no Vercel

Dashboard do projeto → Settings → Environment Variables. Adicione **todas** as do `.env.local` (exceto VITE_ que precisam estar com prefixo certo).

**Importante**:
- `SUPABASE_SERVICE_ROLE_KEY` em "Production" apenas (não Preview)
- `MERCADOPAGO_ACCESS_TOKEN` de PROD apenas em "Production"
- `CORS_ORIGINS=https://<seu-dominio-vercel>.vercel.app` em todas
- `APP_URL=https://<seu-dominio-final>.com.br` em Production
