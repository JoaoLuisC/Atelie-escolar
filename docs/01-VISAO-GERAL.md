# 01 — Visão geral

> O que é o projeto, para quem, o que faz hoje, o que ainda não faz e quanto custa.

---

## O que é

**Ateliê da Escola** é uma loja de **materiais pedagógicos digitais**. A v1 é a loja da **Profa. Márcia**, em produção em `professoramarcia.ateliedaescola.com.br` (`ateliedaescola.com.br` e `www` redirecionam para lá). Ela produz banners, painéis decorativos, atividades e kits temáticos e vende em PDF/imagem para download imediato. Quem compra são outras professoras, da educação infantil ao ensino médio.

Não há logística física: com o pagamento aprovado no Mercado Pago, o cliente baixa os arquivos pelo navegador, por link de uso único.

A loja está no ar, mas **ainda não recebeu nenhum pedido real**. A plataforma para outros professores venderem (marketplace / white label, a "v2") está **adiada**. O código já tem o papel de professor(a) e o vínculo produto → vendedor, mas não tem split de pagamento nem as travas descritas em [10-ROADMAP](./10-ROADMAP.md).

A marca é a coruja roxa (`src/components/OwlLogo.jsx`), usada na loja, nos painéis, no favicon e nos ícones do app.

---

## Quem usa

| Persona            | Quem                                                                                 | O que faz no sistema                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visitante**      | Professora procurando material                                                       | Navega pelo catálogo, filtra e ordena, lê depoimentos e vê o preço                                                                                                                                                                                      |
| **Cliente**        | Quem comprou (com conta ou como convidado)                                           | Carrinho, checkout, pagamento, download, histórico de pedidos em `/conta`, exportação dos próprios dados e exclusão da conta (LGPD)                                                                                                                     |
| **Inscrito**       | Quem confirmou a newsletter (double opt-in)                                          | Recebe a newsletter. A sequência pós-compra e a reativação não dependem de inscrição: vão para quem tem pedido aprovado (relação contratual), salvo descadastro                                                                                         |
| **Dona da loja**   | A Profa. Márcia: perfil `seller` marcado em `settings.storeOwner`                    | Entra em `/professores` e recebe o **Painel da loja** completo: produtos, categorias, pedidos, cupons, faturamento, vendas, segmentos, página da loja e "Minha conta". Vê só os pedidos, clientes e produtos dos materiais dela (`lib/seller-scope.js`) |
| **Professor(a)**   | Outro perfil `seller`, sem ser a dona                                                | Entra em `/professores` e recebe a área simples (`TeachersPage`): os próprios produtos e vendas, cadastro de material, ativar/desativar e "Minha conta". Não vê pedidos nem clientes da loja                                                            |
| **Admin / master** | Administração da plataforma (`profiles.role` `ADMIN` ou `MASTER`, mesmas permissões) | `/admin` = **Administração da plataforma**: abas Professores e clientes (quem é a dona da loja, dono de cada produto), Usuários (papéis e acesso), Segurança (2º fator) e Minha conta. Não opera a loja. Toda escrita do painel vai para o audit log    |

Detalhes de cada painel em [06-PAINEIS](./06-PAINEIS.md).

Atores técnicos:

- **Mercado Pago** — Checkout Pro (cartão, Pix, boleto) e webhook de pagamento.
- **Resend** — SMTP dos e-mails transacionais e de marketing, inclusive os do Supabase Auth (definição e reset de senha).
- **Supabase** — banco Postgres, Auth (e-mail/senha e Google) e Storage dos arquivos e imagens.
- **Google Gemini** — sugestões de texto e o Estudo de vendas, só quando alguém clica no botão.
- **GA4 + Meta Pixel** — eventos do funil, só com consentimento de marketing. **Vercel Analytics** mede visitas sem cookie.
- **GitHub Actions** — CI (testes, Lighthouse, release) e o cron horário de e-mails (`/api/cron-email-jobs`).

---

## O que o sistema faz hoje

### Catálogo

