# 01 — Visão geral

> O que é esse projeto, para quem, que problema resolve, o que ele faz hoje, o que ainda não faz, e em que estágio está.

---

## O que é

**Ateliê da Escola** é uma plataforma de e-commerce de **produtos digitais** voltada a professores e educadores. A dona da loja (Profa. Marciar Cardoso) produz materiais pedagógicos — banners, painéis decorativos, atividades, kits temáticos — e vende em PDF/imagem para download imediato.

Não há logística física: depois do pagamento aprovado, o cliente baixa os arquivos diretamente pelo navegador via URL com token efêmero.

---

## Personas

| Persona               | Quem                           | O que faz no sistema                                                                                                             |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Visitante anônimo** | Professor procurando material  | Navega catálogo, filtra e ordena, lê depoimentos, vê preço                                                                       |
| **Cliente**           | Visitante que decidiu comprar  | Adiciona ao carrinho, faz checkout, paga, baixa arquivos, vê histórico de pedidos, exclui a própria conta (LGPD)                 |
| **Inscrito**          | Cliente que aceitou newsletter | Recebe sequência pós-compra, cross-sell, e-mails sazonais                                                                        |
| **Admin**             | Profa. Marciar (dona)          | Cria/edita produtos, vê pedidos, analisa Curva ABC, configura vitrine, gerencia cupons                                           |
| **Master**            | Time interno técnico           | Role já aceito no login admin (`profiles.role = MASTER`), hoje com as mesmas capacidades do admin; toda escrita cai no audit log |

Personas não-humanas (atores técnicos):

- **Mercado Pago** — processa pagamento e envia webhook quando aprovado.
- **Resend** — entrega e-mails transacionais (confirmação, reset de senha) e de marketing (newsletter, cross-sell).
- **GA4 + Meta Pixel** — recebem eventos do funil para análise comportamental e attribution.
- **GitHub Actions** — dispara cron horário de envio de e-mails (abandoned cart 1h/24h, pós-compra D+3/D+15/D+45, reativação 90d) que chama `/api/cron-email-jobs`.

---

## O que o sistema faz hoje (capacidades entregues)

### Catálogo e descoberta

- Página inicial com seções configuráveis (vitrine, destaques, mais vendidos)
- Listagem `/produtos` com filtro por categoria e faixa de preço, presets (`mais-vendidos`, `novidades`), ordenação (preço, novidade, vendas, nome) — não há busca textual na loja
- Página de produto `/produtos/:slug` com galeria de imagens, vídeos, descrição rica, FAQ, depoimentos, benefícios, cross-sell automático
- Schema.org `Product` + `Offer` em produto, sitemap dinâmico, meta tags por página
- Cards com line-clamp, lazy loading, skeleton, badge de categoria e selo de oferta

### Compra

- Carrinho client-side em `localStorage` (drawer slide-out, sem navegação)
- Checkout em página única com email + nome + cupom + pagamento (sem múltiplas etapas)
- Integração com Mercado Pago Checkout Pro (cartão, Pix, boleto)
- Polling de pagamento como fallback se webhook não chegar (4s em CheckoutPage, 10s em DownloadsPage)
- Validação de cupons server-side (`coupons` table com `discount_type`, `discount_value`, `valid_from`/`valid_until`, `max_uses`, `min_order_amount`, `applies_to`)
- Confirmação por e-mail logo após aprovação
- Conta Supabase provisionada automaticamente para comprador convidado (e-mail para definir senha)
- Carrinho abandonado salvo automaticamente e lembrado via cron

### Download protegido

- Token efêmero gerado quando pagamento é aprovado (idempotente por par pedido/produto)
- URL `/api/download?token=…` valida e consome o token (uso único, claim atômico) e redireciona para signed URL do Supabase Storage (5 min) ou URL externa
- `download_tokens` com `expires_at` + flag `used`
- Auditoria em `download_logs` (IP, user-agent, timestamp)
- `Referrer-Policy: no-referrer` evita vazamento do token

### Autenticação

