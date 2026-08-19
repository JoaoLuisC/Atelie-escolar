# 03 — Setup

> Tudo necessário para rodar o projeto localmente e configurar serviços externos (Supabase, Mercado Pago, Google OAuth, Resend).

---

## Pré-requisitos

- **Node.js ≥ 20**
- **npm** (vem com Node)
- **Conta Supabase** (Free é suficiente)
- **Conta Mercado Pago** (use credenciais de TESTE em dev)
- **Conta Resend** (Free dá 3.000 emails/mês)
- (Opcional) **Conta Google Cloud** para Google OAuth
- (Opcional) **ngrok** para receber webhook do MP em dev

---

## 1. Clone e instalação

```bash
git clone <repo>
cd Atelie-escolar
npm install
```

> O repo versiona um `.npmrc` com `legacy-peer-deps=true` (React 19 vs peer deps do `react-helmet-async`) — o `npm install` funciona sem flags extras.

---

## 2. Variáveis de ambiente

Crie `.env.local` a partir do template (não commitar nunca):

```bash
cp .env.example .env.local
```

A cascata de carregamento usada pelo `server.js`:

1. `.env.{NODE_ENV}.local` (ex: `.env.development.local`)
2. `.env.local`
3. `.env.{NODE_ENV}` (ex: `.env.development`)
4. `.env`

Variáveis com prefixo `VITE_` são expostas ao bundle do frontend pelo Vite. Variáveis sem prefixo ficam só no servidor.

### 2.1 Supabase

```env
SUPABASE_URL=https://<seu-ref>.supabase.co
SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxx    # ⚠️ NUNCA expor no front
SUPABASE_DB_URL=postgresql://postgres:...           # connection string direta (só tooling; app não usa)
SUPABASE_STORAGE_BUCKET=product-files               # presente no template; os buckets reais são fixos no código (ver §3.5)

# Idem expostas ao browser (devem espelhar; NÃO estão no .env.example — acrescente à mão)
VITE_SUPABASE_URL=<igual ao SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<igual ao SUPABASE_ANON_KEY>
```

**Onde obter:**

- Dashboard → Project Settings → API Keys
- `URL`: aba "Project URL" ou Project ID
- `ANON_KEY`: aba "Publishable key" (formato novo) ou "anon public" (legado)
- `SERVICE_ROLE_KEY`: aba "Secret keys" → clique no olho 👁

### 2.2 Mercado Pago

```env
# Desenvolvimento — use credenciais de TESTE
MERCADOPAGO_ACCESS_TOKEN=TEST-xxxx-xxxx-xxxx
MERCADOPAGO_PUBLIC_KEY=TEST-xxxx-xxxx-xxxx

# Produção
# MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxx
# MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxx
```

**Onde obter:**

- https://www.mercadopago.com.br/developers/panel/app
- Selecione (ou crie) sua aplicação
- Menu lateral → **Credenciais** → aba **Credenciais de teste**

### 2.3 Secrets de cookie e tokens (gerar aleatoriamente)

```env
# Gerar cada um com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_SESSION_SECRET=<64 chars hex>
CUSTOMER_SESSION_SECRET=<64 chars hex>
DOWNLOAD_TOKEN_SECRET=<64 chars hex>

# Você cria no painel do Mercado Pago e copia (assinatura secreta do webhook)
WEBHOOK_SECRET=<copie do dashboard MP>

# GitHub Actions cron — o MESMO valor precisa estar na Vercel (env) e no GitHub (Secrets → Actions)
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET=<64 chars hex>
```

### 2.4 Servidor + URLs + CORS

```env
APP_URL=http://localhost:3000                     # base usada em webhook MP, back_urls e links de e-mail; em prod: URL pública https do site
APP_ENV=development                                # development | test | production
NODE_ENV=development

# CORS — em prod, lista explícita; em dev, deixa vazio para permitir qualquer localhost
CORS_ORIGINS=                                      # ex prod: https://atelie.com.br,https://www.atelie.com.br

# Rate limits (defaults conservadores)
RATE_LIMIT_MAX=250
```