- Home configurável pela dona da loja: textos, imagem do topo, ordem e visibilidade dos blocos, depoimentos, números, redes e faixas de produtos (por categoria, Mais vendidos, Novidades).
- `/produtos` com filtro por categoria e faixa de preço, presets `mais-vendidos` / `novidades` e ordenação (preço, novidade, vendas, nome). Existe filtro textual por `?q=` (usado pela SearchAction do JSON-LD da home), mas a loja não tem campo de busca visível.
- `/produtos/:slug` com galeria, vídeos, descrição, FAQ, depoimentos, benefícios e cross-sell (co-ocorrência de compra, com fallback por categoria).
- SEO técnico: slug nas URLs, título e descrição por página, JSON-LD `Product` + `Offer`, sitemap dinâmico, canonical e imagem OG padrão.

### Compra e entrega

- Carrinho em `localStorage`, em drawer (não navega).
- Checkout numa página só: e-mail, nome, cupom e pagamento. Compra como convidado permitida; a conta é provisionada e o cliente recebe e-mail para definir a senha.
- Cupom pré-validado na tela e validado de verdade no servidor, no `create-payment`.
- Aprovação pelo webhook do Mercado Pago, com polling na tela como reserva.
- E-mail de confirmação do pedido na primeira aprovação (idempotente).
- Download por token de uso único, entregue por URL assinada do Storage; até 5 downloads por item, com reemissão do link pelo botão "Atualizar" em `/downloads`.
- Carrinho abandonado salvo e lembrado por e-mail (com consentimento).

Fluxos completos em [05-FLUXOS](./05-FLUXOS.md).

### Contas e login

- **Cliente** (`/login`): e-mail/senha ou Google, pelo Supabase Auth; o servidor converte em cookie de sessão próprio (HttpOnly, assinado, 8h). Reset de senha por e-mail. Em `/conta`: pedidos, "Baixar meus dados" (JSON) e exclusão da conta em dois passos, com anonimização dos pedidos.
- **Staff** (`/admin`): a tela de login abre com "Sou cliente | Sou professor(a)". Professor(a) entra por e-mail/senha ou Google; admin/master só por e-mail/senha + 2º fator (TOTP, código por e-mail ou PIN), quando ativado. O papel da conta decide o destino: admin/master no painel da plataforma, professor(a) em `/professores`. A proteção é a sessão, não a URL.
- **Minha conta** (todos os perfis de staff): troca de nome, senha e e-mail, pedindo a senha atual.

### Painéis

- **Painel da loja** (dona da loja, em `/professores`): Dashboard, Produtos, Desempenho dos produtos, Categorias, Pedidos, Cupons, Faturamento, Comparativo mensal, Vendas (Estudo de vendas, Funil, Curva ABC e coorte), Segmentos de email, Página da loja (com prévia ao vivo) e Minha conta.
- **Administração da plataforma** (`/admin`): Professores e clientes, Usuários, Segurança e Minha conta.
- **Área do professor** (`/professores`, demais professores): resumo, meus produtos, novo material e Minha conta.

### IA (Gemini)

Só sai quando alguém clica, e nada é gravado sem revisão: a sugestão volta para a tela e quem pediu decide se usa.

- Texto de venda do produto (descrição, benefícios, FAQ).
- Nome, título/descrição para o Google e faixa de preço comparada ao catálogo da própria loja.
- Textos da página da loja.
- **Estudo de vendas**: leitura em linguagem simples dos números do período. Abaixo de um mínimo de pedidos, a resposta é fixa e a IA não é chamada.

A IA recebe só dados da loja (nomes, categorias, preços, números agregados), nunca dados de cliente. Os botões ficam no Painel da loja; a área simples do professor ainda não tem.

### Marketing e retenção

Eventos do funil (GA4, Pixel e `analytics_events`), UTM first-touch anexada ao pedido, banner LGPD, newsletter com double opt-in, sequência pós-compra (D+0, D+3, D+15, D+45), carrinho abandonado (1h e 24h), reativação 90–180 dias com cupom, segmentação, Curva ABC, coorte, funil e KPIs. Tudo em [07-NEGOCIO-E-MARKETING](./07-NEGOCIO-E-MARKETING.md).

### Conformidade

- **LGPD**: consentimento antes de GA4/Pixel, double opt-in, descadastro em um clique, exportação e exclusão self-service, retenção limitada dos logs e e-mail mascarado nos logs. Detalhes em [08-SEGURANCA](./08-SEGURANCA.md).
- **Acessibilidade e SEO**: gate do Lighthouse no CI (regra F1 em [07-NEGOCIO-E-MARKETING](./07-NEGOCIO-E-MARKETING.md)), fontes ≥ 16px em mobile, `aria-busy`/skeleton e mensagens de erro humanas.

