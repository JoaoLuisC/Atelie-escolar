# Arquitetura — Ateliê da Escola

> Visão de alto nível. A documentação canônica e detalhada está em
> [ProjectDocs/](./ProjectDocs/) — em especial
> [02-ARQUITETURA](./ProjectDocs/02-ARQUITETURA.md),
> [04-BANCO-DE-DADOS](./ProjectDocs/04-BANCO-DE-DADOS.md) e
> [09-API-ENDPOINTS](./ProjectDocs/09-API-ENDPOINTS.md).

## Stack

React 19 + Vite + Tailwind no front; Express 5 + Supabase (Postgres) no back;
Mercado Pago para pagamento; Resend (SMTP) para e-mail. Deploy na Vercel
(funções em `api/**/*.js`) com espelho local via `server.js`.

## Estrutura de pastas

| Pasta | Responsabilidade |
|---|---|
| `src/` | App React (páginas, componentes, providers, services, hooks) |
| `src/components/admin/` | Painel administrativo (tabs, ui, utils) |
| `api/` | Handlers HTTP (1 arquivo por endpoint) — rodam na Vercel e no Express |
| `lib/` | Lógica de backend reutilizável (Supabase, sessões, e-mail, segurança, audit) |
| `routes/` | Roteamento Express (`api-compat.routes.js` monta os handlers de `api/*.js`; `auth.routes.js` monta `/auth/customer/*`) |
| `middleware/` | Tratamento de erro do Express (`notFoundHandler`/`errorHandler`) — só roda em dev |
| `services/` | Clients Supabase server-side |
| `utils/` | `AppError` (erro HTTP usado pelo `errorHandler`) |
| `supabase/` | `schema.sql` canônico + `migrations/` |
| `scripts/` | Utilitários de operação (diagnóstico Supabase, Management API, DNS) |

> **Não existe um BFF Express separado.** Todo endpoint servido pelo `server.js`
> é o mesmo módulo de `api/*.js` que a Vercel publica como função — o Express só
> muda o transporte. As rotas Express-only que existiam (`POST /produtos`,
> `GET /auth/me`, aliases `/payments/*`) foram removidas junto com o middleware
> de Bearer token/role e os schemas zod de `validation/`, porque descreviam um
> modelo de autenticação e validação que o sistema real não usa e que nunca
> rodava em produção. Autenticação é cookie HMAC; validação é inline nos
> handlers de `api/`.

## Camada de dados (tabelas)

Núcleo: `categories`, `products`, `orders`, `order_items`, `profiles`,
`user_products`. Entrega: `download_tokens`, `download_logs`. Funil/LGPD:
`analytics_events`, `security_events`, `page_views`. Conversão:
`coupons`, `abandoned_carts`. E-mail: `email_subscribers`, `email_sent_log`.
Config: `settings`. Auditoria: `admin_audit_log`.

`profiles.id`, `user_products.user_id` e `orders.customer_id` referenciam
`auth.users(id)` (cascade / set-null) — base do fluxo de exclusão LGPD.

## Superfície de API (resumo)

- **Catálogo público**: `/products`, `/product-details`, `/home-sections`, `/cross-sell`, `/sitemap.xml`
- **Checkout/pagamento**: `/create-payment`, `/verify-payment`, `/webhook`, `/validate-coupon`, `/abandoned-cart`, `/send-confirmation-email`
- **Cliente**: `/auth/customer/*`, `/customer-orders`, `/download`, `/me-delete-account` (LGPD §3.8)
- **Newsletter**: `/subscribe`, `/confirm-subscription`, `/unsubscribe`, `/cron-email-jobs`
- **Analytics**: `/track-event`
- **Admin** (endpoints de dados exigem cookie `admin_session`): `/admin-login`, `/admin-session`, `/admin-logout`,
  `/admin-dashboard`, `/admin-products`, `/admin-categories`, `/admin-coupons`, `/admin-orders`,
  `/admin-users`, `/admin-settings`, `/admin-upload-url`, `/admin-funnel`, `/admin-segments`,
  `/admin-kpis`, `/admin-cohort`, `/admin-abc-products`, `/admin-abc-customers`, `/admin-cleanup-events`

Endpoints admin de **escrita** (products, categories, coupons, orders, users, settings)
registram a ação em `admin_audit_log` (best-effort) via `lib/admin-audit.js`.

## Autenticação

- **Cliente**: Supabase Auth (e-mail/senha + Google OAuth PKCE). O backend valida o
  token e emite um cookie HttpOnly `customer_session` (HMAC, ver `lib/customer-session.js`).
- **Admin**: e-mail/senha + 2FA opcional (TOTP/PIN). Sessão é um cookie assinado
  (HMAC) `admin_session` (`sub:'admin'` + e-mail/role do admin logado, para
  não-repúdio no audit log — ver `lib/admin-session.js`).
  Em dev, `VITE_ALLOW_ADMIN_BYPASS=true` (condicionada a `import.meta.env.DEV`, inerte
  em produção) libera o painel sem sessão (bypass); as APIs continuam exigindo o
  cookie, então o painel mostra um aviso quando está em bypass sem login real.

## Segurança

RLS habilitado em todas as tabelas; tabelas sensíveis (`settings`, `download_tokens`,
`download_logs`, `security_events`, `page_views`, `coupons`, `abandoned_carts`,
`email_subscribers`, `email_sent_log`, `admin_audit_log`) ficam **sem policies** = service-role only.
Detalhes em [08-SEGURANCA](./ProjectDocs/08-SEGURANCA.md) e [SECURITY.md](./SECURITY.md).
