# 10 — Roadmap

> Só o que está **em aberto**. Revisado contra o código em 27/10/2026. O que foi entregue sai deste
> documento — o histórico está no `git log`.
>
> Ordem de leitura: §1 fecha a loja v1 · §2 vale no dia em que outra professora tiver login · §3
> são decisões adiadas com gatilho · §4 são as fases de mídia paga e otimização · §5 é a v2
> (plataforma), adiada.

## Já entregue (contexto)

- Fases 0 a 4: mensuração (GA4/Pixel/UTM/funil), SEO, conversão, e-mail (sequência, carrinho
  abandonado, reativação, cron) e análise (Curva ABC, coorte, KPIs).
- Domínio `ateliedaescola.com.br` + Resend com DKIM/SPF/DMARC; loja em
  `professoramarcia.ateliedaescola.com.br`.
- Release automático: push em `main` aplica as migrations e faz o deploy
  (`.github/workflows/release-production.yml`).
- E-mail de confirmação na aprovação do pedido; estorno/chargeback queima os links.
- LGPD self-service (excluir conta, exportar dados), audit log do admin, validação dos links de
  mídia do produto.
- Papel de professor(a), dona da loja, painel da plataforma, recorte de pedidos/clientes por
  professora, login de professor(a) com Google, IA por botão, aba "Minha conta".

---

## §1. Para a loja v1 ficar 100% em produção

**Produção nunca teve um pedido real.** Tudo abaixo é ação do dono, fora do código.

### 1.1 Ações agora

