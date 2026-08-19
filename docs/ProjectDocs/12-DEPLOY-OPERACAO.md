# 12 — Deploy & operação

> Como colocar no ar (Vercel), checklist de release, smoke test, troubleshooting de produção, monitoramento.

---

## Stack de deploy

| Componente               | Onde                          | Como atualiza                                   |
| ------------------------ | ----------------------------- | ----------------------------------------------- |
| Frontend                 | Vercel (static)               | `git push` → build automático                   |
| API                      | Vercel (serverless functions) | idem, cada `api/**/*.js` vira função            |
| Banco                    | Supabase (managed)            | `supabase db push` ou Dashboard                 |
| Storage (arquivos)       | Supabase Storage              | Upload manual ou via API                        |
| Cron de e-mails          | GitHub Actions                | `.github/workflows/email-cron.yml`              |
| CI (testes + Lighthouse) | GitHub Actions                | `.github/workflows/test.yml` + `lighthouse.yml` |
| DNS                      | Provedor do domínio           | manual                                          |
| E-mail                   | Resend                        | gerenciado, sem deploy                          |

---

## 1. Configuração no Vercel

### 1.1 Conectar repositório

1. [vercel.com](https://vercel.com) → New Project → Import do GitHub
2. Selecionar repo `Atelie-escolar`
3. Framework Preset: `Other` (Vercel detecta `vercel.json`)
4. Build Command: `npm run build` (default)
5. Output Directory: `dist`
6. Install Command: `npm install`

### 1.2 Variáveis de ambiente

Settings → Environment Variables. Adicionar **todas** as do `.env.local`, exceto as VITE_ que precisam estar com prefixo certo. Por ambiente:

| Variável                    | Production                                                    | Preview                         | Development             |
| --------------------------- | ------------------------------------------------------------- | ------------------------------- | ----------------------- |
| `SUPABASE_URL`              | ✅                                                            | ✅                              | ✅                      |
| `SUPABASE_ANON_KEY`         | ✅                                                            | ✅                              | ✅                      |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅                                                            | ❌ (não em Preview)             | ❌                      |
| `SUPABASE_STORAGE_BUCKET`   | `product-files`                                               | idem                            | idem                    |
| `MERCADOPAGO_ACCESS_TOKEN`  | `APP_USR-*`                                                   | `TEST-*`                        | `TEST-*`                |
| `MERCADOPAGO_PUBLIC_KEY`    | `APP_USR-*`                                                   | `TEST-*`                        | `TEST-*`                |
| `WEBHOOK_SECRET`            | ✅                                                            | ✅                              | ✅                      |
| `ADMIN_SESSION_SECRET`      | ✅ (gerar novo)                                               | ✅                              | ✅                      |
| `CUSTOMER_SESSION_SECRET`   | ✅ (gerar novo)                                               | ✅                              | ✅                      |
| `DOWNLOAD_TOKEN_SECRET`     | ✅                                                            | ✅                              | ✅                      |
| `CRON_SECRET`               | ✅                                                            | ✅                              | ✅                      |
| `APP_URL`                   | `https://<dominio-final>.com.br`                              | URL do preview                  | `http://localhost:3000` |
| `APP_ENV`                   | `production`                                                  | `preview`                       | `development`           |
| `NODE_ENV`                  | `production`                                                  | `production`                    | `development`           |
| `CORS_ORIGINS`              | `https://<dominio-final>.com.br,https://www.<dominio>.com.br` | URL do preview                  | (vazio)                 |
| `SMTP_HOST`                 | `smtp.resend.com`                                             | idem                            | idem                    |
| `SMTP_PORT`                 | `465`                                                         | idem                            | idem                    |
| `SMTP_USER`                 | `resend`                                                      | idem                            | idem                    |
| `SMTP_PASS`                 | `re_*` (Resend API key)                                       | idem                            | idem                    |
| `SMTP_FROM`                 | `Ateliê da Escola <pedidos@dominio.com.br>`                   | idem ou `onboarding@resend.dev` | sandbox                 |
| `VITE_SUPABASE_URL`         | ✅                                                            | ✅                              | ✅                      |
| `VITE_SUPABASE_ANON_KEY`    | ✅                                                            | ✅                              | ✅                      |
| `VITE_GA4_ID`               | `G-XXXXXXXXXX`                                                | (vazio)                         | (vazio)                 |
| `VITE_META_PIXEL_ID`        | `123…`                                                        | (vazio)                         | (vazio)                 |

> ⚠️ **`SERVICE_ROLE_KEY` em Preview deve ser DIFERENTE** (idealmente um projeto Supabase separado de staging). Vazamento em Preview compromete prod.

> O bloco `env` do `vercel.json` mapeia as principais variáveis para secrets do Vercel (`@supabase_url`, `@mercadopago_access_token`, `@app_url` etc.).

Opcionais (defaults no código): `SECURITY_ALERT_WEBHOOK_URL`, `ABANDONED_CART_FIRST_HOURS` (1), `ABANDONED_CART_SECOND_HOURS` (24), `REACTIVATION_DAYS_MIN`/`MAX` (90/180), `REACTIVATION_COUPON_CODE`/`PCT` (`VOLTEI15`/15), `VIP_LTV_THRESHOLD` (300), `RATE_LIMIT_MAX` (250) — esta última só vale no limitador de borda do Express local; a política real (`enforceRateLimit`) não usa variável de ambiente, os perfis estão em `lib/rate-limit.js`.

### 1.3 Domínio customizado

1. Settings → Domains → Add → digite domínio
2. Configurar DNS conforme instruções (A record ou CNAME)
3. Aguardar SSL Vercel auto-provision
4. Atualizar `APP_URL` para o domínio final
5. Atualizar `CORS_ORIGINS`
6. Atualizar `notification_url` no painel do Mercado Pago

---

## 2. Configuração no Mercado Pago

### 2.1 Credenciais de produção

1. https://www.mercadopago.com.br/developers/panel/app
2. Sua aplicação → Credenciais → **Credenciais de produção**
3. Copie `Access Token` (`APP_USR-...`) e `Public Key`
4. Cole no Vercel em Production env vars

### 2.2 Webhook

1. Painel da app → Notificações → Webhooks
2. URL: `https://<dominio-final>.com.br/api/webhook`
3. Selecione evento: `Pagamentos`
4. Copie `Secret signature` → cole em `WEBHOOK_SECRET` (Vercel + `.env.local`)
5. Modo: **Produção** (deixar **Teste** desligado quando for ao ar)

### 2.3 Testar webhook em produção

- Painel MP → Webhooks → Simular evento
- Verificar no Vercel: Function Logs → procurar entrada de `/api/webhook`
- Resposta deve ser 200 OK

---

## 3. Configuração no Supabase (produção)

### 3.1 Plano

- **Free** → suficiente para começar (500MB DB, 50k MAU, 1GB Storage)
- **Pro** ($25/mês) → quando precisar de backup 30d + `pg_cron` automático + HIBP password check

### 3.2 SMTP custom

Configurar Resend conforme [03-SETUP §5](./03-SETUP.md). Em produção, **obrigatório domínio autenticado** (SPF/DKIM/DMARC).

### 3.3 Allow list de URLs

```bash
# Após dominio final em produção
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' \
  node scripts/configure-auth.js
# Edite o script para incluir o domínio prod
```

Ou via Dashboard → Authentication → URL Configuration → Site URL + Redirect URLs.

---

## 4. Cron de e-mail (GitHub Actions)

Arquivo: `.github/workflows/email-cron.yml` — faz `POST $APP_URL/api/cron-email-jobs` com header `X-Cron-Secret` e falha se o status ≠ 200. Cada execução processa: carrinho abandonado (1h e 24h), sequência pós-compra (D+3/D+15/D+45) e reativação 90–180 dias. Idempotente via `email_sent_log` — rodar de novo não duplica envios. A função serverless declara `maxDuration: 60`.

### Setup

1. Settings → Secrets and variables → Actions → New repository secret
2. Adicione:
   - `APP_URL=https://profamarciarcardoso.com.br` (domínio de produção)
   - `CRON_SECRET=<o-mesmo-que-no-Vercel>`
3. Após primeiro deploy: Actions → "Email cron" → Run workflow → validar status 200

### Frequência

Padrão: a cada hora em ponto, UTC (`0 * * * *`). Ajustar conforme volume.

---

## 5. Release checklist

Antes de toda release maior (não toda commit; reservar para releases significativas):

### 5.1 Ambiente

- [ ] `APP_ENV=production` no Vercel
- [ ] `NODE_ENV=production`
- [ ] `APP_URL` é HTTPS com domínio final
- [ ] `CORS_ORIGINS` lista exatamente os domínios prod
- [ ] Todos os secrets em produção foram gerados (não cópias do `.env.example`)
- [ ] `MERCADOPAGO_ACCESS_TOKEN` é `APP_USR-*` (não `TEST-*`)

### 5.2 Banco

- [ ] Migrations aplicadas (validações em [04-BANCO-DE-DADOS §validação](./04-BANCO-DE-DADOS.md))
- [ ] Tabelas críticas íntegras (`products`, `orders`, `order_items`, `download_tokens`, `settings`)
- [ ] Categorias e produtos ativos
- [ ] Índices principais aplicados
- [ ] Pelo menos 1 admin com `role='ADMIN'` em `profiles`
- [ ] Backup recente (Supabase Pro: automático; Free: manual via `pg_dump`)

### 5.3 Segurança

- [ ] Security Advisor: 0 CRITICAL
- [ ] 2FA habilitado para conta admin principal (regra I2)
- [ ] Webhook MP configurado com URL pública HTTPS
- [ ] Domínio verificado no Resend (SPF + DKIM + DMARC)
- [ ] `smtp_admin_email` e `SMTP_FROM` apontam para domínio verificado
- [ ] `auth.users.instance_id` não-NULL em todos os usuários
- [ ] Logs de retenção rodando (verificar `cron.job` ativo se Supabase Pro)
- [ ] Plano HIBP avaliado (Supabase Pro feature)

### 5.4 Build e testes

- [ ] `npm run check` (test + build) passou localmente
- [ ] Build sem warnings críticos
- [ ] Lighthouse CI: Performance ≥ 80, Acessibilidade ≥ 90, SEO ≥ 90 (asserts do `lighthouserc.json`, preset desktop sobre o build estático)
- [ ] CI verde no GitHub

### 5.5 Smoke test pós-deploy

- [ ] Home carrega
- [ ] `/produtos` lista produtos
- [ ] Página de produto carrega com galeria + FAQ + reviews
- [ ] Adicionar ao carrinho funciona
- [ ] Checkout cria preferência MP e abre Checkout Pro
- [ ] **Pagamento real com valor pequeno** (R$ 1) → conferir polling + webhook + download
- [ ] E-mail de confirmação chega na caixa
- [ ] `/downloads` lista arquivos com link funcionando
- [ ] `GET /api/products` retorna 200 com JSON (`/health` é rota só do Express local — não existe na Vercel)
- [ ] Login admin funciona
- [ ] Painel admin renderiza todas as 14 abas
- [ ] Logout admin funciona
- [ ] Submeter sitemap no Search Console (apenas no primeiro deploy)

### 5.6 Operação

- [ ] Registrar release no histórico (data, responsável, resultado, hash do commit)
- [ ] Confirmar cron rodando (GitHub Actions)
- [ ] Verificar primeiro webhook real chegando após smoke test
- [ ] Cleanup de Preview deployments antigos (se acumulou)

---

## 6. Smoke test (mais detalhado)

### 6.1 Cliente público

```
✓ GET https://<dominio>/ → 200, hero + vitrine renderizam
✓ GET https://<dominio>/produtos → 200, lista + filtros
✓ GET https://<dominio>/produtos/<slug> → 200, detalhes + FAQ + reviews
✓ Schema.org passa em Rich Results Test
✓ /sitemap.xml retorna XML válido
✓ /robots.txt aponta para o sitemap
```

### 6.2 Carrinho e checkout

```
✓ Click "Adicionar ao carrinho" abre drawer sem navegar (regra B3)
✓ /checkout mostra resumo, email, nome, cupom
✓ Cupom inválido mostra erro humano (regra B6)
✓ Cupom válido aplica desconto na hora
✓ POST /api/create-payment retorna initPoint
✓ Mercado Pago abre em nova aba
✓ Cartão APRO aprova e webhook chega + polling pega
✓ Cartão OTHE rejeita com toast humano
✓ Redirect para /downloads com lista de arquivos
✓ Download funciona (arquivo baixa)
✓ download_logs registrado no DB
✓ E-mail de confirmação chega
```

### 6.3 Auth

```
✓ Cadastro com senha fraca falha com mensagem específica
✓ Cadastro com senha forte cria conta + cookie
✓ Login com credenciais erradas: 401 humano
✓ Login com credenciais certas: cookie + redirect
✓ Esqueci minha senha → e-mail chega → reset funciona
✓ Login com Google: cookie criado, /checkout carrega
```

### 6.4 Admin

```
✓ /painel-acesso-privado-atelie carrega
✓ Login admin com 2FA funciona
✓ 5 tentativas falhas em 10min retorna 429 (vale em produção — contador no Postgres)
✓ Sessão de 8h ainda vale
✓ Todas as 14 abas renderizam
✓ Criar produto via wizard funciona
✓ Editar produto persiste
✓ Atualizar pedido via modal funciona
✓ Export CSV de pedidos gera arquivo válido
```

### 6.5 Webhook

```
✓ POST /api/webhook com assinatura válida → 200
✓ POST com assinatura inválida → 401 + security_events
✓ Mesmo paymentId enviado 2x não duplica download_tokens (idempotência)
```

---

## 7. Troubleshooting de produção

### 7.1 Checkout não cria preferência MP

**Sintomas:** botão "Pagar agora" mostra erro genérico.

**Diagnóstico:**

1. Vercel → Functions → `/api/create-payment` → ver logs
2. Procurar erro de MP SDK
3. Causas comuns:
   - `MERCADOPAGO_ACCESS_TOKEN` ainda é `TEST-*` em prod → trocar para `APP_USR-*`
   - Item com `price` 0 ou negativo → validar Zod no backend
   - Falha na criação de `orders` (RLS, banco fora) → conferir Supabase status

### 7.2 Webhook não chega

**Sintomas:** polling do cliente cobre, mas em logs do MP webhook está falhando.

**Diagnóstico:**

1. Painel MP → Webhooks → Histórico de notificações
2. Se 401 repetido: `WEBHOOK_SECRET` desincronizado
3. Se 500: ver Vercel Function Logs do `/api/webhook`
4. Se 404: URL de webhook errada no painel MP

### 7.3 E-mails não chegam

**Sintomas:** cliente não recebe confirmação ou reset.

**Diagnóstico:**

1. Checar Resend Dashboard → Activity → ver falha (rejeição por SPF/DKIM, bounce, etc.)
2. Domínio autenticado? Sem isso, só entrega para o e-mail dono da conta Resend (sandbox)
3. Cota Resend Free (3.000/mês) atingida?
4. `SMTP_FROM` aponta para domínio verificado?
5. Vercel Function Logs do `/api/send-confirmation-email`

### 7.4 Cliente reporta cobrança sem download

**Sintomas:** cliente pagou mas `/downloads` vazio.

**Diagnóstico:**

1. Admin → Pedidos → buscar por email/order_code
2. Conferir `payment_status` e existência de `download_tokens`
3. Se MP mostra pago mas DB ainda `pending`: webhook perdido. Forçar via `GET /api/verify-payment?orderId=X&email=Y`
4. Se DB OK mas cliente diz que não viu links: enviar link direto `/downloads?order=X`

### 7.5 Lighthouse caiu abaixo do limiar do CI (< 80 performance)

**Diagnóstico:**

1. PR CI mostra qual métrica caiu
2. Causas comuns:
   - Imagem nova grande no hero → comprimir + lazy
   - Chunk novo acima do aviso de 600 kB (`chunkSizeWarningLimit`) → analisar `dist/`, `npm run build` mostra chunks
   - Fonte externa bloqueando render → auto-host
   - CLS por componente sem `aspect-ratio` → adicionar

### 7.6 Banco lento / timeout

**Sintomas:** queries demoram, dashboard admin não carrega.

**Diagnóstico:**

1. Supabase Dashboard → Database → Insights → ver queries lentas
2. Adicionar índice se uma coluna está em WHERE/JOIN sem índice
3. Para análise complexa (Curva ABC), o cache 1h já existe — verificar se está populado

### 7.7 Tráfego anômalo (possível ataque)

**Sintomas:** spike de requests, rate-limit 429 disparando para usuários reais.

**Diagnóstico:**

1. Vercel Analytics → ver origem do tráfego
2. `security_events` → padrões de IP
3. Mitigação:
   - Bloquear IPs específicos via Vercel Firewall ou Cloudflare
   - Aumentar rate-limit temporariamente
   - Verificar se há vazamento de secret (rotacionar se suspeitar)

### 7.8 Cron de e-mails parou

**Sintomas:** abandoned cart não envia, reativação não acontece.

**Diagnóstico:**

1. GitHub → Actions → email-cron → último run
2. Se 401: `CRON_SECRET` desincronizado entre GitHub e Vercel
3. Se 500: ver função `/api/cron-email-jobs` no Vercel
4. Manual: `gh workflow run email-cron.yml`

---

## 8. Monitoramento

### Logs

- **Vercel Function Logs** → real-time + histórico 24h (Hobby) ou 7d (Pro)
- **Supabase Logs** → real-time + 7d (Free) ou 90d (Pro)
- **GitHub Actions Logs** → histórico ilimitado

### Métricas

- **Vercel Analytics** (Hobby Free) — page views básicas
- **GA4** — comportamento + funil
- **Meta Events Manager** — Pixel diagnostics
- **Supabase Dashboard** — DB usage, MAU, storage

### Alertas

- **`SECURITY_ALERT_WEBHOOK_URL`** (env opcional) — POST para Slack/Discord/Sentry em eventos de segurança; sem ela, eventos vão só para o log do console (`console.warn`, capturado pelos Function Logs) + tabela `security_events`
- **Resend Dashboard** — bounces e complaints
- **Mercado Pago Dashboard** — eventos de pagamento

### O que monitorar diariamente (admin → Dashboard)

- Pedidos `pending` há > 24h
- Taxa de aprovação MP
- Bounces Resend
- Eventos de segurança novos
- Lighthouse caindo (CI alerta no PR)

---

## 9. Rollback

Vercel mantém histórico de deploys. Para reverter:

1. Vercel → Deployments → escolher versão estável
2. ... menu → Promote to Production
3. Banco: se mudou schema, aplicar migration reversa (manualmente — não há rollback automático)

**Cuidado:** rollback de código sem rollback de banco pode quebrar se o código antigo não conhece a coluna nova. Manter migrations **aditivas** sempre que possível.

---

## 10. Disaster recovery

### Cenário: banco corrompido

1. Supabase Pro → restore PITR para timestamp antes do incidente
2. Free: restore último backup (até 7 dias)
3. Verificar `auth.users.instance_id` pós-restore (§2.7 em [08-SEGURANCA](./08-SEGURANCA.md))

### Cenário: vazamento de secret

1. **Imediatamente:** rotacionar TODOS os secrets (`SERVICE_ROLE`, MP, session, webhook)
2. Atualizar Vercel + `.env.local` + painel MP + Supabase Dashboard
3. Redeploy
4. Auditar `security_events` e logs por uso suspeito do segredo
5. Notificar usuários se dados pessoais expostos (LGPD)

### Cenário: Supabase fora

- App fica 500 (single point of failure por design)
- Status page: [status.supabase.com](https://status.supabase.com)
- Comunicar usuários via redes sociais
- Migração para outra infra: planejada, não emergencial

### Cenário: Vercel fora

- Status page: [vercel-status.com](https://www.vercel-status.com)
- Fallback: redeploy em Netlify/Cloudflare Pages é trabalhoso mas viável (build estático + serverless)

---

## 11. Custos previstos em escala

| Volume mensal                | Vercel        | Supabase      | Resend        | Total                         |
| ---------------------------- | ------------- | ------------- | ------------- | ----------------------------- |
| < 10k visitas, < 100 pedidos | Hobby (0)     | Free (0)      | Free (0)      | **R$ 0**                      |
| 50k visitas, 500 pedidos     | Hobby (0)     | Pro (~R$ 125) | Free (0)      | **~R$ 125**                   |
| 100k visitas, 1k pedidos     | Pro (~R$ 100) | Pro (~R$ 125) | Pro (~R$ 100) | **~R$ 325**                   |
| 500k visitas, 5k pedidos     | Pro (~R$ 100) | Pro (~R$ 125) | Pro (~R$ 100) | **~R$ 325** + bandwidth extra |

(USD ≈ R$ 5 para conversão estimada)

Adicionar mídia paga (Fase 5): +R$ 5.000/mês mínimo.
