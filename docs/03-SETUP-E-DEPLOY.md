# 03 — Setup e deploy

> Como rodar a loja na sua máquina, quais variáveis ela lê, como configurar Supabase, Google,
> Resend e Mercado Pago, como uma mudança chega em produção e o que fazer quando algo quebra.

Produção: **https://professoramarcia.ateliedaescola.com.br** (projeto Vercel `atelie-escolar`).
`ateliedaescola.com.br` e `www.ateliedaescola.com.br` redirecionam (308) para esse endereço
(`vercel.json`).

---

## 1. Rodar localmente

### 1.1 Pré-requisitos

- Node.js ≥ 20 e npm
- Acesso ao projeto Supabase (ou um projeto novo, ver §3)
- Credenciais **de teste** do Mercado Pago (ver §4)
- Chave do Resend (opcional em dev; sem ela o e-mail só não sai)
- (Opcional) ngrok, para receber o webhook do Mercado Pago em dev

### 1.2 Instalar e subir

```bash
npm install                 # sem flags: o conflito do react-helmet-async é resolvido por overrides
cp .env.example .env.local  # preencha; nunca commitar
npm run dev:all             # Vite (5173) + Express (3000)
```

> **Atenção: o ambiente local usa o mesmo Supabase de produção.** Não há banco de teste separado.
> Todo cadastro, pedido ou edição feito localmente grava dado real. Prefixe o que criar com
> `[TESTE]` e limpe ao terminar. Produto que já tem pedido não sai pela interface (FK de
> `order_items`): pause em vez de apagar.

Conferir que subiu:

1. http://localhost:5173 carrega a home.
2. http://localhost:3000/health devolve `{ "ok": true, "service": "api", "port": 3000 }`. Essa
   rota existe **só no Express local**; não use como smoke test de produção.

Em `localhost` o front chama a API direto em `http://localhost:3000/api` (`src/utils/api.js`); em
produção, `/api` no mesmo domínio.

### 1.3 Scripts do dia a dia

