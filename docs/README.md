# Ateliê da Escola — Documentação

> Plataforma de vendas de materiais educativos digitais (banners, painéis, atividades pedagógicas) com download imediato após pagamento aprovado.

## Índice

- [Visão geral](#visão-geral)
- [Stack técnico](#stack-técnico)
- [Setup local](#setup-local)
- [Documentos relacionados](#documentos-relacionados)

---

## Visão geral

Aplicação **React SPA + Express API + Supabase + Mercado Pago**:

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Browser (React) │──HTTP─▶│  Express API     │──REST▶│  Supabase        │
│  Vite :5173      │       │  Node :3000      │       │  Auth + Postgres │
└──────────────────┘       └────────┬─────────┘       └──────────────────┘
                                    │
                                    └──HTTPS──▶ Mercado Pago
                                               (criar preferência,
                                                webhook, verify)
```

**Personas**:
- **Cliente** — visitante/comprador. Navega catálogo, faz checkout, baixa arquivos.
- **Admin** — dona da loja (Profa. Marciar). Gerencia produtos, categorias, pedidos, vitrine.

**Funcionalidades-chave**:
- Catálogo público com filtros (categoria, preço, novidades/mais vendidos) e ordenação — sem busca textual (inputs de busca existem só no admin)
- Carrinho client-side (localStorage)
- Checkout integrado com Mercado Pago (cartão / pix / boleto)
- Cupons de desconto (percentual/fixo, validação server-side)
- Polling de pagamento (sem precisar de webhook em dev)
- Área de downloads protegida por token de uso único
- Painel admin com 14 abas (dashboard, produtos, desempenho de produtos, categorias, pedidos, cupons, faturamento, comparativo, funil, análise, segmentos, usuários, vitrine, segurança)
- Auth com Supabase: e-mail/senha + Google OAuth (PKCE) + recuperação por e-mail
- 2FA opcional para admin (TOTP + PIN de recuperação)
- Acesso admin via URL obscurecida `/painel-acesso-privado-atelie`
- E-mail transacional via **Resend** (confirmação de compra, newsletter e cron; 3.000/mês free); reset de senha sai pelo SMTP custom do Supabase Auth
- Newsletter com double opt-in + e-mails automáticos via cron (carrinho abandonado 1h/24h, pós-compra D+3/D+15/D+45, reativação 90 dias)
- LGPD: banner de consentimento, exclusão de conta em 2 passos e purga automática de logs (pg_cron)

---

## Stack técnico

| Camada | Tecnologia | Versão | Motivo |
|--------|------------|--------|--------|
| Frontend | React | 19 | UI |
| Build | Vite | 8 | Dev server + bundling |
| Roteamento | React Router | 7 | SPA navigation |
| Estilo | Tailwind CSS | 3.4 | Utility-first, todo customizado em `brand-*` |
| Forms | react-hook-form + zod | 7 / 4 | Validação client-side |
| Backend | Express | 5 | API REST |
| Database | Supabase (Postgres 17) | — | DB + Auth + Storage |
| Pagamento | Mercado Pago SDK | 2 | Checkout Pro |
| Segurança | helmet + cors + rate-limit | — | Headers, CORS, throttle (5/10min em login admin e cliente; limiters ativos só no Express/dev) |
| E-mail (app) | nodemailer | 9 | SMTP via Resend (confirmação de pedido, newsletter, e-mails do cron) |
| E-mail (auth) | Supabase Auth SMTP custom | — | Reset senha + signup confirm via Resend |
| Testes | Vitest + Testing Library | 4 / 16 | Unit + componente |
| Deploy | Vercel | — | Funções serverless (`@vercel/node`) + estático |

**Arquitetura escolhida**: SPA puro + BFF (Backend for Frontend) em Express. O Express é responsável por:
- Validar input e proxy seguro pro Supabase (esconde service_role do browser)
- Gerar/validar cookies HttpOnly de sessão
- Integração com Mercado Pago (esconde access_token)
- Webhook handler

---

## Setup local

### Pré-requisitos
- Node.js ≥ 20
- Conta Supabase + credenciais
- Conta Mercado Pago (TEST para dev) + credenciais

### Passos

```bash
# 1. Clonar e instalar deps
git clone <repo>
cd Projeto-mae
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local
# Edite .env.local — veja docs/SETUP.md para cada chave
# Lembretes:
# - Supabase URL + ANON + SERVICE_ROLE (obrigatório)
# - Mercado Pago TEST tokens (pra dev) ou APP_USR (prod)
# - SMTP do Resend (email de pedido, newsletter e e-mails do cron; o reset de senha
#   sai pelo SMTP custom do Supabase Auth, configurado no dashboard — ver docs/SETUP.md)
# - Segredos: ADMIN_SESSION_SECRET, CUSTOMER_SESSION_SECRET, WEBHOOK_SECRET, DOWNLOAD_TOKEN_SECRET
#   (gere cada um com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)

# 3. Aplicar schema + dados no banco
# Opção A — pelo SQL Editor do dashboard Supabase:
#   Cole supabase/schema.sql e rode
#   Cole supabase/security-hardening.sql e rode
#   Cole supabase/seed-sample-data.sql e rode (popular dados de exemplo)
# Opção B — via Supabase CLI (aplica supabase/migrations/):
#   npm run supabase:link
#   npm run supabase:db:push
# Conferir os security advisors depois (opcional):
#   SUPABASE_PAT='sbp_...' SUPABASE_PROJECT_REF='abc' node scripts/check-advisor.js

# 4. Rodar dev (frontend + API juntos)
npm run dev:all

# Frontend → http://localhost:5173
# API      → http://localhost:3000
```

### Scripts úteis

```bash
npm run dev              # só Vite (5173)
npm run dev:api          # só Express (3000)
npm run dev:all          # ambos com concurrently
npm run build            # produção
npm run test             # vitest run
npm run check            # test + build (CI)
```

---

## Documentos relacionados

### Estratégia e regras (consultar antes de qualquer mudança)

| Documento | Sobre |
|-----------|-------|
| [PLANO_ECOMMERCE.md](./NextFeatures/PLANO_ECOMMERCE.md) | Plano de implementação em 6 fases para chegar a um e-commerce de alta qualidade (absorve o antigo `plano-melhorias-fluxo-cliente.md`) |
| [REGRAS_ECOMMERCE.md](./NextFeatures/REGRAS_ECOMMERCE.md) | Princípios invioláveis, anti-padrões e checklist obrigatório antes de PRs |
| [PENDENCIAS.md](./NextFeatures/PENDENCIAS.md) | Lista única e atual de pendências de execução por fase (substitui os antigos `FASE*_PENDENCIAS` e `MELHORIAS_CLIENTE_PENDENCIAS`) |
| [PLANO_SEGURANCA.md](./NextFeatures/PLANO_SEGURANCA.md) | Plano de hardening de segurança |

### Técnico

| Documento | Sobre |
|-----------|-------|
| [ProjectDocs/](./ProjectDocs/README.md) | Suíte consolidada em 13 volumes (visão geral, arquitetura, setup, banco, fluxos, admin, segurança, API, marketing, deploy, roadmap) — versão que está substituindo os MDs avulsos abaixo |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Estrutura de pastas, dependências, decisões |
| [FLOWS.md](./FLOWS.md) | Fluxogramas (auth, checkout, admin, mídia) |
| [SETUP.md](./SETUP.md) | Setup detalhado de Supabase, Google OAuth, Mercado Pago |
| [SECURITY.md](./SECURITY.md) | RLS, autenticação, dados sensíveis |
| [SUPABASE-SETUP.md](./SUPABASE-SETUP.md) | Setup específico do Supabase (legado) |
| [RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md) | Pré-deploy |
| [SPRING-SECURITY-BFF.md](./SPRING-SECURITY-BFF.md) | Referência de port para Spring Boot do BFF de auth (não usado em produção) |
| [REVIEW-PROMPTS.md](./REVIEW-PROMPTS.md) | Prompts de review profundo por área |
| [REVIEW-RESULTS.md](./REVIEW-RESULTS.md) | Resultados dos reviews (área 9 em [REVIEW-AREA-9-TESTES.md](./REVIEW-AREA-9-TESTES.md)) |

---

## Suporte

- Issues: [GitHub Issues](https://github.com/seu-org/projeto-mae/issues)
- E-mail: contato@profamarciarcardoso.com.br