### 2.5 E-mail (Resend) — obrigatório para reset de senha e confirmação de compra

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxxxxxx          # API key Resend
SMTP_FROM="Ateliê da Escola <onboarding@resend.dev>"   # ou pedidos@seudominio.com.br se já verificou
```

> **Por que Resend e não Gmail?** Gmail funciona até ~500/dia mas o `From:` precisa ser o próprio Gmail. Resend tem 3.000 e-mails/mês grátis, `From:` próprio e integração nativa no Supabase Dashboard.

**Como obter a API key:**

1. Conta em [resend.com](https://resend.com)
2. O onboarding gera uma key automática (`re_...`)
3. Em produção: [resend.com/domains](https://resend.com/domains) → adicionar SPF, DKIM, DMARC no DNS

### 2.6 Analytics e tracking (opcional em dev, obrigatório em prod)

```env
VITE_GA4_ID=G-XXXXXXXXXX
VITE_META_PIXEL_ID=1234567890123456
```

Sem esses IDs, os scripts simplesmente não inicializam. Banner de consentimento LGPD bloqueia o disparo até o usuário aceitar.

### 2.7 Alertas de segurança (opcional)

```env
# POST JSON com eventos de segurança (admin_login_failed, webhook_invalid_signature, etc)
SECURITY_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
```

Vazio = não envia. Os eventos seguem sendo gravados em `security_events` e `stdout`.

### 2.8 Tuning do cron de e-mail marketing (opcional — defaults no código)

```env
ABANDONED_CART_FIRST_HOURS=1      # janela do 1º lembrete de carrinho abandonado
ABANDONED_CART_SECOND_HOURS=24    # janela do 2º lembrete
REACTIVATION_DAYS_MIN=90          # mínimo de dias de inatividade p/ e-mail de reativação
REACTIVATION_DAYS_MAX=180         # máximo de dias p/ reativação
VIP_LTV_THRESHOLD=300             # limiar de LTV (R$) p/ marcar cliente VIP na segmentação
```

Usadas por `api/cron-email-jobs.js` e `lib/customer-segmentation.js`.

---

## 3. Banco de dados (Supabase)

### 3.1 Criar projeto

1. Crie projeto em [supabase.com](https://supabase.com) (Free é suficiente para começar)
2. Anote `Project URL`, `anon key` e `service role key`
3. Region recomendada: `sa-east-1` (São Paulo) para latência menor

### 3.2 Aplicar schema (uma das opções)

**Opção A — Manual via SQL Editor:**

1. Dashboard → SQL Editor → cole `supabase/schema.sql` → Run
2. Cole `supabase/security-hardening.sql` → Run (RLS + policies + funções)
3. (Opcional) Cole `supabase/seed-sample-data.sql` para popular dados de exemplo

**Opção B — Via Supabase CLI:**

```bash
npm run supabase:login
npm run supabase:link -- --project-ref <seu-ref>
npm run supabase:db:push           # aplica todas as migrations em ordem
```

### 3.3 Aplicar migrations pendentes

```bash
npm run supabase:db:push     # aplica as 18 migrations em ordem
```

A lista, com o que cada uma faz e as queries de validação, está em
[04-BANCO-DE-DADOS §migrations](./04-BANCO-DE-DADOS.md). As migrations **não substituem** o
`schema.sql`: elas assumem as tabelas base já criadas (a primeira faz `alter table public.orders`).

### 3.4 Criar usuário admin

**Fluxo padrão:**

1. Cadastre-se normalmente via `/login` (trigger `handle_new_user` cria profile com `role='CUSTOMER'`)
2. Promova via SQL no Dashboard:
   ```sql
   update public.profiles set role = 'ADMIN' where email = 'voce@example.com';
   ```
3. Acesse `/painel-acesso-privado-atelie` (`/admin-login` redireciona para lá)

**Atalho via Auth Admin API** (cria direto sem signup; usa a service-role key, não o PAT):

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"SenhaForte123!","email_confirm":true}'
```

> ⚠️ **Nunca insira direto em `auth.users` via SQL.** Sem passar pelo signup ou pela Admin API, campos gerenciados pelo GoTrue (ex: `instance_id`) ficam NULL e o usuário é ignorado. Ver [08-SEGURANCA §4c](./08-SEGURANCA.md).

### 3.5 Storage para uploads e downloads

O upload do painel admin (`POST /api/admin/upload-url`, usado pelo wizard de produto) usa 3 buckets com nomes **fixos no código**:

| Bucket           | Visibilidade | Limite | Conteúdo                                 |
| ---------------- | ------------ | ------ | ---------------------------------------- |
| `product_images` | Público      | 10 MB  | Imagens de produto (SVG/HTML bloqueados) |
| `product_videos` | Privado      | 50 MB  | Vídeos de produto                        |
| `product_files`  | Privado      | 50 MB  | Arquivos entregues ao cliente (PDF/ZIP)  |