---

## O que ainda não faz

Lista resumida; o que fazer e em que ordem está em [10-ROADMAP](./10-ROADMAP.md).

- **Plataforma de professores (v2)**: sem split/repasse (todo pagamento cai numa conta Mercado Pago só), sem moderação (produto de professor nasce ativo), sem prefixo por vendedor no arquivo de download, sem contrato do vendedor, `products.seller_id` ainda opcional.
- **2º fator por conta**: o 2º fator é um só, da administração. Professor(a) e a dona da loja entram sem 2º fator.
- **Audit log da área simples do professor**: criar e ativar/desativar produto em `/api/teacher/products` não grava no `admin_audit_log`.
- **Mídia paga** (Google Ads, Meta Ads), **A/B test** e **heatmap**: não iniciados.
- **Export CSV** só existe na Curva ABC e coorte; pedidos, clientes e segmentos ainda não exportam.
- **Vendas por região**: o checkout não pede UF, então o card do Dashboard fica vazio.
- **Produto gratuito como porta de entrada** (regra E8) e **pipeline WebP/AVIF** (adiada até o catálogo passar de 200 produtos).

---

## Stack

| Camada      | Tecnologia                                             | Versão |
| ----------- | ------------------------------------------------------ | ------ |
| Frontend    | React + React Router                                   | 19 / 7 |
| Build       | Vite                                                   | 8      |
| Estilo      | Tailwind CSS (+ `@tailwindcss/typography`)             | 3.4    |
| Formulários | react-hook-form + zod                                  | 7 / 4  |
| Backend     | Express numa função da Vercel (`api/index.js`)         | 5      |
| Banco       | Supabase (Postgres, Auth, Storage)                     | PG 17  |
| Pagamento   | Mercado Pago SDK (Checkout Pro)                        | 3      |
| E-mail      | Resend via SMTP (nodemailer)                           | 10     |
| IA          | Google Gemini (REST; modelo padrão `gemini-2.5-flash`) | —      |
| Segurança   | helmet + cors + rate limit no Postgres                 | —      |
| Testes      | Vitest + Testing Library                               | 4 / 16 |
| Deploy      | Vercel                                                 | —      |
| CI e cron   | GitHub Actions                                         | —      |

Decisões e racional em [02-ARQUITETURA](./02-ARQUITETURA.md); como rodar e publicar em [03-SETUP-E-DEPLOY](./03-SETUP-E-DEPLOY.md).

---

## Custos

| Recurso          | Plano     | Custo                                                                                                |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| Supabase         | Free      | R$ 0 (500 MB de banco, 50k usuários ativos, 1 GB de Storage, backup de 7 dias)                       |
| Vercel           | Hobby     | R$ 0 (100 GB de banda)                                                                               |
| Resend           | Free      | R$ 0 (3.000 e-mails/mês, ~100/dia)                                                                   |
| Gemini           | Gratuito  | R$ 0 (cota finita; o plano gratuito pode usar o conteúdo enviado — por isso não vai dado de cliente) |
| GA4 / Meta Pixel | Free      | R$ 0                                                                                                 |
| GitHub Actions   | Free      | R$ 0 (2.000 min/mês)                                                                                 |
| Mercado Pago     | Por venda | Tarifa sobre cada venda aprovada (varia com o meio de pagamento e o prazo de recebimento)            |
| Domínio          | Anual     | ~R$ 40/ano                                                                                           |

**Custo fixo mensal: R$ 0.** Upgrades só quando o limite estourar:

| Serviço      | Custo      | Gatilho                                         |
| ------------ | ---------- | ----------------------------------------------- |
| Resend Pro   | US$ 20/mês | lista > 5k inscritos ou > 100 e-mails/dia       |
| Supabase Pro | US$ 25/mês | banco > 500 MB, ou backup de 30 dias (regra H8) |
| Vercel Pro   | US$ 20/mês | banda > 100 GB/mês                              |

A primeira despesa recorrente planejada é mídia paga (~R$ 5.000/mês), só depois do gatilho descrito em [07-NEGOCIO-E-MARKETING](./07-NEGOCIO-E-MARKETING.md).