- E-mail/senha via Supabase Auth — o BFF chama a API GoTrue por REST (`/auth/v1/signup`, `/auth/v1/token?grant_type=password`) e converte a resposta em cookie de sessão próprio
- Google OAuth via PKCE pelo Supabase Client; o backend só troca o accessToken por cookie HttpOnly no callback (`/api/auth/customer/google/callback`)
- Cookies HttpOnly assinados (HMAC-SHA256) separados para cliente e admin, TTL 8h
- Reset de senha por e-mail (`resetPasswordForEmail` → SMTP custom Resend)
- Política de senha: mín 8 chars (validado no backend); maiúscula, minúscula e dígito exigidos no formulário do frontend (enforcement server-side dessas classes depende da config do Supabase Auth)
- Admin com 2FA opcional (TOTP + PIN de recuperação)
- URL admin obscurecida `/painel-acesso-privado-atelie` (link "Painel admin" aparece no header apenas para sessão com role admin/master)
- Exclusão de conta LGPD em 2 passos (solicitação → confirmação por e-mail), com anonimização dos pedidos

### Painel admin (14 abas)

1. **Dashboard** — KPIs gerais (receita mês/total, pedidos, ticket médio, LTV, taxa de recompra), receita diária e por categoria, curva ABC, sparkline 14 dias
2. **Produtos** — wizard de criação/edição com galeria, vídeos, arquivo de download, FAQ, reviews e benefícios; pausar/ativar e excluir
3. **Desempenho** — desempenho de vendas por produto (pedidos aprovados)
4. **Categorias** — wizard com cor, badge, featured, sort_order
5. **Pedidos** — listagem, filtro por status, modal de detalhe
6. **Cupons** — CRUD de cupons via wizard (`/api/admin/coupons`)
7. **Faturamento** — série de faturamento de pedidos aprovados
8. **Comparativo** — comparação período-a-período (mês atual vs anterior, etc.)
9. **Funil** — visualização do funil (view_catalog → view_item → add_to_cart → begin_checkout → purchase) por período
10. **Análise** — Curva ABC de produtos + clientes + coorte 12 meses + export CSV
11. **Segmentos** — segmentação de subscribers por tags de lifecycle (ativo, recorrente, VIP, inativo 30/90/180d, categoria comprada)
12. **Usuários** — lista usuários, troca de papel (role) e revogação de acesso
13. **Vitrine** — configuração das seções da home (destaques, novidades, etc.)
14. **Segurança** — configuração do 2FA do admin (segredo TOTP + PIN de recuperação; backend só devolve flags, nunca os segredos)

### Marketing & retenção

- GA4 + Meta Pixel (carregados só com consentimento de marketing) disparando os eventos canônicos do funil (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, além de `view_catalog`, `view_cart`, `remove_from_cart`)
- UTMs persistentes em `localStorage` (TTL 30d) anexadas a `orders.attribution_data`
- Newsletter com double opt-in (`/confirmar-inscricao`) e descadastro idempotente (`/desinscrever`)
- Sequência pós-compra D+0 (confirmação) / D+3 (review) / D+15 (cross-sell) / D+45 (novidades da categoria)
- Campanha de reativação para inativos (janela 90–180d) com cupom `VOLTEI15`
- Banner LGPD com "Aceitar todos" / "Apenas essenciais"
- Cross-sell na página de produto por co-ocorrência de compra, com fallback por categoria

### Conformidade

- LGPD: banner de consentimento, double opt-in, descadastro 1-clique, exclusão de conta em 2 passos, retenção limitada (`download_logs` 12m, `analytics_events` 180d, `security_events` e `page_views` 6m, `email_sent_log` 90d, `admin_audit_log` 18m), email-mask em logs (`sha256.slice(0,16)`)
- WCAG: contraste AA validado em CI, fontes ≥ 16px em mobile, áreas de toque parcialmente ≥ 44px
- SEO: gate Lighthouse no CI (preset desktop) — Performance ≥ 80, Acessibilidade ≥ 90, SEO ≥ 90
- Acessibilidade: `aria-busy`, skeleton, mensagens de erro humanas

---

## O que o sistema ainda NÃO faz

Lista resumida — detalhes em [13-ROADMAP-PENDENCIAS](./13-ROADMAP-PENDENCIAS.md).

- ❌ **Mídia paga** (Google Ads, Meta Ads) — Fase 5 ainda não iniciada
- ❌ **Login admin com Google OAuth** — só e-mail/senha + 2FA opcional
- ❌ **A/B testing** (planejado com GrowthBook self-hosted na Fase 6)
- ❌ **Heatmaps** (planejado com Microsoft Clarity na Fase 6)
- ❌ **Submissão de sitemap** no Search Console — operacional pós-deploy
- ❌ **Validação Google OAuth em produção** — só testado em dev
- ❌ **Autenticação de domínio no Resend** (DKIM + SPF + DMARC) — pendente DNS
- ❌ **Pipeline WebP/AVIF** — adiada (catálogo < 200 produtos não justifica)
- ❌ **Backup automatizado de produção** — Supabase Free dá 7 dias; produção requer Pro
- ❌ **Imagem OG dedicada** (1200×630) — hoje o fallback de OG image em `SEO.jsx` é o `favicon.svg`

