# 08 — Segurança

> Modelo de ameaça, camadas de defesa, RLS, secrets, auditoria, LGPD, pen-test.

> 🔒 **Auditoria de segurança fechada em 2026-05-24** — 16 ações priorizadas (A1–A16) entregues + 6 melhorias extras. Este documento é a **referência viva**; o histórico de auditoria fica em `docs/NextFeatures/PLANO_SEGURANCA.md` (legado).

---

## 1. Modelo de ameaça

| Ator                                 | Acesso esperado                                   | Como bloqueamos                                                           |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Visitante anônimo                    | Catálogo público, criar pedido                    | RLS `public read` em `categories`/`products` com `active=true`            |
| Cliente logado                       | Próprios pedidos, downloads dos próprios produtos | RLS por `auth.uid()` em `orders`, `user_products`                         |
| Admin                                | Tudo via painel `/admin`                          | Cookie `admin_session` + `service_role` no backend                        |
| Atacante com anon key                | **NADA além do catálogo público**                 | RLS bloqueia; sem policy = sem acesso                                     |
| Atacante com SERVICE_ROLE_KEY vazado | **Acesso total ao banco**                         | NUNCA expor no front; rotação trimestral; alerta em vazamento             |
| Atacante com webhook spoofado        | —                                                 | HMAC-SHA256 valida assinatura; falha = 401 + log                          |
| Atacante enumerando `order_code`     | —                                                 | 128 bits de entropia + email obrigatório + rate-limit + resposta uniforme |

---

## 2. Camadas de defesa

### 2.1 Network / Headers

Configurado em `lib/security-headers.js` + `server.js`:

- `helmet()` — CSP **estrita explícita** (script-src whitelist GA4/Meta/MP), HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff. Em produção (Vercel), headers equivalentes são aplicados pela rota `/(.*)` do `vercel.json` — com uma diferença: lá o `X-Frame-Options` é `SAMEORIGIN` (na prática o `frame-ancestors 'none'` da CSP, presente nos dois ambientes, prevalece nos browsers modernos).
- `cors()` — allowlist explícita em prod (`CORS_ORIGINS`); permissivo só para `localhost:*` em dev
- `express-rate-limit` global — 250 req / 15 min global (`RATE_LIMIT_MAX`); 30 req / 15 min em `/auth/*` (`AUTH_RATE_LIMIT_MAX`)
- **HTTPS obrigatório em produção:** o boot em `server.js` **falha** se `APP_URL` não começar com `https://` quando `APP_ENV=production`. Cookies `Secure` dependem disso.

### 2.2 Rate limits específicos

| Endpoint               | Limite                                | Justificativa                         |
| ---------------------- | ------------------------------------- | ------------------------------------- |
| Global                 | 250 req / 15 min                      | Throttle geral por IP                 |
| `/auth/*`              | 30 req / 15 min                       | Brute force em login                  |
| `/auth/customer/login` | 5 / 10 min                            | Brute force específico cliente        |
| `/admin-login`         | 5 / 10 min (`skipSuccessfulRequests`) | Brute force admin                     |
| `/verify-payment`      | 60 / min                              | Anti enumeração de `order_code`       |
| `/track-event`         | 120 / min                             | Permite uso normal sem permitir flood |
| `/validate-coupon`     | 20 / min                              | Anti enumeração de códigos            |
| `/abandoned-cart`      | 30 / min                              | Chamado a cada keystroke debounced    |
| `/subscribe`           | 5 / min                               | Anti enumeração de e-mails            |
| `/unsubscribe`         | 20 / min                              | Uso normal do 1-click                 |
| `/me-delete-account`   | 5 / min                               | Ação rara e sensível                  |

> ⚠️ Os limiters rodam no Express (`server.js` + `routes/`), ou seja, **em dev**. Na Vercel cada função serverless é isolada e o `express-rate-limit` em memória não vale entre invocações — rate limit por endpoint em produção depende de store compartilhado (KV), pendência **API-03**. `/cron-email-jobs` não tem limiter (autentica por `CRON_SECRET` timing-safe).

### 2.3 Autenticação

