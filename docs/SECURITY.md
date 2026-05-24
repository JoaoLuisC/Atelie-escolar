# Segurança

## Modelo de ameaça

| Ator | Acesso esperado | Como bloqueamos |
|------|-----------------|-----------------|
| Visitante anônimo | Catálogo público, criar pedido | RLS public read em categories/products active=true |
| Cliente logado | Próprios pedidos, downloads dos próprios produtos | RLS por `auth.uid()` em orders, user_products |
| Admin | Tudo via painel /admin | Cookie admin_session + service_role no backend |
| Atacante com anon key | NADA além do catálogo público | RLS bloqueia; sem policies = sem acesso |

---

## Camadas de defesa

### 1. Network / Headers
- `helmet()` — CSP estrita explícita (script-src whitelist GA4/Meta/MP), HSTS, X-Frame-Options DENY, X-Content-Type-Options
- `cors()` — allowlist explícita em prod; permissivo em dev (apenas `localhost:*`)
- `rate-limit` global — 250 req/15min global; 30 req/15min em `/auth/*`
- `rate-limit` em `/admin-login` — **5 tentativas falhas / 10 min** (definido em [routes/api-compat.routes.js](../routes/api-compat.routes.js); `skipSuccessfulRequests: true` para não punir admin legítimo fazendo logins repetidos)
- `rate-limit` em `/auth/customer/login` — 5 tentativas / 10 min
- `rate-limit` em `/verify-payment` — 60 req/min por IP (mitiga enumeração de `order_code`)
- HTTPS obrigatório em produção: o boot em [server.js](../server.js) falha se `APP_URL` não começar com `https://` quando `APP_ENV=production`. Cookies `Secure` dependem disso.

### 2. Autenticação
- **Cookies HttpOnly** — `customer_session` e `admin_session`. JavaScript não acessa.
- **SameSite=Strict** no cookie de cliente (CSRF mitigation).
- **HMAC-SHA256** com secrets de 32 bytes (rotacionáveis).
- **TTL de 8h** em ambos cookies.
- **Senhas** — mín 8 chars, exigem letra maiúscula + minúscula + dígito.
- **2FA opcional para admin** (TOTP + PIN de recuperação).

### 3. Autorização (RLS no Postgres)

10 tabelas, todas com RLS. Resumo:

| Tabela | Quem lê | Quem escreve |
|--------|---------|--------------|
| categories | anon+auth (active=true) | service_role |
| products | anon+auth (active=true) | service_role |
| orders | auth (próprios) | service_role |
| order_items | auth (via parent order) | service_role |
| profiles | auth (próprio) | auth (só `display_name` do próprio) + service_role |
| user_products | auth (próprios) | service_role |
| download_tokens | — | service_role |
| download_logs | — | service_role |
| security_events | — | service_role |
| settings | — | service_role |
| page_views | — | anon+auth (path não nulo) |

**Princípio**: service role bypassa RLS, então o **backend pode tudo**. Browser usando anon key fica restrito ao que está nas policies.

### 4. Funções com `SECURITY DEFINER`

```sql
-- handle_new_user e set_updated_at têm search_path fixo
alter function public.set_updated_at()  set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;

-- Não podem ser executadas diretamente pela API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

### 4b. Privilege escalation bloqueado em `profiles`

RLS sozinho não impede um cliente autenticado de fazer `UPDATE profiles SET role='ADMIN' WHERE id=auth.uid()` — a policy `profiles_own_update` libera a linha, mas não as colunas. Para fechar isso, usamos grants de coluna:

```sql
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

-- Cliente só pode atualizar o próprio display_name
grant update (display_name) on public.profiles to authenticated;
```

Resultado: `role`, `email`, `provider`, `id`, `created_at` só podem ser modificados via `service_role` (backend). Cliente não consegue promover a própria conta a admin.

### 4c. `auth.users.instance_id` em projetos hospedados

Em projeto Supabase single-tenant, `auth.users.instance_id` deve sempre ser `00000000-0000-0000-0000-000000000000`. Inserir usuário direto via SQL (sem usar Auth API ou trigger) deixa esse campo NULL e o GoTrue **passa a ignorar** o usuário em listUsers/recover/login. Se acontecer:

```sql
update auth.users
set instance_id = '00000000-0000-0000-0000-000000000000'
where instance_id is null;
```

### 5. Dados sensíveis nunca expostos

| Dado | Onde está | Cliente acessa? |
|------|-----------|-----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` backend | ❌ |
| `MERCADOPAGO_ACCESS_TOKEN` | `.env` backend | ❌ |
| `WEBHOOK_SECRET` | `.env` backend | ❌ |
| `ADMIN_SESSION_SECRET` | `.env` backend | ❌ |
| `CUSTOMER_SESSION_SECRET` | `.env` backend | ❌ |
| `DOWNLOAD_TOKEN_SECRET` | `.env` backend | ❌ |
| `adminConfig.totpSecret` | `settings` table | ❌ (RLS service-only) |
| `adminConfig.fallbackPin` | `settings` table | ❌ (RLS service-only) |
| `VITE_SUPABASE_ANON_KEY` | `.env` frontend | ✅ (por design, pública) |
| `VITE_SUPABASE_URL` | `.env` frontend | ✅ (por design, pública) |

