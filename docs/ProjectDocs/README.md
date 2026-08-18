# Ateliê da Escola — Documentação do Projeto

> Plataforma de vendas de materiais educativos digitais (banners, painéis, atividades pedagógicas) com download imediato após pagamento aprovado.
>
> **Stack**: React 19 + Vite + Tailwind + Express 5 + Supabase + Mercado Pago. Deploy em Vercel.

Esta pasta é a **fonte única de verdade** sobre o projeto. Toda decisão de produto, arquitetura, segurança e operação está aqui. Os MDs antigos em `docs/` (fora desta pasta) estão sendo descontinuados — esta é a versão consolidada.

---

## 📚 Índice da documentação

| #   | Documento                                             | Quando consultar                                                   |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| 01  | [Visão geral](./01-VISAO-GERAL.md)                    | Primeiro contato com o projeto, entender personas e capacidades    |
| 02  | [Arquitetura](./02-ARQUITETURA.md)                    | Mudanças estruturais, decisões de stack, organização de pastas     |
| 03  | [Setup](./03-SETUP.md)                                | Rodar o projeto localmente, configurar Supabase, MP, OAuth, Resend |
| 04  | [Banco de dados](./04-BANCO-DE-DADOS.md)              | Schema, tabelas, RLS, migrations                                   |
| 05  | [Fluxos (diagramas)](./05-FLUXOS.md)                  | Diagramas Mermaid de auth, checkout, admin, webhook                |
| 06  | [Fluxo de compra e venda](./06-FLUXO-COMPRA-VENDA.md) | Jornada completa do cliente + responsabilidades do vendedor        |
| 07  | [Dashboard admin](./07-DASHBOARD-ADMIN.md)            | As 14 abas do painel admin, KPIs, gestão de produtos/pedidos       |
| 08  | [Segurança](./08-SEGURANCA.md)                        | RLS, secrets, headers, auditoria, LGPD, modelo de ameaça           |
| 09  | [API endpoints](./09-API-ENDPOINTS.md)                | Referência de todos os endpoints REST (cliente + admin)            |
| 10  | [Marketing & analytics](./10-MARKETING-ANALYTICS.md)  | GA4, Meta Pixel, Curva ABC, email marketing, funil, cohort         |
| 11  | [Regras de negócio](./11-REGRAS-NEGOCIO.md)           | Princípios invioláveis, anti-padrões, checklist de PR              |
| 12  | [Deploy & operação](./12-DEPLOY-OPERACAO.md)          | Vercel, release checklist, troubleshooting, rotação de secrets     |
| 13  | [Roadmap & pendências](./13-ROADMAP-PENDENCIAS.md)    | Fases 5/6 (mídia paga + otimização), itens operacionais pendentes  |

---

## 🚀 Atalhos por tipo de tarefa

**"Quero rodar o projeto pela primeira vez"** → [03-SETUP](./03-SETUP.md)

**"Vou adicionar um endpoint novo"** → [02-ARQUITETURA](./02-ARQUITETURA.md) + [09-API-ENDPOINTS](./09-API-ENDPOINTS.md) + [08-SEGURANCA §rate-limit](./08-SEGURANCA.md)

**"Vou mexer no fluxo de checkout"** → [06-FLUXO-COMPRA-VENDA](./06-FLUXO-COMPRA-VENDA.md) + [05-FLUXOS §5](./05-FLUXOS.md) + [11-REGRAS-NEGOCIO §G](./11-REGRAS-NEGOCIO.md)

**"Vou criar uma tabela nova"** → [04-BANCO-DE-DADOS](./04-BANCO-DE-DADOS.md) + [08-SEGURANCA §RLS](./08-SEGURANCA.md)

**"Vou subir alteração para produção"** → [12-DEPLOY-OPERACAO §release checklist](./12-DEPLOY-OPERACAO.md)

**"Estou planejando uma campanha"** → [10-MARKETING-ANALYTICS](./10-MARKETING-ANALYTICS.md) + [11-REGRAS-NEGOCIO §C-D](./11-REGRAS-NEGOCIO.md)

**"Algo quebrou em produção"** → [12-DEPLOY-OPERACAO §troubleshooting](./12-DEPLOY-OPERACAO.md)

---

## 🎯 O que essa loja faz