- **Cookies HttpOnly** — `customer_session` e `admin_session`. JavaScript não acessa.
- **SameSite=Strict** em ambos os cookies (CSRF mitigation). Além disso, escritas admin e logouts exigem request **same-origin** (`isSameOriginRequest` checa `Origin`/`Referer` contra allowlist; sem os dois headers → bloqueia, fail-closed).
- **HMAC-SHA256** com secrets de 32 bytes (rotacionáveis; `lib/env-secret.js` é fail-closed — fora de dev/test, secret ausente derruba o boot em vez de cair em fallback).
- **TTL 8h** em ambos cookies.
- **Senhas** — mín 8 chars (server) + maiúscula + minúscula + dígito (client; o Supabase Auth rejeita senha fraca, mapeada para mensagem amigável — defense in depth).
- **2FA opcional para admin** (TOTP com janela ±1 step + PIN de recuperação; challenge token HMAC com TTL 5 min; `totpSecret`/`fallbackPin` ficam em `settings.adminConfig`, nunca são devolvidos no GET e a comparação é timing-safe).
- **Google OAuth com PKCE** — `code_verifier` protege contra interceptação (`flowType: 'pkce'` em `src/services/supabase-browser.js`).

### 2.4 Autorização (RLS no Postgres)

17 tabelas, todas com RLS habilitado (baseline versionado na migration `20260702000000_phase6_db_rls_hardening.sql`, espelhado em `supabase/security-hardening.sql`). Resumo (detalhes em [04-BANCO-DE-DADOS §RLS](./04-BANCO-DE-DADOS.md)):

| Tabela                                 | Quem lê                                                   | Quem escreve                                                                             |
| -------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `categories`                           | anon + auth (active=true)                                 | service_role                                                                             |
| `products`                             | anon + auth (active=true)                                 | service_role                                                                             |
| `orders`                               | auth (próprios: `customer_id` ou `customer_email` do JWT) | service_role                                                                             |
| `order_items`                          | auth (via parent order)                                   | service_role                                                                             |
| `profiles`                             | auth (próprio)                                            | auth (linha própria; `id`/`email`/`role`/`provider` travados por trigger) + service_role |
| `user_products`                        | auth (próprios)                                           | service_role                                                                             |
| `download_tokens`                      | —                                                         | service_role                                                                             |
| `download_logs`                        | —                                                         | service_role                                                                             |
| `security_events`                      | —                                                         | service_role                                                                             |
| `settings`                             | —                                                         | service_role                                                                             |
| `coupons`                              | —                                                         | service_role                                                                             |
| `abandoned_carts`                      | —                                                         | service_role                                                                             |
| `email_subscribers` / `email_sent_log` | —                                                         | service_role                                                                             |
| `admin_audit_log`                      | —                                                         | service_role, só INSERT (append-only: UPDATE/DELETE bloqueados até para service_role)    |
| `analytics_events`                     | —                                                         | anon + auth (INSERT com whitelist de eventos, sem `order_id`/`customer_email`)           |
| `page_views`                           | —                                                         | service_role (INSERT público removido — RLS-04)                                          |

**Princípio**: `service_role` bypassa RLS, então o **backend pode tudo**. Browser usando anon key fica restrito ao que está nas policies.

### 2.5 Funções com `SECURITY DEFINER`

```sql
alter function public.set_updated_at()  set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;

-- Não podem ser executadas diretamente pela API pública
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

As demais funções privilegiadas — `purge_old_logs()`, `cleanup_old_analytics_events()`, `cleanup_old_email_logs()`, `purge_stale_email_subscribers()` e `increment_coupon_usage()` — já nascem nas migrations como `SECURITY DEFINER` com `set search_path = public, pg_temp` **e** `revoke execute` de `public/anon/authenticated` (`increment_coupon_usage` só executa via service_role).

### 2.6 Privilege escalation bloqueado em `profiles`

RLS sozinho não impede um cliente autenticado de fazer `UPDATE profiles SET role='ADMIN' WHERE id=auth.uid()` — a policy `profiles_own_update` libera a linha mas não as colunas. Por isso usamos um trigger guard (RLS-01, `supabase/security-hardening.sql` / migration phase6):

```sql
create trigger profiles_guard_privileged_cols
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_cols();
-- A função (invoker) preserva OLD.id/email/role/provider quando
-- current_user não é service_role/postgres/supabase_admin.
```

Resultado: `role`, `email`, `provider`, `id` só podem ser modificados via `service_role` (backend); o cliente só consegue alterar o próprio `display_name`. Cliente não consegue se promover.

### 2.7 `auth.users.instance_id` em projetos hospedados

Em projeto Supabase single-tenant, `auth.users.instance_id` deve sempre ser `00000000-0000-0000-0000-000000000000`. Inserir usuário direto via SQL (sem usar Auth API ou trigger) deixa esse campo NULL e o GoTrue **passa a ignorar** o usuário em `listUsers`/recover/login.

Se acontecer:

```sql
update auth.users
set instance_id = '00000000-0000-0000-0000-000000000000'
where instance_id is null;
```

### 2.8 Validação de input com Zod

Schemas em `validation/`:

- `payment.schemas.js` — `processPaymentSchema` (`items` 1–100, `customer`, `externalReference`); exercitado pela suíte de fuzz em `validation/__tests__/`
- `product.schemas.js` — `createProductSchema`: campos de produto na criação (URLs só aceitam `http(s)://` — bloqueia `javascript:`/`data:`/`file:`)