| Comando                   | O que faz                                                                     |
| ------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev:all`         | Vite + Express juntos (recomendado)                                           |
| `npm run dev` / `dev:api` | Só o Vite (5173) / só o Express (3000)                                        |
| `npm run build`           | Build de produção em `dist/`                                                  |
| `npm run preview`         | Serve o build                                                                 |
| `npm test`                | Vitest                                                                        |
| `npm run check`           | **O gate:** `check:env` → `format:check` → `lint` → `test` → coverage → build |
| `npm run format`          | Prettier no repositório                                                       |
| `npm run check:env`       | Valida as variáveis do ambiente (§2)                                          |
| `npm run icons:subset`    | Regera o subset da fonte de ícones (§1.5)                                     |

O pré-commit (Husky + lint-staged) roda ESLint e Prettier só nos arquivos em stage. A CI
(`test.yml`) roda os mesmos passos de `npm run check`, em qualquer branch, mais um
`npm audit --omit=dev` que não bloqueia. Convenções de código: [CONTRIBUTING.md](../CONTRIBUTING.md).

### 1.4 Scripts utilitários (`scripts/`)

| Script                               | Uso                                                                   | Precisa de                                                |
| ------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `node scripts/check-rls.js`          | O que a chave anon consegue ler em produção (só leitura)              | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (+ service role opc.) |
| `node scripts/check-schema-drift.js` | Migrations locais × banco remoto: funções, triggers, policies, grants | `supabase link` feito + Docker rodando                    |
| `node scripts/check-advisor.js`      | Lê o Security Advisor do Supabase                                     | `SUPABASE_PAT`, `SUPABASE_PROJECT_REF`                    |
| `node scripts/configure-auth.js`     | Acrescenta `APP_URL` às URLs de redirect do Supabase Auth (§3.4)      | `SUPABASE_PAT`, `SUPABASE_PROJECT_REF`, `APP_URL`         |
| `node scripts/db-inspect.js`         | Inventário de tabelas via REST                                        | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, service role         |
| `node scripts/check-utf8.js`         | Audita encoding de textos no banco                                    | `SUPABASE_PAT`, `SUPABASE_PROJECT_REF`                    |
| `node scripts/fix-utf8.js`           | Corrige encoding corrompido                                           | idem                                                      |
| `scripts/fix-dns.ps1` (admin)        | Conserta DNS do Windows quando `*.supabase.co` não resolve            | —                                                         |

### 1.5 Ícones

Os ícones são um subset do `bootstrap-icons`, versionado em `public/fonts/`. A lista de glifos é
`scripts/icons-usados.json`. Ao usar um ícone novo:

1. Acrescente o nome em `scripts/icons-usados.json`.
2. `npm run icons:subset` (regera `bootstrap-icons-subset.woff2` e `.css`).
3. Commite os três arquivos.

`scripts/__tests__/icon-subset.test.js` falha se o código usar um ícone fora da lista; sem isso o
`<i>` simplesmente fica em branco.

---

## 2. Variáveis de ambiente

Lista única, para dev e produção. `.env.example` tem todos os nomes com comentário;
`scripts/__tests__/deploy-config.test.js` falha se o código ler uma variável que não está lá.

**Onde ficam:**

- **Local:** `.env.local`. O `server.js` e o `check-env.js` carregam, nesta ordem (sem
  sobrescrever o que já veio): `.env.{ambiente}.local`, `.env.local` (pulado em `test`),
  `.env.{ambiente}`, `.env`. O ambiente é `APP_ENV`, senão `NODE_ENV`, senão `development`.
- **Produção:** Vercel → Settings → Environment Variables (vale para build e runtime). O
  `vercel.json` não tem bloco `env`.
- Prefixo `VITE_` vai para o bundle do navegador; o resto fica só no servidor. **Nunca** ponha a
  service role ou outro segredo numa variável `VITE_`.

Gere cada segredo aleatório com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2.1 Variáveis obrigatórias em produção

É a lista que `scripts/check-env.js` aplica. Na Vercel e no workflow de release o build roda
`npm run check:env && npm run build` (`vercel.json`), então **faltou variável obrigatória, o deploy
falha** em vez de quebrar no primeiro cliente. Em dev o script só avisa (use `--strict` ou
`CHECK_ENV_STRICT=1` para simular produção). Ele nunca imprime valores, só nomes.

| Variável                    | Exigida em         | Regra / para que serve                                                      |
| --------------------------- | ------------------ | --------------------------------------------------------------------------- |
| `SUPABASE_URL`              | preview e produção | `https://<ref>.supabase.co`                                                 |
| `SUPABASE_ANON_KEY`         | preview e produção | chave publishable/anon                                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | produção           | sem ela toda função responde "Supabase is not configured"                   |
| `VITE_SUPABASE_URL`         | preview e produção | igual a `SUPABASE_URL`; sem ela o front sobe sem login Google nem reset     |
| `VITE_SUPABASE_ANON_KEY`    | preview e produção | igual a `SUPABASE_ANON_KEY`                                                 |
| `ADMIN_SESSION_SECRET`      | preview e produção | ≥ 32 caracteres; assina o cookie do painel                                  |
| `CUSTOMER_SESSION_SECRET`   | preview e produção | ≥ 32 caracteres; assina o cookie da cliente                                 |
| `ADMIN_2FA_ENC_KEY`         | produção           | ≥ 32 caracteres; cifra o segredo TOTP. Trocar invalida o 2FA já cadastrado  |
| `WEBHOOK_SECRET`            | preview e produção | ≥ 16 caracteres; assinatura secreta do webhook do Mercado Pago (§4.2)       |
| `MERCADOPAGO_ACCESS_TOKEN`  | preview e produção | `APP_USR-…` em produção (`TEST-…` só gera aviso, não bloqueia)              |
| `APP_URL`                   | preview e produção | em produção: `https://`, sem localhost. Base de webhook, back_urls, e-mails |
| `CRON_SECRET`               | produção           | ≥ 16 caracteres; mesmo valor na Vercel e no GitHub (§5.3)                   |
| `SMTP_HOST`                 | produção           | `smtp.resend.com`                                                           |
| `SMTP_USER`                 | produção           | `resend`                                                                    |
| `SMTP_PASS`                 | produção           | API key do Resend (`re_…`)                                                  |
| `CORS_ORIGINS`              | produção           | origens do site separadas por vírgula; sem ela o Express não sobe           |