- ✅ Visitante navega catálogo, filtra, ordena e adiciona ao carrinho
- ✅ Cliente faz checkout integrado com Mercado Pago (cartão, Pix, boleto)
- ✅ Após aprovação, libera **download automático** dos arquivos comprados via token efêmero
- ✅ Admin gerencia produtos (com galeria + vídeos + FAQ + reviews + benefícios), categorias, pedidos, vitrine, usuários, cupons
- ✅ Auth com Supabase (e-mail/senha + Google OAuth com PKCE) + recuperação por e-mail
- ✅ Admin com **2FA opcional** (TOTP + PIN de recuperação)
- ✅ Acesso admin via URL obscurecida (`/painel-acesso-privado-atelie`); cliente logado com papel admin vê link "Painel admin" no header
- ✅ E-mail transacional via **Resend** (confirmação de compra); reset de senha sai pelo Supabase Auth e só passa pelo Resend com o SMTP customizado configurado ([03-SETUP §5](./03-SETUP.md))
- ✅ Newsletter com **double opt-in** e descadastro idempotente
- ✅ **Analytics completo**: GA4 + Meta Pixel + tabela própria `analytics_events`
- ✅ **Dashboard analítico**: KPIs, funil, Curva ABC (produtos + clientes), coorte, segmentos, LTV/CAC
- ✅ **SEO completo**: slugs, meta tags, schema.org, sitemap dinâmico, robots
- ✅ **LGPD**: banner de consentimento, double opt-in, exclusão de conta em 2 passos, dados pessoais minimizados, retenção limitada
- ✅ **Carrinho abandonado**: salvamento + lembretes por e-mail (1h/24h)
- ✅ **E-mails automáticos de ciclo de vida** via cron horário: pós-compra (D+3/D+15/D+45) e reativação 90d
- ✅ **Cupons** com cálculo server-side
- ✅ **Cross-sell** automático na página de produto

---

## 🗂️ Estrutura física do repo (resumida)

```
Projeto-mae/
├── api/                  # Vercel serverless functions (40+ endpoints)
├── routes/               # Express routes (auth, products, payment, api-compat)
├── middleware/           # Auth, error, validate
├── lib/                  # Camada de serviço backend (supabase, sessions, MP, email…)
├── services/             # supabase-auth helpers
├── validation/           # Schemas Zod (payment, product)
├── utils/                # AppError genérico
├── src/                  # Frontend React
│   ├── pages/            # Páginas (Home, Produtos, Checkout, Admin, …)
│   ├── components/       # UI compartilhada + admin/ (14 abas + ui/ + utils/)
│   ├── providers/        # Auth, Cart, Toast
│   ├── hooks/            # useAuth, useCart, useToast, useProductFilters
│   ├── services/         # admin-auth, admin-panel, admin-products, customer-auth, products, supabase-browser
│   ├── utils/            # analytics, api, attribution, cart-storage, consent, csv-export, currency
│   ├── constants/        # Rotas (routes.js)
│   ├── types/            # (vazia)
│   └── test/             # Setup do Vitest
├── supabase/             # schema.sql + security-hardening.sql + seed + migrations/
├── scripts/              # check-advisor, check-utf8, configure-auth, db-inspect, fix-dns, fix-utf8
├── public/               # robots.txt + favicon.svg (og-default.png pendente — ver [13-ROADMAP](./13-ROADMAP-PENDENCIAS.md))
├── server.js             # Bootstrap Express
├── vite.config.js
├── vercel.json
├── tailwind.config.js
└── package.json
```

Detalhamento em [02-ARQUITETURA](./02-ARQUITETURA.md).

---

## 📞 Contato

- E-mail técnico: `desenvolvimento@oqtem.com`
- E-mail da loja: `contato@profamarciarcardoso.com.br`
- Issues: GitHub Issues do repo `Atelie-escolar`

---

## 📝 Convenções

- **Sempre** ler [11-REGRAS-NEGOCIO](./11-REGRAS-NEGOCIO.md) antes de abrir PR em fluxo de cliente / pagamento / admin.
- **Sempre** atualizar este `ProjectDocs/` no mesmo PR que mudar comportamento documentado.
- Tabela nova nasce com RLS. Endpoint público novo nasce com rate-limit. Schema Zod nasce com testes.
- Commits seguem [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- Idioma da documentação e dos commits: **português brasileiro** (código permanece em inglês).