Aplicado via `middleware/validate.middleware.js` (rota Express-only de dev):

```js
router.post('/produtos', validateBody(createProductSchema), createProduct);
```

No caminho serverless, `api/create-payment.js` valida manualmente: `productId` obrigatório, quantidade inteira 1–99, máx. 100 itens (anti-DoS) e **preço sempre do banco** (nunca do client). A atribuição passa por `lib/attribution-sanitize.js` (whitelist de 9 campos, strings clipadas a 200 chars).

---

## 3. Dados sensíveis nunca expostos

| Dado                                 | Onde está                          | Cliente acessa?                                                               |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`          | `.env` backend / Vercel Production | ❌                                                                            |
| `MERCADOPAGO_ACCESS_TOKEN`           | idem                               | ❌                                                                            |
| `WEBHOOK_SECRET`                     | idem                               | ❌                                                                            |
| `ADMIN_SESSION_SECRET`               | idem                               | ❌                                                                            |
| `CUSTOMER_SESSION_SECRET`            | idem                               | ❌                                                                            |
| `DOWNLOAD_TOKEN_SECRET`              | idem                               | ❌                                                                            |
| `CRON_SECRET`                        | idem                               | ❌                                                                            |
| `RESEND_API_KEY` (via SMTP_PASS)     | idem                               | ❌                                                                            |
| `settings.adminConfig.totpSecret`    | tabela `settings`                  | ❌ (RLS service-only; redigido no GET e no audit log)                         |
| `settings.adminConfig.fallbackPin`   | tabela `settings`                  | ❌ (RLS service-only; redigido no GET e no audit log; comparação timing-safe) |
| `VITE_SUPABASE_ANON_KEY`             | `.env` frontend                    | ✅ (por design, pública)                                                      |
| `VITE_SUPABASE_URL`                  | `.env` frontend                    | ✅ (por design, pública)                                                      |
| `VITE_GA4_ID` / `VITE_META_PIXEL_ID` | `.env` frontend                    | ✅ (por design, públicas)                                                     |

---

## 4. Webhook do Mercado Pago

Toda requisição em `/api/webhook` é validada via HMAC:

```js
const manifest = `id:${paymentId};request-id:${xRequestId};ts:${timestamp};`;
const expectedHash = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(manifest)
  .digest('hex');