1. Dashboard → Storage → New bucket → crie os 3 acima (marque **Public bucket** só em `product_images`)
2. Faça upload das mídias e arquivos pelo próprio painel admin (wizard de produto) — ou manualmente pelo Dashboard
3. Em cada produto, `download_url` aceita `product_files/<path>` (formato curto), URL completa do Storage ou URL externa (ex: Google Drive — redirect direto, sem signed URL)

Para arquivos no Storage, a URL real entregue ao cliente é sempre signed e expira em 5 min (ver [08-SEGURANCA §8](./08-SEGURANCA.md)).

---

## 4. Google OAuth (opcional)

### 4.1 Google Cloud Console

1. Acesse https://console.cloud.google.com/apis/credentials
2. Crie um projeto (ou selecione existente)
3. **APIs & Services** → **OAuth consent screen**:
   - Tipo: Externo
   - Nome do app: Ateliê da Escola
   - Domínios: `supabase.co` (importante!)
4. **Credentials** → **Create Credentials** → **OAuth Client ID**:
   - Tipo: Web application
   - Authorized JavaScript origins:
     ```
     http://localhost:5173
     https://<seu-ref>.supabase.co
     https://<seu-dominio-prod>.com.br
     ```
   - Authorized redirect URIs:
     ```
     https://<seu-ref>.supabase.co/auth/v1/callback
     ```
5. Copie **Client ID** e **Client Secret**

### 4.2 No Supabase

1. Dashboard → **Authentication** → **Providers**
2. Localize **Google** → expanda
3. Habilite o toggle
4. Cole Client ID e Client Secret → Save

### 4.3 Atualizar `uri_allow_list`

Necessita PAT (Personal Access Token Supabase). Script automatizado:

```bash
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/configure-auth.js
```

Define `site_url` (`http://localhost:5173`) e adiciona `http://localhost:5173`, `5174`, `5175`, `5176`, `3000` ao allow list.

---

## 5. SMTP no Supabase Auth (para reset de senha + signup confirm)

Sem isso, Supabase usa SMTP grátis que **só entrega para members da org** (não para clientes reais).

### Opção A — Via Dashboard

1. Dashboard → **Project Settings** → **Authentication** → **SMTP Settings**
2. Habilite **Enable custom SMTP**
3. Preencha:
   - Host: `smtp.resend.com`
   - Port: `465`
   - User: `resend`
   - Pass: sua API key Resend (`re_...`)
   - Admin email: `onboarding@resend.dev` (sandbox) ou `pedidos@seudominio.com.br`
   - Sender name: `Ateliê da Escola`
4. Save

### Opção B — Via Management API

```python
# Requer SUPABASE_PAT, SUPABASE_PROJECT_REF e RESEND_API_KEY no ambiente
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
    headers={'Authorization': f'Bearer {PAT}', 'Content-Type': 'application/json'})
print(urllib.request.urlopen(req).read().decode()[:200])
"
```

> ⚠️ **Encoding no Windows:** ao enviar JSON com caracteres não-ASCII (`ê`, `ã`) via Git Bash + curl, os bytes UTF-8 podem ser convertidos pra cp1252 e o Supabase armazena replacement char (`�`). Use Python com `ensure_ascii=True` — funciona em qualquer shell.

### Limites Resend

| Plano | Limite                      | Custo      |
| ----- | --------------------------- | ---------- |
| Free  | ~3.000 emails/mês (100/dia) | R$ 0       |
| Pro   | 50.000/mês                  | US$ 20/mês |

---

## 6. Rodar localmente

### Comandos

```bash
npm run dev              # só Vite (5173)
npm run dev:api          # só Express (3000)
npm run dev:all          # ambos com concurrently (recomendado)
npm run build            # produção
npm run preview          # preview do build
npm run test             # vitest run
npm run check            # test + build (usado em CI)
```

### Verificar tudo funcionando

1. `npm run dev:all`
2. Abra http://localhost:5173 → deve carregar a home
3. Abra http://localhost:3000/health → deve retornar `{ "ok": true, "service": "api", "port": 3000 }`
4. Cadastre-se em `/login`
5. Adicione um produto ao carrinho → vá ao checkout → use cartão de teste MP (ver §7)
6. Confirme polling de pagamento e tela de downloads carregando

---

## 7. Testar pagamento (sandbox MP)

### Cartões de teste

| Bandeira   | Número                |
| ---------- | --------------------- |
| Visa       | `4235 6477 2802 5682` |
| Mastercard | `5480 8328 0103 3311` |
| Amex       | `3753 651535 56885`   |