| #   | Ação                                                                                                                                                                                                                                                                            | Por quê                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Vercel → Environment Variables (Production): `CORS_ORIGINS=https://professoramarcia.ateliedaescola.com.br,https://atelie-escolar.vercel.app,https://atelie-escolar-joao-luis-c.vercel.app` e **redeploy**                                                                       | A checagem anti-CSRF do painel usa essa lista; aberto por um endereço fora dela, toda escrita volta 403 "Origem não permitida" |
| 2   | Confirmar o e-mail da conta admin `jlcardosodev@gmail.com` (link que o Supabase mandou no cadastro)                                                                                                                                                                             | Até confirmar, o login pode ser recusado                                                                                       |
| 3   | A Profa. Márcia sair e entrar de novo no painel                                                                                                                                                                                                                                 | "Dona da loja" é gravado no cookie no login; a sessão dela é anterior                                                          |
| 4   | Configurar o 2º fator do admin (aba Segurança: app autenticador + PIN) e ligar "exigir 2º fator"                                                                                                                                                                                | Nunca foi configurado; hoje o admin entra só com senha                                                                         |
| 5   | **Compra real por Pix + estorno**, de ponta a ponta: pagar, receber o e-mail de confirmação, baixar, estornar no Mercado Pago e ver o pedido virar `refunded` e o link parar de funcionar. Na mesma rodada, a dona testa o "Continuar com Google" do cliente com uma conta real | Valida webhook, confirmação, downloads e estorno em produção, que só rodaram em sandbox                                        |
| 6   | `VITE_GA4_ID` e `VITE_META_PIXEL_ID` na Vercel (e no `.env.local`) e redeploy — são lidas no build                                                                                                                                                                              | Sem elas o rastreio fica desligado                                                                                             |
| 7   | Criar o cupom `VOLTEI15` (15%, aba Cupons) — ou mudar `REACTIVATION_COUPON_CODE`                                                                                                                                                                                                | O e-mail de reativação de 90 dias manda esse código; sem o cupom, ele não vale no checkout                                     |
| 8   | Search Console: adicionar o domínio, verificar (TXT no DNS da Vercel) e enviar `sitemap.xml`                                                                                                                                                                                    | Indexação                                                                                                                      |
| 9   | Apagar ou pausar o produto "teste" de R$ 123,00 e os pedidos de teste (`teste-qa@example.com`, `teste-qa-pago@example.com`), se ainda existirem                                                                                                                                 | Aparecem na loja e somam na receita do painel                                                                                  |
| 10  | [mail-tester.com](https://mail-tester.com) com um e-mail real da loja — alvo ≥ 9/10                                                                                                                                                                                             | Entregabilidade                                                                                                                |

Opcionais: caixa `contato@` (ImprovMX ou similar, MX na raiz — não conflita com o Resend, que
fica em `send`); `LHCI_GITHUB_APP_TOKEN` no GitHub para o Lighthouse comentar nos PRs;
`SECURITY_ALERT_WEBHOOK_URL` para alertas de segurança (ver [08-SEGURANCA](./08-SEGURANCA.md)).

### 1.2 Conferir depois da primeira venda real

- `orders.attribution_data` preenchido numa compra com `?utm_source=teste&utm_medium=email`.
- Linha nova em `email_sent_log` (confirmação e, depois, o cron).
- Jobs do `pg_cron` ativos — no SQL Editor: `select jobname, schedule, active from cron.job;`
  (o dump da CLI não enxerga o schema `cron`).
- GA4 (após ~7 dias) e Meta Events Manager mostrando `view_item`, `add_to_cart`,
  `begin_checkout`, `purchase`.
- Preview em [opengraph.xyz](https://www.opengraph.xyz/) e um produto aprovado no
  [Rich Results Test](https://search.google.com/test/rich-results).
- Lighthouse mobile: Performance ≥ 90, SEO ≥ 95 (se SEO < 95, ver §3).

### 1.3 Segredos antigos

| Problema                                                                                                                        | Onde                                          |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Credenciais antigas (`.env.production`, PATs do Supabase) continuam no histórico do git: rotacionar antes de pensar em expurgar | [08-SEGURANCA](./08-SEGURANCA.md), pendências |

Recorrentes de segurança (rotação de segredos, pen-test, checklist de release) moram em
[08-SEGURANCA](./08-SEGURANCA.md).

---

## §2. Antes de abrir para outra professora

Hoje só a loja da Profa. Márcia vende, e ela é a dona da loja. **Nada aqui é problema enquanto não
houver outro professor com login**; tudo vira bloqueante no dia em que houver. Conferido no código
em 27/10/2026.

| Pendência                            | Situação no código                                                                                                                                                                                                                                      | O que fazer                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **2º fator por conta**               | O 2º fator é um só, em `settings.adminConfig` (`lib/admin-2fa.js`), e só é pedido para admin/master (`handlers/admin/login.js`). Professor(a) — inclusive a dona da loja, que vê pedidos e clientes — entra sem 2º fator, por senha ou Google           | Segredo TOTP por `profiles.id`; exigir para quem vê dado de cliente. Com isso, o login Google de admin também fica possível (§3) |
| **Arquivo de outro professor**       | `handlers/teacher/products.js` só confere que o `download_url` é uma referência válida do bucket (`lib/product-media.js`), não de quem é. Um professor pode apontar o produto barato dele para o PDF de outro, comprar e baixar                         | Prefixo por vendedor no upload (`product_files/<seller_id>/…`) e exigir o prefixo na gravação do professor                       |
| **Área simples do professor**        | O professor comum digita o caminho do arquivo à mão (o upload assinado, `handlers/admin/upload-url.js`, e a IA, `handlers/admin/ai-assist.js`, só aceitam a sessão da loja); depois de criar, só consegue pausar/ativar — o PATCH grava apenas `active` | Upload com o prefixo acima, edição de nome/preço/descrição/imagens e os botões de IA na área `/professores`                      |
| **Moderação**                        | Produto de professor nasce `active: true` e entra direto na loja                                                                                                                                                                                        | Nascer inativo e o admin aprovar no painel da plataforma (`PlatformTab.jsx`)                                                     |
| **Dinheiro**                         | Todo pagamento cai numa conta Mercado Pago só (um token em variável de ambiente). `lib/seller-scope.js` calcula a parte de cada professora para o painel, mas não há split, comissão nem repasse                                                        | Split (ver §5) ou repasse manual registrado — decisão de negócio e fiscal                                                        |
| **Termos do professor**              | `/termos` (`src/pages/LegalPages.jsx`) cobre só a loja atual; não fala de quem vende                                                                                                                                                                    | Contrato do vendedor: licença do material, comissão, repasse, estorno/chargeback, retirada. Validar com contador                 |
| **`products.seller_id` obrigatório** | A coluna é nullable (`20261026000001_product_seller_ownership.sql`) para o catálogo legado                                                                                                                                                              | Atribuir os produtos sem dono no painel da plataforma e tornar a coluna `not null` numa migration nova                           |

---

## §3. Decisões adiadas (atacar quando o gatilho disparar)

| Item                             | Gatilho                            | O que fazer                                                                                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerender / SSR                  | Lighthouse SEO < 95 em produção    | A: `react-snap` no build (enumerar os slugs de `/produtos/:slug`). B: Home + página de produto em Next.js (caro)                                                                                                                                                              |
| Imagens WebP/AVIF por CDN        | Catálogo > 200 produtos (hoje ~50) | Cloudflare Images (US$ 5/mês por 100 mil) ou Imgix; URLs do Storage viram `imagens.ateliedaescola.com.br/<path>?w=400&fm=webp`; `srcset`/`sizes` em `ProductGrid.jsx`, `HomePage.jsx`, `ProductDetailsPage.jsx`. O limite de 500 kB por imagem no upload já segura o problema |
| Login de admin/master com Google | 2º fator por conta pronto (§2)     | Hoje `handlers/admin/login-google.js` devolve 403 para admin/master de propósito. Pedir o 2º fator depois do OAuth. Decidir: só um domínio (ex.: `@oqtem.com`) ou qualquer Gmail com perfil admin                                                                             |
| Card "Vendas por região"         | Quando a dona quiser o mapa        | O checkout passa a pedir a UF, grava em `orders.shipping_state` (coluna nova) e o `PendingDataCard` do `DashboardTab.jsx` vira o mapa                                                                                                                                         |

---

## §4. Fases 5 e 6 (não iniciadas)

Continuam fazendo sentido, mas só depois que a loja tiver dados. Detalhe das regras em
[07-NEGOCIO-E-MARKETING](./07-NEGOCIO-E-MARKETING.md).

**Fase 5 — Mídia paga (≈ R$ 5.000/mês no mínimo).** Gatilho: 30+ dias de funil rastreado, 50+
pedidos (Curva ABC com significado) e ROAS orgânico ≥ 3x. Escopo: Google Ads (genérica + categoria

- institucional), Meta Ads em funis frio/morno/quente, lookalike de clientes VIP, landing pages com
  message match, otimização para `purchase`, começar com R$ 30/dia e dobrar só com ROAS ≥ 3x.

**Fase 6 — Otimização contínua.** Reunião semanal de métricas, A/B mensal, auditoria de SEO
mensal, limpeza trimestral do catálogo, novos canais (Elo7, Shorts, parcerias). Stack gratuito:
Microsoft Clarity (heatmap) + GrowthBook self-hosted (A/B).

---

## §5. v2 — a plataforma (adiada)

> Retomar só com a v1 vendendo de verdade: ela vira a "loja nº 1" na migração. Pesquisa de
> 09/10/2026 — **taxas e condições de provedor mudam; reconfira antes de decidir.**

### Modelo

- **Marketplace:** professores cadastram e vendem os próprios materiais; o comprador tem uma conta
  só no ecossistema; a plataforma fica com uma % por venda.
- **White label:** o professor contrata um site próprio parecido com a loja atual (a v1 já é o
  primeiro), dentro do mesmo ecossistema — mesmo cadastro, mesmo pagamento, mesma comissão. Site e
  manutenção cobrados à parte.
- **Domínios:** `ateliedaescola.com.br` → marketplace (hoje redireciona para a loja da Márcia);
  `<professor>.ateliedaescola.com.br` → loja de cada um; `www.lojadocliente.com.br` → domínio
  próprio do white label.

Requisitos respondidos em 09/10/2026:

| Requisito                                  | Resposta                          | Consequência                                                |
| ------------------------------------------ | --------------------------------- | ----------------------------------------------------------- |
| Carrinho com professores diferentes        | Sim, essencial                    | Elimina o Mercado Pago 1:1 (um vendedor por pagamento)      |
| Quem vende                                 | Pessoa física e CNPJ              | Provedor precisa aceitar PF vendendo produto digital        |
| Meios obrigatórios                         | Pix, cartão à vista e parcelado   | Stripe não confirma parcelamento no Brasil                  |
| Repasse ao professor                       | Na hora / poucos dias             | Cartão no Brasil é ~30 dias; exige antecipação (paga)       |
| Chargeback / reembolso                     | Professor arca                    | Favorece split que estorna de quem recebeu                  |
| Cobrança da plataforma                     | % por venda + white label à parte | Comissão no split; contrato do white label fora do provedor |
| Venda no white label passa pela plataforma | Sim, com comissão                 | Mesmo split do marketplace                                  |
| Escala no primeiro ano                     | Até 50 professores                | Facilidade de integração pesa mais que taxa negociada       |

Fora do código: termos do professor; nota fiscal (em princípio o professor emite a da venda e a
plataforma a da comissão — validar com contador); LGPD (plataforma controladora, professor vê só os
compradores dele); titularidade do domínio.

### Split de pagamentos

Receber tudo e repassar depois faria a plataforma guardar dinheiro de terceiros e pagar imposto
sobre o valor cheio; o split deposita direto na conta de cada professor, com a comissão descontada
no ato.

| Requisito                 | Mercado Pago 1:1    | Mercado Pago 1:N      | Asaas                          | Stripe Connect                                     |
| ------------------------- | ------------------- | --------------------- | ------------------------------ | -------------------------------------------------- |
| Carrinho misto            | Não (um vendedor)   | Sim                   | Sim, sem limite de recebedores | Sim (_separate charges and transfers_)             |
| Acesso                    | Autoatendimento     | Só pelo comercial     | Autoatendimento                | Autoatendimento                                    |
| Cartão parcelado          | Sim                 | Sim                   | Sim                            | Não confirmado no Brasil                           |
| Prazo do cartão           | Conhecido           | Conhecido             | ~D+32; antecipação em 2 dias   | 30 dias; antecipação via parceiro                  |
| Chargeback pelo professor | —                   | A confirmar           | Split estornado automático     | Debita a plataforma; recupera estornando o repasse |
| Integração                | Pequena (já existe) | Troca de API (Orders) | Troca de provedor              | Troca de provedor                                  |

**Recomendação provisória:** (1) **Asaas** — o único que atende hoje, em autoatendimento, todos os
obrigatórios; (2) Mercado Pago 1:N, se o comercial liberar nessa escala; (3) Stripe, descartado
pelos requisitos. Qualquer troca reescreve `create-payment`, `webhook` e `verify-payment`; a
checagem de valor já mora num módulo só (`lib/payment-integrity.js`), o que deixa a troca contida.

Custos do Asaas (tabela oficial de 09/10/2026; sem mensalidade, cobra por cobrança recebida; entre
parênteses, a promoção dos 3 primeiros meses):

| Meio                  | Taxa                                                           |
| --------------------- | -------------------------------------------------------------- |
| Pix                   | R$ 1,99 fixo (R$ 0,99)                                         |
| Cartão à vista        | 2,99% + R$ 0,49 (1,99% + R$ 0,49)                              |
| Cartão 2–6x / 7–12x   | 3,49% / 3,99% + R$ 0,49                                        |
| Antecipação           | 1,25% a.m. à vista · 1,70% a.m. parcelado                      |
| Saque do professor    | Pix grátis (PF); PJ 30 grátis/mês, depois R$ 2,00; TED R$ 5,00 |
| Notificações do Asaas | E-mail/SMS R$ 0,99, WhatsApp R$ 0,55 — desligar pela API       |
| Subconta e split      | Não constam na tabela — perguntar                              |

O Pix fixo pesa no ticket baixo (R$ 1,99 numa venda de R$ 12,90 é 15%; em R$ 50, 4%). Atenua: o
carrinho misto gera uma cobrança só. Mês ilustrativo — 300 vendas de R$ 30, 60% Pix: ≈ R$ 525 de
taxa sobre R$ 9.000 (5,8%). O split do Asaas incide sobre o líquido; o mais simples é a comissão
(12–15%) cobrir a taxa.

Perguntas ao comercial (Asaas e, se possível, Mercado Pago 1:N): taxas e quem paga os juros do
parcelado; **Pix percentual** para ticket baixo; custo de subconta e de split; prazo real e
antecipação automática; aceitam marketplace de produto digital com subconta PF?; split em compra
parcelada e em reembolso parcial (um item do carrinho); chargeback com o professor já tendo sacado;
promoção permanente nessa escala.

Fontes:
[MP Split 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace) ·
[MP Split 1:N](https://www.mercadopago.com.br/developers/en/docs/split-payments-1-n/overview) ·
[Asaas — preços](https://www.asaas.com/precos-e-taxas) ·
[Asaas — split](https://docs.asaas.com/docs/split-de-pagamento) ·
[Asaas — checkout com split](https://docs.asaas.com/docs/checkout-com-split-de-pagamento) ·
[Asaas — dúvidas do split](https://docs.asaas.com/docs/duvidas-frequentes-split) ·
[Stripe — repasse no Brasil](https://support.stripe.com/questions/payout-schedule-and-payment-availability-for-accounts-in-brazil) ·
[Stripe — antecipação no Brasil](https://support.stripe.com/questions/partner-based-brazil-anticipations) ·
[Stripe — separate charges](https://docs.stripe.com/docs/connect/separate-charges-and-transfers) ·
[Stripe — disputas no Connect](https://docs.stripe.com/connect/disputes) ·
[Stripe — verificação no Brasil](https://support.stripe.com/questions/brazil-updates-to-verification-requirements-for-connected-accounts-of-platforms)

### Multi-tenant

**Um repositório, um backend, um banco, um front** servindo todas as lojas — nunca um repo por
cliente (cada correção aplicada N vezes, em N deploys). O site descobre a loja pelo domínio; white
label é configuração no banco (logo, cores, textos, domínio, conta de pagamento), não código.

Já existe e serve de base: conta de cliente única, papel de professor (`SELLER`),
`products.seller_id`, recorte de pedidos/clientes por professora (`lib/seller-scope.js`), dona da
loja (`lib/store-owner.js`), painel da plataforma, home e textos editáveis pelo painel
(`lib/store-content.js`), reconciliação de pagamento num módulo só, audit log, RLS.

Falta:

- **Banco:** `stores` (slug, nome, dono, status, tipo `marketplace`/`white_label`, % de comissão,
  `theme`); `store_domains`; `store_members` (permissão por loja, substituindo o papel global e o
  `settings.storeOwner`); `store_payment_accounts` (subconta/`walletId` do Asaas ou OAuth do MP,
  criptografado); `store_id` obrigatório e indexado em produtos, categorias, cupons, pedidos,
  settings, carrinhos, analytics e auditoria; comissão e líquido no pedido; unicidade por loja
  (slug, cupom, categoria).
- **Backend:** middleware domínio → loja; helper de consulta que **força** o filtro de loja, com
  teste de regressão no estilo de `handlers/__tests__/query-authz-regression.test.js` (o maior
  risco é uma query esquecida vazar pedidos entre lojas); cobrança com split; cadastro do professor
  no provedor; e-mail e SEO (sitemap, robots, metas) por host.
- **Front:** tema dinâmico (cores em variáveis CSS; nome, logo e redes do `Shell.jsx` — hoje fixos —
  vindos da loja); home do marketplace, página do professor, produto mostrando quem vende; carrinho
  misto com subtotal por professor; cadastro de professor (conta → loja → conta de recebimento →
  publicar).
- **Infra:** subdomínio coringa `*.ateliedaescola.com.br` na Vercel; domínios de cliente pela API
  da Vercel; Storage por `store_id/`.

### Ordem de construção

Cada etapa entra sem quebrar a loja no ar:

1. `stores` + `store_id` em tudo + migração da loja da Márcia. Nada muda para quem usa.
2. Middleware de tenant + helper com filtro obrigatório + painel da loja restrito por loja.
3. Provedor de split (depois das respostas do comercial) + comissão.
4. Tema dinâmico + domínios e subdomínios — aqui o white label funciona.
5. Marketplace (home, página do professor, carrinho misto) + cadastro de professor + painel da
   plataforma com aprovação e comissões.

Antes de começar: v1 com venda real; respostas do comercial; conversa com contador (nota fiscal) e
termos do professor; registrar as decisões finais neste documento.
