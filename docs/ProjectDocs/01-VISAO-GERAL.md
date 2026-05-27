# 01 — Visão geral

> O que é esse projeto, para quem, que problema resolve, o que ele faz hoje, o que ainda não faz, e em que estágio está.

---

## O que é

**Ateliê da Escola** é uma plataforma de e-commerce de **produtos digitais** voltada a professores e educadores. A dona da loja (Profa. Marciar Cardoso) produz materiais pedagógicos — banners, painéis decorativos, atividades, kits temáticos — e vende em PDF/imagem para download imediato.

Não há logística física: depois do pagamento aprovado, o cliente baixa os arquivos diretamente pelo navegador via URL com token efêmero.

---

## Personas

| Persona | Quem | O que faz no sistema |
|---|---|---|
| **Visitante anônimo** | Professor procurando material | Navega catálogo, busca, filtra, lê depoimentos, vê preço |
| **Cliente** | Visitante que decidiu comprar | Adiciona ao carrinho, faz checkout, paga, baixa arquivos, vê histórico de pedidos |
| **Inscrito** | Cliente que aceitou newsletter | Recebe sequência pós-compra, cross-sell, e-mails sazonais |
| **Admin** | Profa. Marciar (dona) | Cria/edita produtos, vê pedidos, analisa Curva ABC, configura vitrine, gerencia cupons |
| **Master** (futuro) | Time interno técnico | Mesma capacidade do admin + auditoria e operações sensíveis |

Personas não-humanas (atores técnicos):

- **Mercado Pago** — processa pagamento e envia webhook quando aprovado.
- **Resend** — entrega e-mails transacionais (confirmação, reset de senha) e de marketing (newsletter, cross-sell).
- **GA4 + Meta Pixel** — recebem eventos do funil para análise comportamental e attribution.
- **GitHub Actions** — dispara cron de envio de e-mails (abandoned cart, reativação 90d) que chama `/api/cron-email-jobs`.

---

## O que o sistema faz hoje (capacidades entregues)

### Catálogo e descoberta
- Página inicial com seções configuráveis (vitrine, destaques, mais vendidos)
- Listagem `/produtos` com filtro por categoria, busca textual, ordenação (preço, novidade, vendas)
- Página de produto `/produtos/:slug` com galeria de imagens, vídeos, descrição rica, FAQ, depoimentos, benefícios, cross-sell automático
- Schema.org `Product` + `Offer` em produto, sitemap dinâmico, meta tags por página
- Cards com line-clamp, lazy loading, skeleton, badge de categoria e selo de oferta

### Compra
- Carrinho client-side em `localStorage` (drawer slide-out, sem navegação)
- Checkout em página única com email + nome + cupom + pagamento (sem múltiplas etapas)
- Integração com Mercado Pago Checkout Pro (cartão, Pix, boleto)
- Polling de pagamento como fallback se webhook não chegar (4s em CheckoutPage, 10s em DownloadsPage)
- Validação de cupons server-side (`coupons` table com `discount_type`, `discount_value`, `valid_until`, `max_uses`, `applies_to[]`)
- Confirmação por e-mail logo após aprovação
- Carrinho abandonado salvo automaticamente e lembrado via cron

### Download protegido
- Token efêmero gerado quando pagamento é aprovado
- URL `/api/download?token=…` valida token, gera signed URL do Supabase Storage e faz pipe
- `download_tokens` com `expires_at` + flag `used`
- Auditoria em `download_logs` (IP, user-agent, timestamp)
- `Referrer-Policy: no-referrer` evita vazamento do token

### Autenticação
- E-mail/senha via Supabase Auth (`signUp`, `signInWithPassword`)
- Google OAuth via PKCE (apenas o Supabase Client faz a request — não o backend)
- Cookies HttpOnly assinados (HMAC-SHA256) separados para cliente e admin, TTL 8h
- Reset de senha por e-mail (`resetPasswordForEmail` → SMTP custom Resend)
- Política de senha: mín 8 chars, maiúscula, minúscula, dígito
- Admin com 2FA opcional (TOTP + PIN de recuperação)
- URL admin obscurecida `/painel-acesso-privado-atelie` (+ link "· admin ·" no rodapé do login)