Também bloqueia: valor de exemplo (`seu_`, `your_`, `change-me`, `xxxxxxxx`…) e deploy de produção
da Vercel com `APP_ENV` diferente de `production`.

Variável marcada como **Sensitive** na Vercel chega ao `vercel pull` como o texto `[SENSITIVE]`. O
script avisa e segue, porque o valor real só existe em execução.

**`APP_URL` e `CORS_ORIGINS` juntos formam a allowlist de origem.** O CORS do Express usa
`CORS_ORIGINS`; a checagem anti-CSRF das escritas (`getAllowedOrigins` em `lib/http.js`) aceita
`APP_URL` **mais** `CORS_ORIGINS` (e `localhost:5173` só em dev/test). Para o painel funcionar
também pelo endereço `.vercel.app`, inclua-o em `CORS_ORIGINS`:

```env
APP_URL=https://professoramarcia.ateliedaescola.com.br
CORS_ORIGINS=https://professoramarcia.ateliedaescola.com.br,https://atelie-escolar.vercel.app
```

Em dev, deixe `CORS_ORIGINS` vazio: qualquer `localhost:<porta>` é aceito.

### 2.2 Recomendadas e opcionais de função

| Variável                     | Efeito                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `APP_ENV`                    | `development` · `test` · `preview` · `production`. Decide o fail-closed dos segredos          |
| `SMTP_FROM`                  | Remetente, num domínio verificado no Resend. Sem ela cai em `SMTP_USER`                       |
| `SMTP_PORT`                  | `465` para o Resend (TLS direto). Default do código: 587                                      |
| `VITE_GA4_ID`                | GA4 (`G-…`). Vazio não carrega o script                                                       |
| `VITE_META_PIXEL_ID`         | Meta Pixel. Vazio não carrega. Os dois só disparam depois do aceite no banner de cookies      |
| `SECURITY_ALERT_WEBHOOK_URL` | POST JSON em eventos de segurança (Slack, Discord…). Vazio: só log + tabela `security_events` |
| `GEMINI_API_KEY`             | IA do painel (estudo de vendas e textos de produto/página). Vazio: o painel funciona sem a IA |
| `GEMINI_MODEL`               | Modelo do Gemini. Default `gemini-2.5-flash`                                                  |
| `SUPABASE_STORAGE_BUCKET`    | Bucket **extra** aceito em `download_url`, além dos três fixos (§3.3). Normalmente fica vazio |

### 2.3 Ajustes finos (todos com default no código)

| Variável                           | Default                         | Onde                                   |
| ---------------------------------- | ------------------------------- | -------------------------------------- |
| `ABANDONED_CART_FIRST_HOURS`       | 1                               | `handlers/cron-email-jobs.js`          |
| `ABANDONED_CART_SECOND_HOURS`      | 24                              | idem                                   |
| `REACTIVATION_DAYS_MIN` / `_MAX`   | 90 / 180                        | idem                                   |
| `REACTIVATION_COUPON_CODE` / `PCT` | `VOLTEI15` / 15                 | idem (o cupom precisa existir)         |
| `EMAIL_SEND_CONCURRENCY`           | 5                               | idem                                   |
| `SMTP_MAX_CONNECTIONS`             | 3                               | `lib/email-sender.js`                  |
| `VIP_LTV_THRESHOLD`                | 300 (R$)                        | `lib/customer-segmentation.js`         |
| `LOG_LEVEL`                        | `info`                          | `lib/logger.js`                        |
| `SUPABASE_REQUEST_TIMEOUT_MS`      | 10000                           | `lib/supabase.js`                      |
| `BEST_SELLERS_WINDOW_MONTHS`       | 12                              | `lib/sales-counts.js`                  |
| `BEST_SELLERS_SCAN_LIMIT`          | 2000                            | idem                                   |
| `RATE_LIMIT_TIMEOUT_MS`            | 2500                            | `lib/rate-limit.js`                    |
| `RATE_LIMIT_ALERT_INTERVAL_MS`     | 60000                           | idem                                   |
| `RATE_LIMIT_MAX`                   | 250                             | só o limitador do Express local        |
| `WEBHOOK_TOLERANCE_SECONDS`        | 172800 (48 h; teto 7 dias)      | `lib/mercadopago-config.js`            |
| `WEBHOOK_FUTURE_SKEW_SECONDS`      | 120                             | idem                                   |
| `CUSTOMER_PASSWORD_SETUP_REDIRECT` | `APP_URL` + `/login?mode=login` | `lib/customer-account-provisioning.js` |