if (!timingSafeEqual(hash, expectedHash)) {
  await recordSecurityEvent({ eventName: 'webhook_invalid_signature', ... });
  return res.status(401).json({ error: 'Invalid signature' });
}
```

Sem assinatura válida → 401 + evento em `security_events`.

A validação é **fail-closed**: sem `WEBHOOK_SECRET` configurado, toda requisição é rejeitada (nunca reutiliza o `MERCADOPAGO_ACCESS_TOKEN` como chave HMAC).

---

## 5. E-mail transacional (Resend)

Dois sistemas de envio separados, ambos via Resend:

**a) E-mails do Supabase Auth** (signup confirm, reset de senha, magic link) — configurado no nível do projeto via Management API ou Dashboard:

```
smtp_host       = smtp.resend.com
smtp_port       = 465
smtp_user       = resend
smtp_pass       = <RESEND_API_KEY>
smtp_admin_email= <onboarding@resend.dev OU pedidos@seudominio.com.br>
```

Rate limits relevantes: `rate_limit_email_sent=30/h` (Supabase) + limites do Resend (100/dia free).

**b) E-mails transacionais do app** (confirmação de compra, abandoned cart, newsletter, sequência pós-compra, reativação) — `api/send-confirmation-email.js` + `api/cron-email-jobs.js` usam nodemailer com `SMTP_HOST/PORT/USER/PASS/FROM` em `.env.local`.

**Modo sandbox vs domínio verificado:**

- Sem verificar domínio no Resend ([resend.com/domains](https://resend.com/domains)): só entrega para o e-mail dono da conta Resend (uso dev).
- Com domínio verificado (SPF + DKIM + DMARC nos DNS): entrega para qualquer destinatário; usar `pedidos@seudominio.com.br` como `from`.

---

## 6. Download tokens (proteção dos arquivos)

- Gerados pelo backend após pagamento aprovado (`crypto.randomBytes(32)` em hex — token opaco de 256 bits)
- Salvos em `download_tokens` com `expires_at` (TTL 72h); UNIQUE `(order_id, product_id)` torna a criação idempotente em webhooks reentregues
- URL pública: `/api/download?token=XYZ`
- Backend valida: token existe + não expirou + não usado
- **Uso único atômico**: o claim `used=false → true` é feito no próprio UPDATE condicionado; requisições concorrentes ou repetidas recebem 401 "Token já utilizado"
- Loga em `download_logs` (IP + user agent + timestamp)
- Gera signed URL temporária do Supabase Storage (5 min; não expõe URL direta); arquivos externos (Drive etc.) caem no redirect legado
- Resposta inclui `Referrer-Policy: no-referrer` + `Cache-Control: no-store` antes do redirect — token não vaza no `Referer` para destino externo

---

## 7. Verify-payment exige email (anti enumeração)

`/api/verify-payment` exige `orderId` **e** `email` (LGPD: defesa contra enumeração).

- `order_code` tem 128 bits de entropia (`crypto.randomBytes(16).toString('hex')`)
- Comparação do email usa `crypto.timingSafeEqual` para não vazar diferenças por tempo
- Resposta **uniforme** `404 "Pedido não encontrado"` em ambos os casos (order não existe vs email não bate)
- Rate-limit por IP (60 req/min) bloqueia tentativas em massa
- Em mismatch, gera `security_events.verify_payment_email_mismatch`

---

## 8. Retenção de logs (LGPD princípio da minimização)

A função `public.purge_old_logs()` nasceu na migration [`20260526100000_phase2_log_retention.sql`](../../supabase/migrations/20260526100000_phase2_log_retention.sql); a versão final está na [`20260702000000_phase6_db_rls_hardening.sql`](../../supabase/migrations/20260702000000_phase6_db_rls_hardening.sql):

| Tabela                                                         | Retenção | Purga por                                                           |
| -------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `download_logs`                                                | 12 meses | `purge_old_logs()` — cobre auditoria de fraude e disputas           |
| `security_events`                                              | 6 meses  | `purge_old_logs()` — suficiente para investigar incidentes recentes |
| `page_views`                                                   | 6 meses  | `purge_old_logs()`                                                  |
| `admin_audit_log`                                              | 18 meses | `purge_old_logs()`                                                  |
| `analytics_events`                                             | 180 dias | `cleanup_old_analytics_events()` (regra D7), job mensal             |
| `email_sent_log`                                               | 90 dias  | `cleanup_old_email_logs()`, job mensal                              |
| `email_subscribers` (não confirmados >30d / desinscritos >90d) | —        | `purge_stale_email_subscribers()`, job mensal                       |

Jobs `pg_cron`: `purge_old_logs_daily` (diário 03:00 UTC), `cleanup-analytics-events` (mensal), `cleanup-email-logs-monthly` (mensal) e `purge-stale-subscribers-monthly` (mensal). Se `pg_cron` não estiver habilitado no Supabase (`create extension pg_cron;`), a migration cai num `notice` e o purge precisa ser rodado manualmente:

```sql
select public.purge_old_logs();
```

---

## 9. Monitoramento de tentativas de fraude

Eventos passam por `lib/security-logger.js` que escreve em **três** destinos:

1. **stdout estruturado JSON** (`{ level, event, severity, ip, ... }`) — Vercel/Supabase captura.
2. **Tabela `public.security_events`** (RLS service-role only) — queryable via SQL no Supabase. (A aba **Segurança** do admin só configura o 2FA — não existe endpoint/tela que liste esses eventos.)
3. **`SECURITY_ALERT_WEBHOOK_URL`** (env opcional) — POST JSON pra Slack/Discord/Sentry. Em branco → pula.

### Eventos emitidos hoje

| `event_name`                    | Origem                     | Severidade | Quando dispara                                                                                     |
| ------------------------------- | -------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `webhook_invalid_signature`     | `api/webhook.js`           | warn       | HMAC do MP não bate (ou header ausente)                                                            |
| `admin_login_failed`            | `api/admin-login.js`       | warn       | Credencial inválida **ou** conta sem role `admin`/`master` (resposta HTTP idêntica nos dois casos) |
| `verify_payment_email_mismatch` | `api/verify-payment.js`    | warn       | Order existe mas email não bate                                                                    |
| `account_self_deleted`          | `api/me-delete-account.js` | info       | Exclusão de conta LGPD confirmada pelo cliente                                                     |
| `admin_audit_write_failed`      | `lib/admin-audit.js`       | error      | Insert no `admin_audit_log` falhou (para não passar silencioso)                                    |

Email do usuário **nunca** é gravado em claro — só `sha256(email).slice(0, 16)` para correlação cross-event sem violar LGPD.

---

## 10. LGPD / Privacidade

### Princípios aplicados

- **Finalidade declarada** — Política de Privacidade em `/privacidade`
- **Minimização** — coletamos nome + email no checkout. CPF apenas se necessário para nota futura. Endereço não coletado (produto digital, regra H6)
- **Consentimento informado** — banner com Aceitar / Rejeitar / Personalizar (`ConsentBanner.jsx`)
- **Direito de oposição** — link de descadastro 1-clique em todo e-mail de marketing (+ headers RFC 8058 `List-Unsubscribe`)
- **Direito de exclusão** — self-service via `/api/me-delete-account` (2 passos: solicitação autenticada por cookie → confirmação por link no e-mail com token HMAC de 1h). Exclui o usuário do Supabase Auth, anonimiza o PII dos pedidos (histórico fiscal preservado), apaga tokens de download e desinscreve da newsletter
- **Retenção limitada** — logs purgam automaticamente
- **Transferência internacional** — Supabase em região `sa-east-1`, Resend em US — disclosed nos termos

### Dados pessoais que tratamos

- Email (PII)
- Nome (PII)
- CPF (opcional)
- IP + user agent (uso operacional, auditoria, segurança)
- Histórico de compra (PII transacional)
- UTM/attribution (não PII)

### Não tratamos

- Endereço físico
- Telefone
- Dados de cartão (passam direto para Mercado Pago, não tocamos)
- Dados sensíveis (saúde, etnia, religião, etc.)

### Em logs

- Email aparece como `sha256(email).slice(0, 16)` em `security_events`
- IP fica em claro nos logs (necessário para mitigação de ataques)
- User agent fica em claro

### Banner de consentimento

- Bloqueia GA4 e Meta Pixel até consentimento
- Eventos essenciais (carrinho, checkout, `purchase`) podem rodar como `first-party only` sem consent
- Estado em `localStorage` via `src/utils/consent.js`

---

## 11. Auditoria periódica

### 11.1 Security Advisor do Supabase

```bash
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/check-advisor.js
```

Deve retornar **0 CRITICAL**. Os INFO "RLS Enabled No Policy" em `settings`, `download_tokens`, `download_logs`, `security_events`, `page_views`, `coupons`, `abandoned_carts`, `email_*`, `admin_audit_log` são **intencionais** (apenas service role acessa).

### 11.2 Rotação de secrets

**Cadência mínima: trimestral.** Marcar no calendário do administrador (Q1 jan, Q2 abr, Q3 jul, Q4 out).

Secrets a rotacionar (todos no `.env.local` + Vercel):

| Secret                      | Impacto da rotação                                    | Ação extra                                          |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `ADMIN_SESSION_SECRET`      | Logout forçado de admins                              | Avisar a equipe                                     |
| `CUSTOMER_SESSION_SECRET`   | Logout forçado de clientes                            | Sem ação                                            |
| `DOWNLOAD_TOKEN_SECRET`     | Nenhum (tokens são opacos)                            | —                                                   |
| `WEBHOOK_SECRET`            | Precisa sincronizar com painel MP                     | Atualizar no painel MP **antes** do redeploy        |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role muda — rotacionar via dashboard Supabase | Atualizar Vercel imediatamente                      |
| `MERCADOPAGO_ACCESS_TOKEN`  | Pagamentos param se desincronizar                     | Gerar novo no painel MP **antes** de atualizar prod |
| `CRON_SECRET`               | Workflow falha 401 até atualizar                      | Sincronizar GitHub Secrets                          |

Passo a passo:

1. Gere novo secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Para `WEBHOOK_SECRET` e `MERCADOPAGO_ACCESS_TOKEN`: gere/copie do painel MP primeiro.
3. Atualize `.env.local` (dev) e Vercel (prod) — em prod, atualize **Production** e **Preview** separadamente.
4. Redeploy em produção.
5. Verifique: webhook MP entrega 200, login admin funciona, criação de pedido funciona.

Em caso de incidente (segredo vazado): rotacione tudo na hora, mesmo fora do trimestre.

### 11.3 Pen-test focado (TODO externo)

**Próxima janela:** prévia a cada release maior (mínimo anual).

Escopo mínimo recomendado:

- Enumeração de `order_code` em `/verify-payment` (com e sem email)
- IDOR em `/api/admin-*` (cookie de cliente tentando acessar endpoints de admin)
- CSRF em endpoints POST que dependem só de cookie (`/auth/customer/login`, `/admin-login`)
- Injeção em campos de produto (nome, descrição) → XSS armazenado
- Bypass de RLS pelo cliente usando o anon key publicado
- Replay de webhook MP (assinatura válida + body antigo)

Resultados ficam em arquivo cifrado fora do repositório.

### 11.4 Atualização de dependências

```bash
npm audit
npm outdated
```

- Patch crítico → atualizar imediatamente
- Minor → mensal
- Major → planejado

---

## 12. Checklist pré-produção

Antes de cada release maior:

- [ ] Todos os secrets em `.env.local` foram gerados (não cópias do `.env.example`)
- [ ] `MERCADOPAGO_ACCESS_TOKEN` é de PRODUÇÃO (`APP_USR-...` não `TEST-...`)
- [ ] `CORS_ORIGINS` lista exatamente os domínios de produção
- [ ] `APP_URL` é `https://...` (não localhost)
- [ ] `APP_ENV=production` (o runtime usa `APP_ENV || NODE_ENV`)
- [ ] Security Advisor: 0 CRITICAL
- [ ] 2FA habilitado para conta admin
- [ ] Backup do banco testado (Supabase Pro)
- [ ] Webhook MP configurado com URL pública HTTPS
- [ ] Email SMTP funcionando: reset de senha **e** confirmação de compra (teste manual)
- [ ] Domínio verificado no Resend (SPF + DKIM + DMARC) — sem isso, só entrega no email da conta Resend
- [ ] `smtp_admin_email` e `SMTP_FROM` apontam para domínio verificado (não `onboarding@resend.dev`)
- [ ] Plano HIBP avaliado (Supabase Pro feature; sem isso, política de senha atual mitiga)
- [ ] Conferir `auth.users.instance_id` não-NULL em todos os usuários (§2.7)
- [ ] Logs de retenção rodando (verificar `cron.job` ativo)
- [ ] Lighthouse Performance ≥ 90 mobile, SEO ≥ 95 (regra F1)
- [ ] Migrations aplicadas (validações em [04-BANCO-DE-DADOS §validação](./04-BANCO-DE-DADOS.md))

