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
- Catálogo público com filtro, busca e ordenação
- Carrinho client-side (localStorage)
- Checkout integrado com Mercado Pago (cartão / pix / boleto)
- Polling de pagamento (sem precisar de webhook em dev)
- Área de downloads protegida por token
- Painel admin com 10 abas (dashboard, produtos, categorias, pedidos, financeiro, comparativo, performance, usuários, vitrine, segurança)
- Auth com Supabase: e-mail/senha + Google OAuth (PKCE) + recuperação por e-mail
- 2FA opcional para admin (TOTP + PIN de recuperação)
- Acesso admin via URL obscurecida `/painel-acesso-privado-atelie` ou link "· admin ·" no rodapé do `/login`
- E-mail transacional via **Resend** (reset de senha + confirmação de compra; 3.000/mês free)

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
| Database | Supabase (Postgres 15) | — | DB + Auth + Storage |
| Pagamento | Mercado Pago SDK | 2 | Checkout Pro |
| Segurança | helmet + cors + rate-limit | — | Headers, CORS, throttle (5/10min em login admin e cliente) |
| E-mail (app) | nodemailer | 8 | SMTP de confirmação de pedido via Resend |
| E-mail (auth) | Supabase Auth SMTP custom | — | Reset senha + signup confirm via Resend |
| Testes | Vitest + Testing Library | 4 / 16 | Unit + componente |
| Deploy | Vercel | — | Edge functions + estático |

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
# - SMTP do Resend (pra reset de senha + email de pedido)
# - ADMIN_SESSION_SECRET (gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)

# 3. Aplicar schema + dados no banco
# Opção A — pelo SQL Editor do dashboard Supabase:
#   Cole supabase/schema.sql e rode
#   Cole supabase/security-hardening.sql e rode
#   Cole supabase/seed-sample-data.sql e rode (popular dados de exemplo)
# Opção B — via Management API com PAT:
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
| [PLANO_ECOMMERCE.md](./PLANO_ECOMMERCE.md) | Plano de implementação em 6 fases para chegar a um e-commerce de alta qualidade |
| [REGRAS_ECOMMERCE.md](./REGRAS_ECOMMERCE.md) | Princípios invioláveis, anti-padrões e checklist obrigatório antes de PRs |

### Técnico

| Documento | Sobre |
|-----------|-------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Estrutura de pastas, dependências, decisões |
| [FLOWS.md](./FLOWS.md) | Fluxogramas (auth, checkout, admin, mídia) |
| [SETUP.md](./SETUP.md) | Setup detalhado de Supabase, Google OAuth, Mercado Pago |
| [SECURITY.md](./SECURITY.md) | RLS, autenticação, dados sensíveis |
| [SUPABASE-SETUP.md](./SUPABASE-SETUP.md) | Setup específico do Supabase (legado) |
| [E2E-CHECKLIST-SANDBOX.md](./E2E-CHECKLIST-SANDBOX.md) | Checklist de testes end-to-end |
| [RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md) | Pré-deploy |
| [plano-melhorias-fluxo-cliente.md](./plano-melhorias-fluxo-cliente.md) | Refatoração de UX do fluxo do cliente — com status atualizado por item |
| [analise-paginas-cliente.md](./analise-paginas-cliente.md) | Análise histórica das páginas do cliente (pré-refactor) |
| [SPRING-SECURITY-BFF.md](./SPRING-SECURITY-BFF.md) | Referência de port para Spring Boot do BFF de auth (não usado em produção) |

---

## Suporte

- Issues: [GitHub Issues](https://github.com/seu-org/projeto-mae/issues)
- E-mail: contato@profamarciarcardoso.com.br