Os limites de cada rota (tentativas e janela) são fixos em `lib/rate-limit.js`; do ambiente só vêm
o timeout e o intervalo de alerta.

### 2.4 Só para dev ou ferramenta local

| Variável                  | Uso                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `VITE_ALLOW_ADMIN_BYPASS` | Bypass do login do painel. Só funciona com `import.meta.env.DEV`; inerte em build         |
| `CHECK_ENV_STRICT`        | `1` faz o `check:env` falhar como em produção                                             |
| `SUPABASE_PAT`            | Personal access token do Supabase, para os scripts da Management API (§1.4)               |
| `SUPABASE_PROJECT_REF`    | Ref do projeto, idem                                                                      |
| `INCLUDE_LOCALHOST`       | `1` faz o `configure-auth.js` liberar também redirects para `localhost` (§3.4)            |
| `SUPABASE_DB_URL`         | Connection string do Postgres para `psql`/`pg_dump`. Na release ela é um secret do GitHub |

### 2.5 Legadas (não lidas pelo código)

- `DOWNLOAD_TOKEN_SECRET`: os tokens de download são valores opacos conferidos em
  `download_tokens`, sem HMAC. Não cadastre; se existir, pode apagar.
- `MERCADOPAGO_PUBLIC_KEY`: o Checkout Pro funciona por redirect e só usa o access token.

---

## 3. Supabase, Google OAuth e e-mail

### 3.1 Projeto e schema (só para um banco novo)

O projeto de produção já existe. Para montar um do zero (região `sa-east-1`):

1. SQL Editor → rode `supabase/schema.sql`, depois `supabase/security-hardening.sql`. **Nessa
   ordem e antes das migrations**: elas assumem as tabelas base.
2. Migrations:
   ```bash
   npm run supabase:login
   npm run supabase:link -- --project-ref <ref>
   npm run supabase:db:push
   ```
3. (Opcional, nunca no banco de produção) `supabase/seed-sample-data.sql` para dados de exemplo.

Migration nova: `npm run supabase:migration:new -- <nome>`. Ela vai para produção no próximo push
na `main` (§5.1). Tabelas, migrations e validações: [04-BANCO-DE-DADOS.md](./04-BANCO-DE-DADOS.md).

Chaves: Dashboard → Project Settings → API Keys (publishable = anon; secret = service role).

### 3.2 Primeiro admin

1. Cadastre-se pelo `/login` (o trigger `handle_new_user` cria o profile como `CUSTOMER`).
2. Promova no SQL Editor:
   ```sql
   update public.profiles set role = 'ADMIN' where email = 'voce@exemplo.com';
   ```
3. Entre em `/admin`.

Papéis válidos: `CUSTOMER`, `SELLER` (professora), `ADMIN`, `MASTER`. O que cada um vê:
[06-PAINEIS.md](./06-PAINEIS.md).

Nunca insira usuário direto em `auth.users`: sem passar pelo signup ou pela Auth Admin API, campos
do GoTrue (ex.: `instance_id`) ficam nulos e o usuário é ignorado. Ver
[08-SEGURANCA.md](./08-SEGURANCA.md).

### 3.3 Storage

Três buckets, com nomes fixos no código:

| Bucket           | Visibilidade | Limite | Conteúdo                                 |
| ---------------- | ------------ | ------ | ---------------------------------------- |
| `product_images` | público      | 10 MB  | imagens de produto (SVG/HTML bloqueados) |
| `product_videos` | privado      | 50 MB  | vídeos de produto                        |
| `product_files`  | privado      | 50 MB  | arquivos entregues à cliente (PDF/ZIP)   |

