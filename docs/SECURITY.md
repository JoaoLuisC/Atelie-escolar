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
- `helmet()` — CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- `cors()` — allowlist explícita em prod; permissivo em dev (apenas `localhost:*`)
- `rate-limit` global — 250 req/15min global; 30 req/15min em `/auth/*`
- `rate-limit` em `/admin-login` — **5 tentativas falhas / 10 min** (definido em [routes/api-compat.routes.js](../routes/api-compat.routes.js); `skipSuccessfulRequests: true` para não punir admin legítimo fazendo logins repetidos)
- `rate-limit` em `/auth/customer/login` — 5 tentativas / 10 min
- HTTPS only em produção (configurado pelo Vercel)

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

---

## Auditoria periódica

### Security Advisor do Supabase

```bash
SUPABASE_PAT='sbp_xxx' SUPABASE_PROJECT_REF='abc' node scripts/check-advisor.js
```

Deve retornar **0 CRITICAL**. Os INFO "RLS Enabled No Policy" em `settings`, `download_tokens` e `download_logs` são **intencionais** (apenas service role acessa).

### Rotação de secrets

Recomendação trimestral:
1. Gere novos secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Atualize `.env.local` e variáveis do Vercel
3. Redeploy
4. Sessões ativas serão invalidadas (usuários terão de logar de novo)

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
