# 08 — Segurança

> Modelo de ameaça, camadas de defesa, RLS, secrets, auditoria, LGPD, pen-test.

> 🔒 **Auditoria de segurança fechada em 2026-05-24** — 16 ações priorizadas (A1–A16) entregues + 6 melhorias extras. Este documento é a **referência viva**; o histórico de auditoria fica em `docs/NextFeatures/PLANO_SEGURANCA.md` (legado).

---

## 1. Modelo de ameaça

| Ator | Acesso esperado | Como bloqueamos |
|---|---|---|
| Visitante anônimo | Catálogo público, criar pedido | RLS `public read` em `categories`/`products` com `active=true` |
| Cliente logado | Próprios pedidos, downloads dos próprios produtos | RLS por `auth.uid()` em `orders`, `user_products` |
| Admin | Tudo via painel `/admin` | Cookie `admin_session` + `service_role` no backend |
| Atacante com anon key | **NADA além do catálogo público** | RLS bloqueia; sem policy = sem acesso |
| Atacante com SERVICE_ROLE_KEY vazado | **Acesso total ao banco** | NUNCA expor no front; rotação trimestral; alerta em vazamento |
| Atacante com webhook spoofado | — | HMAC-SHA256 valida assinatura; falha = 401 + log |
| Atacante enumerando `order_code` | — | 128 bits de entropia + email obrigatório + rate-limit + resposta uniforme |

---

## 2. Camadas de defesa

### 2.1 Network / Headers

Configurado em `lib/security-headers.js` + `server.js`:

- `helmet()` — CSP **estrita explícita** (script-src whitelist GA4/Meta/MP), HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff
- `cors()` — allowlist explícita em prod; permissivo só para `localhost:*` em dev
- `express-rate-limit` global — 250 req / 15 min global; 30 req / 15 min em `/auth/*`
- **HTTPS obrigatório em produção:** o boot em `server.js` **falha** se `APP_URL` não começar com `https://` quando `APP_ENV=production`. Cookies `Secure` dependem disso.

### 2.2 Rate limits específicos

| Endpoint | Limite | Justificativa |
|---|---|---|
| Global | 250 req / 15 min | Throttle geral por IP |
| `/auth/*` | 30 req / 15 min | Brute force em login |
| `/auth/customer/login` | 5 / 10 min | Brute force específico cliente |
| `/admin-login` | 5 / 10 min (`skipSuccessfulRequests`) | Brute force admin |
| `/verify-payment` | 60 / min | Anti enumeração de `order_code` |
| `/track-event` | 120 / min | Permite uso normal sem permitir flood |
| `/validate-coupon` | 20 / min | Anti enumeração de códigos |

### 2.3 Autenticação

- **Cookies HttpOnly** — `customer_session` e `admin_session`. JavaScript não acessa.
- **SameSite=Strict** no cookie de cliente (CSRF mitigation).
- **HMAC-SHA256** com secrets de 32 bytes (rotacionáveis).
- **TTL 8h** em ambos cookies.
- **Senhas** — mín 8 chars + maiúscula + minúscula + dígito (validação client + server, defense in depth).
- **2FA opcional para admin** (TOTP + PIN de recuperação em hash bcrypt).
- **Google OAuth com PKCE** — `code_verifier` protege contra interceptação.

### 2.4 Autorização (RLS no Postgres)

14 tabelas. Resumo (detalhes em [04-BANCO-DE-DADOS §RLS](./04-BANCO-DE-DADOS.md)):

| Tabela | Quem lê | Quem escreve |
|---|---|---|
| `categories` | anon + auth (active=true) | service_role |
| `products` | anon + auth (active=true) | service_role |
| `orders` | auth (próprios) | service_role |
| `order_items` | auth (via parent order) | service_role |
| `profiles` | auth (próprio) | auth (só `display_name`) + service_role |
| `user_products` | auth (próprios) | service_role |
| `download_tokens` | — | service_role |
| `download_logs` | — | service_role |
| `security_events` | — | service_role |
| `settings` | — | service_role |
| `coupons` | — | service_role |
| `abandoned_carts` | — | service_role |
| `email_subscribers` / `email_sent_log` | — | service_role |
| `analytics_events` | — | anon + auth (whitelist) |
| `page_views` | — | anon + auth (path NOT NULL) |