### 6. Webhook do Mercado Pago

Toda requisição em `/api/webhook` é validada via HMAC:

```js
const manifest = `id:${paymentId};request-id:${xRequestId};ts:${timestamp};`;
const expectedHash = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(manifest)
  .digest('hex');

if (!timingSafeEqual(hash, expectedHash)) return 401;
```

Sem assinatura válida → 401.

### 7. E-mail transacional (Resend)

Dois sistemas de envio separados, ambos via Resend:

**a) E-mails do Supabase Auth** (signup confirm, reset de senha, magic link) — configurado no nível do projeto via Management API:

```
smtp_host       = smtp.resend.com
smtp_port       = 465
smtp_user       = resend
smtp_pass       = <RESEND_API_KEY>
smtp_admin_email= <onboarding@resend.dev OU pedidos@seudominio.com.br>
```

Rate limits relevantes: `rate_limit_email_sent=30/h` (Supabase) + limites do Resend (100/dia free).

**b) E-mails transacionais do app** (confirmação de compra) — [api/send-confirmation-email.js](../api/send-confirmation-email.js) usa nodemailer com as mesmas credenciais lidas de `SMTP_HOST/PORT/USER/PASS/FROM` em `.env.local`.

**Modo sandbox vs domínio verificado:**
- Sem verificar domínio no Resend ([resend.com/domains](https://resend.com/domains)): só entrega para o e-mail da conta Resend (uso dev).
- Com domínio verificado (SPF + DKIM + DMARC nos DNS): entrega para qualquer destinatário; usar `pedidos@seudominio.com.br` como `from`.

### 8. Download tokens

- Gerados pelo backend após pagamento aprovado
- Salvos em `download_tokens` com `expires_at`
- URL pública: `/api/download?token=XYZ`
- Backend valida: token existe + não expirou + não foi usado
- Marca `used=true` após primeiro download bem-sucedido
- Loga em `download_logs` (IP + user agent + timestamp)
- Resposta inclui `Referrer-Policy: no-referrer` antes do redirect — token não vaza no `Referer` para o destino externo

### 9. Verify-payment exige email

`/api/verify-payment` exige `orderId` **e** `email` (LGPD: defesa contra enumeração).

- `order_code` tem 128 bits de entropia (`crypto.randomBytes(16).toString('hex')`).
- Comparação do email usa `crypto.timingSafeEqual` para não vazar diferenças por tempo.
- Resposta uniforme `404 "Pedido não encontrado"` em ambos os casos (order não existe vs email não bate).
- Rate-limit por IP (60 req/min) bloqueia tentativas em massa.

### 10. Retenção de logs (LGPD princípio da minimização)

Migration [`20260526000000_phase2_log_retention.sql`](../supabase/migrations/20260526000000_phase2_log_retention.sql) cria a função `public.purge_old_logs()` e agenda via `pg_cron`:

| Tabela | Retenção | Justificativa |
|---|---|---|
| `download_logs` | 12 meses | Cobre auditoria de fraude e disputas |
| `analytics_events` | 24 meses | Permite comparação YoY |

Job agendado diariamente às 03:00 UTC. Se `pg_cron` não estiver habilitado no Supabase (`create extension pg_cron;`), a migration cai num `notice` e o purge precisa ser rodado manualmente (`select public.purge_old_logs();`).

### 11. Monitoramento de tentativas de fraude

Eventos passam por [lib/security-logger.js](../lib/security-logger.js) que escreve em **três** destinos:

1. **stdout estruturado JSON** (`{ level, event, severity, ip, ... }`) — Vercel/Supabase captura.
2. **Tabela `public.security_events`** (RLS service-role only) — queryable do admin via SQL.
3. **`SECURITY_ALERT_WEBHOOK_URL`** (env opcional) — POST JSON pra Slack/Discord/Sentry. Em branco → pula.

Eventos emitidos hoje:

| `event_name` | Origem | Severidade | Quando dispara |
|---|---|---|---|
| `webhook_invalid_signature` | [api/webhook.js](../api/webhook.js) | warn | HMAC do MP não bate fora de `APP_ENV=test` |
| `admin_login_failed` | [api/admin-login.js](../api/admin-login.js) | warn | Senha errada **ou** sessão sem `role=admin` |
| `verify_payment_email_mismatch` | [api/verify-payment.js](../api/verify-payment.js) | warn | Order existe mas email passado não bate (enumeração) |

Email do usuário **nunca** é gravado em claro — só `sha256(email).slice(0, 16)` para correlação cross-event sem violar LGPD. Rate-limits relacionados:

- `/verify-payment` — 60 req/min por IP ([routes/api-compat.routes.js](../routes/api-compat.routes.js)).
- `/admin-login` — 5 falhas/10min por IP (skipSuccessfulRequests, mesmo arquivo).
- `/auth/customer/login` — 5/10min por IP.

Retenção: 6 meses em `security_events`, via `purge_old_logs()` (migração [`20260526110000_phase2_security_events.sql`](../supabase/migrations/20260526110000_phase2_security_events.sql)).

---

## Auditoria periódica

### Security Advisor do Supabase

```bash
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/check-advisor.js
```

Deve retornar **0 CRITICAL**. Os INFO "RLS Enabled No Policy" em `settings`, `download_tokens` e `download_logs` são **intencionais** (apenas service role acessa).

### Rotação de secrets

**Cadência mínima: trimestral.** Marcar no calendário do administrador (Q1 jan, Q2 abr, Q3 jul, Q4 out).

Secrets a rotacionar (todos no `.env.local` + Vercel):

| Secret | Impacto da rotação | Ação extra |
|---|---|---|
| `ADMIN_SESSION_SECRET` | Logout forçado de admins | Avisar a equipe |
| `CUSTOMER_SESSION_SECRET` | Logout forçado de clientes | Sem ação |
| `DOWNLOAD_TOKEN_SECRET` | Nenhum (tokens são opacos) | — |
| `WEBHOOK_SECRET` | Precisa sincronizar com painel Mercado Pago | Atualizar no painel MP **antes** do redeploy |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role muda — rotacionar via dashboard Supabase | Atualizar Vercel imediatamente |
| `MERCADOPAGO_ACCESS_TOKEN` | Pagamentos param se desincronizar | Gerar novo no painel MP **antes** de atualizar prod |

Passo a passo:

1. Gere novo secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Para `WEBHOOK_SECRET` e `MERCADOPAGO_ACCESS_TOKEN`: gere/copie do painel MP primeiro.
3. Atualize `.env.local` (dev) e Vercel (prod) — em prod, atualize **Production** e **Preview** separadamente.
4. Redeploy em produção.
5. Verifique: webhook MP entrega 200, login admin funciona, criação de pedido funciona.

Em caso de incidente (segredo vazado): rotacione tudo na hora, mesmo fora do trimestre.

### Pen-test focado (TODO externo)

Próxima janela: **prévia a cada release maior** (mínimo anual).

Escopo mínimo recomendado:
- Enumeração de `order_code` em `/verify-payment` (com e sem email).
- IDOR em `/api/admin-*` (cookie de cliente tentando acessar endpoints de admin).
- CSRF em endpoints POST que dependem só de cookie (`/auth/customer/login`, `/admin-login`).
- Injeção em campos de produto (nome, descrição) → XSS armazenado.
- Bypass de RLS pelo cliente usando o anon key publicado.
- Replay de webhook MP (assinatura válida + body antigo).

Resultados ficam em arquivo cifrado fora do repositório.

### Atualização de dependências

```bash
npm audit
npm outdated
```

Patch crítico → atualizar imediatamente. Minor → mensal. Major → planejado.

---

## Checklist pré-produção

- [ ] Todos os secrets em `.env.local` foram gerados (não cópias do `.env.example`)
- [ ] `MERCADOPAGO_ACCESS_TOKEN` é de PRODUÇÃO (`APP_USR-...` não `TEST-...`)
- [ ] `CORS_ORIGINS` lista exatamente os domínios produção
- [ ] `APP_URL` é `https://...` (não localhost)
- [ ] `NODE_ENV=production`
- [ ] Security Advisor: 0 CRITICAL
- [ ] 2FA habilitado para conta admin
- [ ] Backup do banco testado (Supabase Pro)
- [ ] Webhook MP configurado com URL pública HTTPS
- [ ] Email SMTP funcionando (teste manual): reset de senha **e** confirmação de compra
- [ ] Domínio verificado no Resend (SPF + DKIM + DMARC) — sem isso, só entrega no email da conta Resend
- [ ] `smtp_admin_email` e `SMTP_FROM` apontam para domínio verificado (não `onboarding@resend.dev`)
- [ ] Plano HIBP avaliado (Pro feature, mas tem regra de senha como mitigação)
- [ ] Conferir `auth.users.instance_id` não-NULL em todos os usuários (ver seção 4c)