---

## 13. Resumo rápido (poster do dev)

```
✅ HttpOnly cookies + HMAC-SHA256 + SameSite=Strict + same-origin em escritas
✅ RLS em TODAS as 17 tabelas
✅ Service role NUNCA no frontend
✅ CSP estrita + HSTS + frame-ancestors 'none' (X-Frame-Options: DENY no dev, SAMEORIGIN na Vercel)
✅ Rate-limit em endpoints sensíveis (Express/dev; serverless pendente — API-03)
✅ Webhook MP com HMAC fail-closed + idempotência
✅ Download token de uso único (claim atômico) + TTL 72h + signed URL Supabase + Referrer-Policy
✅ Senha: 8+ chars, upper, lower, digit (client + server)
✅ 2FA admin opcional (TOTP + PIN)
✅ Email mascarado em logs (sha256.slice(0,16))
✅ Logs com retenção: 12m (download), 180d (analytics), 6m (security/page views), 18m (audit)
✅ Audit log de admin append-only (nem service_role altera/apaga)
✅ Exclusão de conta LGPD self-service em 2 passos
✅ Banner LGPD bloqueando GA4/Pixel sem consent
✅ Privilege escalation bloqueado por trigger guard de colunas em profiles
✅ Privilege definer functions com search_path fixo + revoke execute

🔁 Rotação de secrets: trimestral
🎯 Pen-test: anual (mínimo)
📅 Audit Security Advisor: a cada release
```