O upload é feito pelo painel (`POST /api/admin/upload-url`). Em cada produto, `download_url` aceita
`product_files/<caminho>`, a URL completa do Storage ou uma URL externa (ex.: Google Drive, por
redirect). Para o Storage, a cliente sempre recebe URL assinada de 5 minutos.

### 3.4 Login com Google e URLs de redirect

**Google Cloud Console** → APIs & Services:

1. OAuth consent screen: externo, nome "Ateliê da Escola", domínio autorizado `supabase.co`.
2. Credentials → OAuth Client ID (Web application):
   - Authorized JavaScript origins: `https://professoramarcia.ateliedaescola.com.br`,
     `https://<ref>.supabase.co` (e `http://localhost:5173` para testar local).
   - Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Providers → Google: cole Client ID e Secret.

**Redirects do Supabase Auth.** O app volta do Google para três lugares
(`src/services/supabase-browser.js`):

- `/login?oauth=google&redirect=…` (cliente)
- `/admin?oauth=staff` (login de staff, professora e admin)
- a página de redefinição de senha

Todos estão sob o domínio da loja, então basta `site_url = APP_URL` e `APP_URL/**` na allow list
(o `**` cobre `/admin` e a query string). O script faz isso **sem apagar** o que já existe:

```bash
SUPABASE_PAT=... SUPABASE_PROJECT_REF=... \
APP_URL=https://professoramarcia.ateliedaescola.com.br node scripts/configure-auth.js
```

A lista de produção tem só o domínio da loja. Para testar OAuth local, rode com
`INCLUDE_LOCALHOST=1` (acrescenta `localhost:5173–5176` e `3000`) e lembre que isso vale para o
Supabase de produção. Pelo Dashboard: Authentication → URL Configuration.

### 3.5 E-mail: Resend e SMTP do Supabase Auth

O app manda e-mail pelo Resend via SMTP (variáveis `SMTP_*`, §2.1). O Supabase Auth (reset de senha,
confirmação de cadastro) precisa do **mesmo SMTP configurado nele**: o SMTP padrão do Supabase só
entrega para membros da organização.