### Titular do cartão controla o resultado

| Titular | Resultado             |
| ------- | --------------------- |
| `APRO`  | ✅ Aprovado           |
| `OTHE`  | ❌ Recusado           |
| `CONT`  | ⏳ Pendente           |
| `FUND`  | ❌ Saldo insuficiente |
| `SECU`  | ❌ CVV inválido       |
| `EXPI`  | ❌ Cartão vencido     |

CPF: `12345678909` · CVV: `123` (Amex: `1234`) · Validade: qualquer data futura.

Checklist E2E em [12-DEPLOY-OPERACAO §smoke-test](./12-DEPLOY-OPERACAO.md).

---

## 8. Webhook Mercado Pago em dev (precisa ngrok)

Webhook real exige URL pública HTTPS.

```bash
# 1. Instalar ngrok
choco install ngrok           # Windows
brew install ngrok            # macOS

# 2. Criar túnel para a API local
ngrok http 3000

# 3. Pegue a URL pública (ex: https://abc123.ngrok.io)
# 4. No .env.local
APP_URL=https://abc123.ngrok.io

# 5. Reinicie npm run dev:all
```

Sem ngrok, o polling de pagamento cobre o gap. Webhook nunca chega, mas a UX continua funcionando.

---

## 9. Scripts utilitários

| Script                             | Uso                                                     | Variáveis necessárias                                            |
| ---------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `node scripts/check-advisor.js`    | Lê Security Advisor do Supabase                         | `SUPABASE_PAT`, `SUPABASE_PROJECT_REF`                           |
| `node scripts/configure-auth.js`   | Atualiza URLs OAuth permitidas                          | `SUPABASE_PAT`, `SUPABASE_PROJECT_REF`                           |
| `node scripts/db-inspect.js`       | Inventário de tabelas via REST                          | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `node scripts/check-utf8.js`       | Audita encoding de textos no banco (Management API)     | `SUPABASE_PAT`, `SUPABASE_PROJECT_REF`                           |
| `node scripts/fix-utf8.js`         | Corrige encoding corrompido                             | idem                                                             |
| `pwsh scripts/fix-dns.ps1` (admin) | Conserta DNS Windows quando `*.supabase.co` não resolve | —                                                                |

---

## 10. Problemas comuns

### DNS local não resolve `*.supabase.co`

Algumas ISPs filtram Cloudflare.

**Opção A (recomendado):** trocar DNS do Windows para `1.1.1.1` e `8.8.8.8`.

**Opção B:** rodar `scripts/fix-dns.ps1` como administrador (faz A automaticamente; se falhar, adiciona no `hosts`).

### Vite sobe em porta diferente de 5173

`vite.config.js` tem `strictPort: true` — se 5173 estiver ocupada, **falha em vez de subir em outra porta**. Mate o processo zumbi:

```powershell
netstat -ano | findstr 5173
taskkill /F /PID <pid>
```

### CORS bloqueia chamada da API

- **Em dev**: qualquer `localhost:*` é liberado (configurado em `server.js`)
- **Em prod**: adicione sua origem em `CORS_ORIGINS=https://seu-dominio.com.br`

### `Authentication required` ao chamar `/api/admin/*`

- Cookie `admin_session` ausente ou inválido
- Sessão expirada (TTL 8h)
- `ADMIN_SESSION_SECRET` mudou entre boot e request — reset session refazendo login

### `Webhook signature invalid` no MP

- `WEBHOOK_SECRET` no `.env.local` precisa bater com o configurado no painel do Mercado Pago
- Em dev sem ngrok, o webhook não chega — não é erro, é esperado

### Limite de e-mails do Resend Free

- 100 e-mails/dia (~3.000/mês)
- Em sandbox (domínio não autenticado), só entrega para o e-mail dono da conta Resend
- Em prod: autenticar domínio (SPF/DKIM/DMARC) → [resend.com/domains](https://resend.com/domains)

---

## 11. Próximos passos

- Configurar GA4 ID + Meta Pixel ID em `.env.local` (e Vercel)
- Submeter sitemap no Search Console pós-deploy
- Autenticar domínio no Resend (DKIM + SPF + DMARC) para liberar e-mail marketing
- Criar uma imagem OG dedicada (1200×630) — hoje o `SEO.jsx` usa `/favicon.svg` como imagem default

Lista completa de itens operacionais pendentes: [13-ROADMAP-PENDENCIAS](./13-ROADMAP-PENDENCIAS.md).