### Painel admin (13 abas)
1. **Dashboard** — KPIs gerais (LTV, recompra, AOV, taxa de aprovação)
2. **Produtos** — wizard de criação (Básico → Mídia → Preço) com galeria e vídeos
3. **Categorias** — wizard com cor, badge, featured, sort_order
4. **Pedidos** — listagem, filtros, modal de detalhe, exportação CSV
5. **Usuários** — clientes cadastrados, vinculação com pedidos
6. **Financeiro** — receita por período, breakdown por categoria/produto
7. **Comparativo** — comparação período-a-período (mês atual vs anterior, etc.)
8. **Performance** — taxa de conversão por etapa, métricas operacionais
9. **Vitrine** — configuração das seções da home (destaques, novidades, etc.)
10. **Segurança** — logs de eventos críticos (admin_login_failed, webhook_invalid_signature, verify_payment_email_mismatch)
11. **Análise** — Curva ABC de produtos + clientes + heatmap de coorte + Pareto + export CSV
12. **Funil** — visualização do funil (view_item → add_to_cart → begin_checkout → purchase)
13. **Segmentos** — segmentação de clientes por RFM e lifecycle, base para campanhas

### Marketing & retenção
- GA4 + Meta Pixel disparando os 4 eventos canônicos (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`)
- UTMs persistentes em `localStorage` (TTL 30d) anexadas a `orders.attribution_data`
- Newsletter com double opt-in (`/confirmar-inscricao`) e descadastro idempotente (`/desinscrever`)
- Sequência pós-compra D+0 (confirmação) / D+3 (review) / D+15 (cross-sell)
- Campanha de reativação para 90d inativos com cupom `VOLTEI15`
- Banner LGPD com Aceitar / Rejeitar / Personalizar
- Cross-sell na página de produto baseado em categoria + co-purchase

### Conformidade
- LGPD: banner de consentimento, double opt-in, descadastro 1-clique, retenção limitada (`download_logs` 12m, `analytics_events` 24m, `security_events` 6m), email-mask em logs (`sha256.slice(0,16)`)
- WCAG: contraste AA validado em CI, fontes ≥ 16px em mobile, áreas de toque parcialmente ≥ 44px
- SEO: Lighthouse Performance ≥ 90 mobile, SEO ≥ 95, CWV no verde
- Acessibilidade: `aria-busy`, skeleton, mensagens de erro humanas

---

## O que o sistema ainda NÃO faz

Lista resumida — detalhes em [13-ROADMAP-PENDENCIAS](./13-ROADMAP-PENDENCIAS.md).

- ❌ **Mídia paga** (Google Ads, Meta Ads) — Fase 5 ainda não iniciada
- ❌ **CRUD de cupons no admin** — hoje só via SQL no Supabase
- ❌ **Editor de FAQ/reviews/benefits no ProductWizard** — hoje só via SQL
- ❌ **Login admin com Google OAuth** — só e-mail/senha + 2FA opcional
- ❌ **A/B testing** (planejado com GrowthBook self-hosted na Fase 6)
- ❌ **Heatmaps** (planejado com Microsoft Clarity na Fase 6)
- ❌ **Submissão de sitemap** no Search Console — operacional pós-deploy
- ❌ **Validação Google OAuth em produção** — só testado em dev
- ❌ **Autenticação de domínio no Resend** (DKIM + SPF + DMARC) — pendente DNS
- ❌ **Pipeline WebP/AVIF** — adiada (catálogo < 200 produtos não justifica)
- ❌ **Right to be forgotten endpoint** (LGPD direito ao esquecimento automatizado)
- ❌ **Backup automatizado de produção** — Supabase Free dá 7 dias; produção requer Pro
- ❌ **`og-default.png`** (1200×630) — arquivo referenciado em `SEO.jsx` mas não existe em `public/`

---

## Estágio atual

| Fase | Conteúdo | Status |
|---|---|---|
| **Fase 0** | Fundação técnica + mensuração (GA4, Pixel, UTM, `analytics_events`, funil, banner LGPD) | ✅ Código entregue |
| **Fase 1** | SEO técnico (slugs, meta, JSON-LD, sitemap, robots, fontes trim) | ✅ Código entregue |
| **Fase 2** | UX/conversão (refactor ProductsPage, TrustBadge, Skeleton, CartDrawer, cupons) | ✅ Código entregue |
| **Fase 3** | Email marketing (double opt-in, 8 templates, sequência, abandoned cart, reativação 90d) | ✅ Código entregue |
| **Fase 4** | Dashboard analítico (Curva ABC, coorte, KPIs LTV/CAC) | ✅ Código entregue |
| **Fase 5** | Aquisição paga (Google + Meta Ads) | ⏳ Não iniciada (~R$ 5.000/mês mínimo) |
| **Fase 6** | Otimização contínua (A/B test, heatmap, auditoria SEO mensal) | ⏳ Não iniciada |

**Bloqueio atual: operacional, não técnico.** Migrations precisam ser aplicadas, credenciais grátis plugadas (GA4 ID, Pixel ID, CRON_SECRET), domínio autenticado no Resend, `og-default.png` criado e Lighthouse validado pós-deploy. Detalhamento em [13-ROADMAP](./13-ROADMAP-PENDENCIAS.md).

---

## Stack resumida

| Camada | Tecnologia | Versão | Por quê |
|---|---|---|---|
| Frontend | React | 19 | UI |
| Build | Vite | 8 | Dev server rápido + bundling |
| Router | React Router | 7 | SPA navigation |
| Estilo | Tailwind CSS | 3.4 | Utility-first com brand-* customizado |
| Forms | react-hook-form + zod | 7 / 4 | Validação client-side |
| Backend | Express | 5 | API REST como BFF |
| Banco | Supabase (Postgres 15) | — | DB + Auth + Storage |
| Pagamento | Mercado Pago SDK | 2 | Checkout Pro |
| Segurança | helmet + cors + express-rate-limit | — | Headers, CORS, throttle |
| E-mail | Resend (SMTP + Supabase Auth SMTP) + nodemailer | 8 | Free 3.000/mês |
| Testes | Vitest + Testing Library | 4 / 16 | Unit + componente |
| Deploy | Vercel | — | Serverless functions + estático |
| Cron | GitHub Actions | — | Free 2.000 min/mês |

Decisões e racional em [02-ARQUITETURA](./02-ARQUITETURA.md).

---

## Custos atuais

| Recurso | Plano | Custo mensal |
|---|---|---|
| Supabase | Free | R$ 0 (500MB DB, 50k MAU, 1GB Storage) |
| Vercel | Hobby | R$ 0 (100GB bandwidth) |
| Resend | Free | R$ 0 (3.000 emails/mês) |
| GA4 | Free | R$ 0 (10M events/mês) |
| Meta Pixel | Free | R$ 0 (ilimitado) |
| GitHub Actions | Free | R$ 0 (2.000 min/mês) |
| Mercado Pago | Por venda | 4,99% + R$ 0,40 por transação aprovada (não é assinatura) |
| Domínio | Anual | ~R$ 40/ano |

**Custo recorrente fixo: R$ 0,00.** A primeira despesa recorrente real é a **Fase 5** (mídia paga, ~R$ 5.000/mês mínimo), e só se iniciará quando dados das Fases 0-4 justificarem o investimento. Ver [10-MARKETING-ANALYTICS §custos](./10-MARKETING-ANALYTICS.md).