1. Resend: crie a conta, gere a API key e verifique o domínio em
   [resend.com/domains](https://resend.com/domains) (SPF, DKIM, DMARC). Sem domínio verificado, o
   Resend só entrega para o e-mail dono da conta; use `onboarding@resend.dev` como remetente
   enquanto isso.
2. Supabase → Project Settings → Authentication → SMTP Settings → Enable custom SMTP:
   host `smtp.resend.com`, porta `465`, usuário `resend`, senha = API key, remetente no domínio
   verificado, nome "Ateliê da Escola".

Se configurar pela Management API (`PATCH /v1/projects/<ref>/config/auth`) no Windows, mande o JSON
com escape ASCII (ex.: Python com `json.dumps(..., ensure_ascii=True)`): `curl` pelo Git Bash pode
converter `ê`/`ã` para cp1252 e o Supabase grava `�`.

Não use Gmail: limite de ~500/dia, remetente forçado e sem DKIM próprio.

---

## 4. Mercado Pago

Painel: [mercadopago.com.br/developers/panel/app](https://www.mercadopago.com.br/developers/panel/app)
→ sua aplicação → Credenciais. Só o **access token** é usado.

### 4.1 Sandbox (dev)

- `MERCADOPAGO_ACCESS_TOKEN=TEST-…` (credenciais do **vendedor de teste**).
- Para pagar, entre no checkout do MP com a conta do **comprador de teste**. Pagar como convidado
  com cartão de teste falha.
- Cartões de teste: Visa `4235 6477 2802 5682`, Mastercard `5480 8328 0103 3311`, Amex
  `3753 651535 56885`. CPF `12345678909`, CVV `123` (Amex `1234`), validade futura.
- O nome do titular decide o resultado: `APRO` aprova, `CONT` fica pendente, `OTHE` recusa,
  `FUND` saldo insuficiente, `SECU` CVV inválido, `EXPI` vencido.

**Webhook e retorno em dev.** `APP_URL=http://localhost:3000` serve a API, mas o MP não alcança
localhost e as `back_urls` caem nessa porta, que não serve o front (404). O pedido aprova mesmo
assim: o polling do checkout e a página `/downloads` reconciliam via `verify-payment`. Para receber
o webhook de verdade:

```bash
ngrok http 3000
# APP_URL=https://<id>.ngrok.io no .env.local e reinicie o dev:all
```

### 4.2 Produção

1. Credenciais de produção → `APP_USR-…` em `MERCADOPAGO_ACCESS_TOKEN` na Vercel.
2. Notificações → Webhooks, modo produção:
   - URL: `https://professoramarcia.ateliedaescola.com.br/api/webhook`
   - Evento: Pagamentos
   - Copie a assinatura secreta para `WEBHOOK_SECRET` (Vercel).
3. Teste com "Simular notificação" no painel do MP e confira o 200 nos logs da Vercel.

Cada preferência já leva `notification_url = APP_URL/api/webhook` (`lib/mercadopago-config.js`):
trocou de domínio, troque `APP_URL` e a URL do webhook no painel.

---

## 5. Deploy e release

### 5.1 Como uma mudança chega em produção

| Peça             | Onde                                          | Como atualiza                             |
| ---------------- | --------------------------------------------- | ----------------------------------------- |
| Front (estático) | Vercel                                        | push na `main` → `release-production.yml` |
| API              | Vercel, uma função (`api/index.js`, 60 s)     | idem                                      |
| Banco            | Supabase                                      | idem (`supabase db push` antes do deploy) |
| Arquivos         | Supabase Storage                              | upload pelo painel                        |
| Cron de e-mail   | GitHub Actions (`email-cron.yml`)             | de hora em hora                           |
| CI               | GitHub Actions (`test.yml`, `lighthouse.yml`) | todo push / PR                            |

Todo push na `main` (ou disparo manual) roda `.github/workflows/release-production.yml`, um por vez
(`concurrency: production-release`):

1. **validate** — `npm ci` + `npm run check`.
2. **migrate_and_deploy** (environment `production`):
   - `supabase db push --db-url "$SUPABASE_DB_URL"` pelo session pooler (o runner do GitHub não tem
     IPv6). **Migration nova vai para produção no mesmo push**: revise o SQL antes do merge.
   - `vercel pull --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod`.

A integração direta GitHub → Vercel está desligada: o deploy só sai depois da migration. A
`/api/*` é reescrita para `api/index?__path=…` no `vercel.json`, que também define os headers de
segurança (CSP, HSTS) e o `no-store` de `/admin`.

### 5.2 Configuração no GitHub

| Nome                         | Tipo     | Usado por                                                     |
| ---------------------------- | -------- | ------------------------------------------------------------- |
| `RELEASE_AUTOMATION_ENABLED` | variable | precisa ser `true`, senão o job de migrate/deploy é pulado    |
| `VERCEL_ORG_ID`              | variable | release                                                       |
| `VERCEL_PROJECT_ID`          | variable | release                                                       |
| `VERCEL_TOKEN`               | secret   | release                                                       |
| `SUPABASE_DB_URL`            | secret   | release (URL do session pooler)                               |
| `APP_URL`                    | secret   | email-cron (`https://professoramarcia.ateliedaescola.com.br`) |
| `CRON_SECRET`                | secret   | email-cron (mesmo valor da Vercel)                            |
| `LHCI_GITHUB_APP_TOKEN`      | secret   | opcional; só publica o status do Lighthouse no PR             |

No environment `production` do GitHub dá para exigir aprovação manual antes de cada migration e
deploy (reviewers).

### 5.3 Cron de e-mail

`email-cron.yml` faz `POST $APP_URL/api/cron-email-jobs` com o header `X-Cron-Secret` a cada hora
(`0 * * * *`, UTC) e falha se a resposta não for 200. Cada execução trata carrinho abandonado
(1 h e 24 h), a sequência pós-compra (D+3, D+15, D+45) e a reativação (90–180 dias). É idempotente
(`email_sent_log`): rodar de novo não duplica envio. Disparo manual: Actions → Email cron → Run
workflow.

### 5.4 Antes de dar push na main

- `npm run check` verde localmente.
- Migration nova revisada e aditiva (o código antigo precisa continuar funcionando com ela, por
  causa do rollback, §6.4).
- Variável nova cadastrada na Vercel **antes** do push, se for obrigatória (senão o build falha).
- Lighthouse (`lighthouserc.json`, preset desktop sobre o build): performance ≥ 0,7,
  acessibilidade ≥ 0,9, SEO ≥ 0,9.

### 5.5 Domínio

Vercel → Settings → Domains. Ao trocar o domínio principal: DNS e SSL na Vercel, depois `APP_URL` e
`CORS_ORIGINS` na Vercel, o secret `APP_URL` no GitHub, `configure-auth.js` (§3.4), URL do webhook
no MP (§4.2), origens no Google Cloud e os redirects 308 do `vercel.json`.

---

## 6. Operação

### 6.1 Smoke test depois do deploy

`/health` não existe na Vercel; use `GET /api/products` (200 com JSON).

**Loja**

- Home, `/produtos` e uma página de produto carregam; `/sitemap.xml` e `/robots.txt` respondem.
- Adicionar ao carrinho abre a gaveta sem trocar de página.
- Cupom inválido mostra erro legível; válido aplica na hora.
- Checkout abre o Mercado Pago. Num release que mexe em pagamento, faça uma compra real de valor
  baixo e confira: aprovação pelo polling e pelo webhook, e-mail de confirmação, `/downloads` com o
  link funcionando.

**Conta e painel**

- Cadastro, login (senha errada → 401 legível), "esqueci minha senha" com o e-mail chegando, login
  com Google.
- `/admin`: login com 2FA, login com Google de staff, abas carregam, salvar um produto persiste.
- A 6ª tentativa de login no painel em 10 minutos responde 429.

**Webhook**

- Assinatura válida → 200; inválida → 401 e linha em `security_events`; o mesmo pagamento duas
  vezes não duplica `download_tokens`.

Lista detalhada de telas e comportamentos: [05-FLUXOS.md](./05-FLUXOS.md).

### 6.2 Troubleshooting

Logs da API: Vercel → Logs, função `api/index`, filtrando pelo caminho (`/api/webhook`,
`/api/create-payment`…).

| Sintoma                                               | Causa provável e ação                                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy falha no build listando variáveis              | `check:env` barrou. Cadastre na Vercel para o ambiente certo e rode de novo; não desligue o gate                                                                                                      |
| Job de migrate/deploy aparece "skipped"               | `RELEASE_AUTOMATION_ENABLED` não é `true` no GitHub                                                                                                                                                   |
| Checkout não cria a preferência                       | Logs de `/api/create-payment`. Token `TEST-` em produção, item com preço inválido ou falha ao gravar `orders`                                                                                         |
| Webhook falhando no histórico do MP                   | 401: `WEBHOOK_SECRET` diferente do painel. 404: URL errada. 500: ver logs de `/api/webhook`                                                                                                           |
| Cliente pagou e `/downloads` está vazio               | Painel → Pedidos: conferir `payment_status` e `download_tokens`. Se o MP diz pago e o banco não, `POST /api/verify-payment` com `{ orderId, email }` reconcilia. Link direto: `/downloads?order=<id>` |
| E-mail não chega                                      | Resend → Activity (bounce, SPF/DKIM). Domínio verificado? `SMTP_FROM` nele? Cota do plano? Logs de `/api/send-confirmation-email`                                                                     |
| Reset de senha não chega                              | SMTP custom no Supabase Auth (§3.5) e redirect na allow list (§3.4)                                                                                                                                   |
| Login Google volta com erro de redirect               | `APP_URL/**` falta na allow list do Supabase (`configure-auth.js`)                                                                                                                                    |
| Escrita do painel responde 403 "Origem não permitida" | Painel aberto por um host fora de `APP_URL` + `CORS_ORIGINS` (ex.: `.vercel.app`). Acrescente em `CORS_ORIGINS`                                                                                       |
| `ADMIN_SESSION_INVALID` no painel                     | Sessão expirou (8 h) ou `ADMIN_SESSION_SECRET` mudou. Entrar de novo                                                                                                                                  |
| 2FA para de abrir                                     | `ADMIN_2FA_ENC_KEY` foi trocada: recadastrar o segundo fator                                                                                                                                          |
| IA do painel diz "não configurada"                    | `GEMINI_API_KEY` ausente no ambiente                                                                                                                                                                  |
| Cron de e-mail falhando                               | 401: `CRON_SECRET` diferente entre GitHub e Vercel. 500: logs de `/api/cron-email-jobs`                                                                                                               |
| 429 para usuárias reais / pico de tráfego             | `security_events` e Vercel Analytics para ver origem; bloquear IP no Firewall da Vercel; se suspeitar de vazamento, rotacionar (§6.5)                                                                 |
| Banco lento                                           | Supabase → Database → Query performance; faltando índice, migration nova. A Curva ABC recalcula a cada abertura (sem cache)                                                                           |
| Lighthouse abaixo do piso                             | Imagem grande no topo, chunk acima de 600 kB (`npm run build` lista), CLS por falta de `aspect-ratio`                                                                                                 |
| Local: `*.supabase.co` não resolve                    | DNS do provedor. Troque para `1.1.1.1`/`8.8.8.8` ou rode `scripts/fix-dns.ps1` como administrador                                                                                                     |
| Local: Vite não sobe                                  | `strictPort` na 5173: outro processo usa a porta (`netstat -ano \| findstr 5173`, `taskkill /F /PID <pid>`)                                                                                           |

### 6.3 Monitoramento

- **Logs:** Vercel (função `api/index`), Supabase (Logs), GitHub Actions (release e cron).
- **Painel → Dashboard:** pedidos pendentes há mais de 24 h, aprovação de pagamentos, eventos de
  segurança novos.
- **Alertas:** `SECURITY_ALERT_WEBHOOK_URL` (se configurada); sem ela, eventos ficam no log e em
  `security_events`.
- **Externos:** Resend (bounces, reclamações), Mercado Pago (pagamentos e histórico de
  webhooks), GA4 e Meta Events Manager quando os IDs estiverem ativos, Vercel Analytics.
- **Segurança do banco:** `node scripts/check-advisor.js` e `node scripts/check-rls.js` de tempos em
  tempos.

### 6.4 Rollback

1. Vercel → Deployments → versão estável → Promote to Production.
2. Banco não volta sozinho: desfazer uma migration é outra migration, escrita à mão.

Por isso migrations devem ser **aditivas**: código antigo com coluna nova funciona; código antigo
sem a coluna que ele espera, não. Um rollback promovido na Vercel é sobrescrito no próximo push na
`main`; corrija na `main` em seguida.

### 6.5 Desastre

**Vazamento de segredo**

1. Rotacione o que vazou (service role no Supabase, token e assinatura no MP, segredos de sessão,
   `CRON_SECRET`) e atualize Vercel, GitHub e `.env.local`.
2. Redeploy (Actions → Release production → Run workflow).
3. Trocar `ADMIN_SESSION_SECRET`/`CUSTOMER_SESSION_SECRET` derruba todas as sessões; trocar
   `ADMIN_2FA_ENC_KEY` exige recadastrar o 2FA.
4. Audite `security_events` e os logs. Se houve exposição de dados pessoais, avalie a comunicação
   exigida pela LGPD ([08-SEGURANCA.md](./08-SEGURANCA.md)).

**Banco corrompido ou dado apagado**

- Plano Pro: backups diários e restore pelo painel (point-in-time é add-on). No Free não conte com
  restore pelo painel: mantenha um `pg_dump` periódico feito com `SUPABASE_DB_URL`.
- Depois do restore, confira `auth.users.instance_id` não nulo.

**Supabase ou Vercel fora**

- A loja depende dos dois; não há fallback automático. Acompanhe
  [status.supabase.com](https://status.supabase.com) e
  [vercel-status.com](https://www.vercel-status.com) e avise as clientes pelas redes.

### 6.6 Limites dos planos gratuitos

| Serviço  | Limite que mais pesa                                                   |
| -------- | ---------------------------------------------------------------------- |
| Resend   | 100 e-mails/dia, ~3.000/mês                                            |
| Supabase | 500 MB de banco, 1 GB de Storage; sem restore de backup pelo painel    |
| Vercel   | Hobby: logs de função por pouco tempo; função até 60 s (`vercel.json`) |