---

## Estágio atual

| Fase       | Conteúdo                                                                                                              | Status                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Fase 0** | Fundação técnica + mensuração (GA4, Pixel, UTM, `analytics_events`, funil, banner LGPD)                               | ✅ Código entregue                     |
| **Fase 1** | SEO técnico (slugs, meta, JSON-LD, sitemap, robots, fontes trim)                                                      | ✅ Código entregue                     |
| **Fase 2** | UX/conversão (refactor ProductsPage, selos de confiança no checkout + SocialProofStrip, Skeleton, CartDrawer, cupons) | ✅ Código entregue                     |
| **Fase 3** | Email marketing (double opt-in, 8 templates, sequência, abandoned cart, reativação 90d)                               | ✅ Código entregue                     |
| **Fase 4** | Dashboard analítico (Curva ABC, coorte, KPIs LTV/CAC)                                                                 | ✅ Código entregue                     |
| **Fase 5** | Aquisição paga (Google + Meta Ads)                                                                                    | ⏳ Não iniciada (~R$ 5.000/mês mínimo) |
| **Fase 6** | Otimização contínua (A/B test, heatmap, auditoria SEO mensal)                                                         | ⏳ Não iniciada                        |

**Bloqueio atual: operacional, não técnico.** Migrations precisam ser aplicadas, credenciais grátis plugadas (GA4 ID, Pixel ID, CRON_SECRET), domínio autenticado no Resend e Lighthouse validado pós-deploy. Detalhamento em [13-ROADMAP](./13-ROADMAP-PENDENCIAS.md).

---

## Stack resumida

| Camada    | Tecnologia                                      | Versão | Por quê                               |
| --------- | ----------------------------------------------- | ------ | ------------------------------------- |
| Frontend  | React                                           | 19     | UI                                    |
| Build     | Vite                                            | 8      | Dev server rápido + bundling          |
| Router    | React Router                                    | 7      | SPA navigation                        |
| Estilo    | Tailwind CSS                                    | 3.4    | Utility-first com brand-* customizado |
| Forms     | react-hook-form + zod                           | 7 / 4  | Validação client-side                 |
| Backend   | Express                                         | 5      | API REST como BFF                     |
| Banco     | Supabase (Postgres 17)                          | —      | DB + Auth + Storage                   |
| Pagamento | Mercado Pago SDK                                | 2      | Checkout Pro                          |
| Segurança | helmet + cors + express-rate-limit              | —      | Headers, CORS, throttle               |
| E-mail    | Resend (SMTP + Supabase Auth SMTP) + nodemailer | 9      | Free 3.000/mês                        |
| Testes    | Vitest + Testing Library                        | 4 / 16 | Unit + componente                     |
| Deploy    | Vercel                                          | —      | Serverless functions + estático       |
| Cron      | GitHub Actions                                  | —      | Free 2.000 min/mês                    |

Decisões e racional em [02-ARQUITETURA](./02-ARQUITETURA.md).

---

## Custos atuais

| Recurso        | Plano     | Custo mensal                                              |
| -------------- | --------- | --------------------------------------------------------- |
| Supabase       | Free      | R$ 0 (500MB DB, 50k MAU, 1GB Storage)                     |
| Vercel         | Hobby     | R$ 0 (100GB bandwidth)                                    |
| Resend         | Free      | R$ 0 (3.000 emails/mês)                                   |
| GA4            | Free      | R$ 0 (10M events/mês)                                     |
| Meta Pixel     | Free      | R$ 0 (ilimitado)                                          |
| GitHub Actions | Free      | R$ 0 (2.000 min/mês)                                      |
| Mercado Pago   | Por venda | 4,99% + R$ 0,40 por transação aprovada (não é assinatura) |
| Domínio        | Anual     | ~R$ 40/ano                                                |

**Custo recorrente fixo: R$ 0,00.** A primeira despesa recorrente real é a **Fase 5** (mídia paga, ~R$ 5.000/mês mínimo), e só se iniciará quando dados das Fases 0-4 justificarem o investimento. Ver [10-MARKETING-ANALYTICS §custos](./10-MARKETING-ANALYTICS.md).