**Princípio**: `service_role` bypassa RLS, então o **backend pode tudo**. Browser usando anon key fica restrito ao que está nas policies.

### 2.5 Funções com `SECURITY DEFINER`

```sql
alter function public.set_updated_at()  set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.purge_old_logs()  set search_path = public, pg_temp;

-- Não podem ser executadas diretamente pela API pública
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

### 2.6 Privilege escalation bloqueado em `profiles`

RLS sozinho não impede um cliente autenticado de fazer `UPDATE profiles SET role='ADMIN' WHERE id=auth.uid()` — a policy `profiles_own_update` libera a linha mas não as colunas. Por isso usamos grants de coluna:

```sql
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

-- Cliente só pode atualizar o próprio display_name
grant update (display_name) on public.profiles to authenticated;
```

Resultado: `role`, `email`, `provider`, `id`, `created_at` só podem ser modificados via `service_role` (backend). Cliente não consegue se promover.

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
- `payment.schemas.js` — `customer`, `items`, `cupom`, `attribution`
- `product.schemas.js` — campos de produto na criação/edição (também valida URLs contra `javascript:`/`data:` em fases recentes)

Aplicado via `middleware/validate.middleware.js`:

```js
router.post('/produtos', validateBody(productSchema), createProduct);
```

---

## 3. Dados sensíveis nunca expostos

| Dado | Onde está | Cliente acessa? |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` backend / Vercel Production | ❌ |
| `MERCADOPAGO_ACCESS_TOKEN` | idem | ❌ |
| `WEBHOOK_SECRET` | idem | ❌ |
| `ADMIN_SESSION_SECRET` | idem | ❌ |
| `CUSTOMER_SESSION_SECRET` | idem | ❌ |
| `DOWNLOAD_TOKEN_SECRET` | idem | ❌ |
| `CRON_SECRET` | idem | ❌ |
| `RESEND_API_KEY` (via SMTP_PASS) | idem | ❌ |
| `settings.adminConfig.totpSecret` | tabela `settings` | ❌ (RLS service-only) |
| `settings.adminConfig.fallbackPin` (hash bcrypt) | tabela `settings` | ❌ (RLS service-only) |
| `VITE_SUPABASE_ANON_KEY` | `.env` frontend | ✅ (por design, pública) |
| `VITE_SUPABASE_URL` | `.env` frontend | ✅ (por design, pública) |
| `VITE_GA4_ID` / `VITE_META_PIXEL_ID` | `.env` frontend | ✅ (por design, públicas) |

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
  await logSecurityEvent('webhook_invalid_signature', { ip, paymentId });
  return res.status(401).send();
}
```

Sem assinatura válida → 401 + evento em `security_events`.

Em `APP_ENV=test` a validação é relaxada (apenas para testes integrados).

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

- Gerados pelo backend após pagamento aprovado
- Salvos em `download_tokens` com `expires_at` (TTL default 7 dias)
- URL pública: `/api/download?token=XYZ`
- Backend valida: token existe + não expirou + (sinaliza `used`)
- Marca `used=true` após primeiro download bem-sucedido (auditoria; não bloqueia re-download dentro do TTL)
- Loga em `download_logs` (IP + user agent + timestamp)
- Gera signed URL temporária do Supabase Storage (não expõe URL direta)
- Resposta inclui `Referrer-Policy: no-referrer` antes do pipe — token não vaza no `Referer` para destino externo

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

Migration [`20260526100000_phase2_log_retention.sql`](../../supabase/migrations/20260526100000_phase2_log_retention.sql) cria a função `public.purge_old_logs()` e agenda via `pg_cron`:

| Tabela | Retenção | Justificativa |
|---|---|---|
| `download_logs` | 12 meses | Cobre auditoria de fraude e disputas |
| `analytics_events` | 24 meses | Permite comparação YoY |
| `security_events` | 6 meses | Suficiente para investigar incidentes recentes |

Job agendado diariamente às 03:00 UTC. Se `pg_cron` não estiver habilitado no Supabase (`create extension pg_cron;`), a migration cai num `notice` e o purge precisa ser rodado manualmente:

```sql
select public.purge_old_logs();
```

---

## 9. Monitoramento de tentativas de fraude

Eventos passam por `lib/security-logger.js` que escreve em **três** destinos:

1. **stdout estruturado JSON** (`{ level, event, severity, ip, ... }`) — Vercel/Supabase captura.
2. **Tabela `public.security_events`** (RLS service-role only) — queryable do admin via SQL ou aba **Segurança**.
3. **`SECURITY_ALERT_WEBHOOK_URL`** (env opcional) — POST JSON pra Slack/Discord/Sentry. Em branco → pula.

### Eventos emitidos hoje

| `event_name` | Origem | Severidade | Quando dispara |
|---|---|---|---|
| `webhook_invalid_signature` | `api/webhook.js` | warn | HMAC do MP não bate fora de `APP_ENV=test` |
| `admin_login_failed` | `api/admin-login.js` | warn | Senha errada **ou** sessão sem `role=admin` |
| `verify_payment_email_mismatch` | `api/verify-payment.js` | warn | Order existe mas email não bate |

Email do usuário **nunca** é gravado em claro — só `sha256(email).slice(0, 16)` para correlação cross-event sem violar LGPD.

---

## 10. LGPD / Privacidade

### Princípios aplicados
- **Finalidade declarada** — Política de Privacidade em `/privacidade`
- **Minimização** — coletamos nome + email no checkout. CPF apenas se necessário para nota futura. Endereço não coletado (produto digital, regra H6)
- **Consentimento informado** — banner com Aceitar / Rejeitar / Personalizar (`ConsentBanner.jsx`)
- **Direito de oposição** — link de descadastro 1-clique em todo e-mail
- **Direito de exclusão** — implementado via admin (ainda não self-service para o usuário — pendência §13)
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
- Estado em `localStorage` via `utils/consent.js`

---

## 11. Auditoria periódica

### 11.1 Security Advisor do Supabase

```bash
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/check-advisor.js
```

Deve retornar **0 CRITICAL**. Os INFO "RLS Enabled No Policy" em `settings`, `download_tokens`, `download_logs`, `security_events`, `coupons`, `abandoned_carts`, `email_*` são **intencionais** (apenas service role acessa).

### 11.2 Rotação de secrets

**Cadência mínima: trimestral.** Marcar no calendário do administrador (Q1 jan, Q2 abr, Q3 jul, Q4 out).

Secrets a rotacionar (todos no `.env.local` + Vercel):

| Secret | Impacto da rotação | Ação extra |
|---|---|---|
| `ADMIN_SESSION_SECRET` | Logout forçado de admins | Avisar a equipe |
| `CUSTOMER_SESSION_SECRET` | Logout forçado de clientes | Sem ação |
| `DOWNLOAD_TOKEN_SECRET` | Nenhum (tokens são opacos) | — |
| `WEBHOOK_SECRET` | Precisa sincronizar com painel MP | Atualizar no painel MP **antes** do redeploy |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role muda — rotacionar via dashboard Supabase | Atualizar Vercel imediatamente |
| `MERCADOPAGO_ACCESS_TOKEN` | Pagamentos param se desincronizar | Gerar novo no painel MP **antes** de atualizar prod |
| `CRON_SECRET` | Workflow falha 401 até atualizar | Sincronizar GitHub Secrets |

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
- [ ] `NODE_ENV=production`
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
✅ HttpOnly cookies + HMAC-SHA256 + SameSite=Strict
✅ RLS em TODAS as 14 tabelas
✅ Service role NUNCA no frontend
✅ CSP estrita + HSTS + X-Frame-Options DENY
✅ Rate-limit em endpoints sensíveis
✅ Webhook MP com HMAC + idempotência
✅ Download token com TTL + signed URL Supabase + Referrer-Policy
✅ Senha: 8+ chars, upper, lower, digit (client + server)
✅ 2FA admin opcional (TOTP + PIN)
✅ Email mascarado em logs (sha256.slice(0,16))
✅ Logs com retenção: 12m (download), 24m (analytics), 6m (security)
✅ Banner LGPD bloqueando GA4/Pixel sem consent
✅ Privilege escalation bloqueado por GRANT de coluna em profiles
✅ Privilege definer functions com search_path fixo + revoke execute

🔁 Rotação de secrets: trimestral
🎯 Pen-test: anual (mínimo)
📅 Audit Security Advisor: a cada release
```
