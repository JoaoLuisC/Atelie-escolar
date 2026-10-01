# Relatório de validação — BLOCO 2A (Admin: login e leitura)

Data: 2026-10-01 · Ambiente: http://localhost:5173 (LOCAL) · Versão: ATUAL · 2FA exigido? não (desligado) · Larguras reais: desktop 1920 px (janela maximizada); mobile 390 px e 1100 px emulados em iframe same-origin · session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · Início/fim: 18:21 / 18:37

Executado numa conversa só (A01–A14, sem a parada intermediária). A senha do admin foi digitada pelo humano em todos os logins. Nenhum dado foi criado, editado ou excluído.

## 1. Resumo executivo

- Telas validadas: 14 de 14 · Problemas: crítica 0 · alta 2 · média 8 · baixa 9 · cosmética 2
- Os 5 mais graves:
  1. ADM-01: depois de "Encerrar sessão", o painel continua mostrando Dashboard, Funil e Segmentos a partir do cache HTTP do navegador (`private, max-age=3600`). Ele não detecta a expiração, e os dados de clientes ficam até 1 h no cache depois do logout.
  2. ADM-02: no mobile, a tabela "Pedidos recentes" corta o botão "Detalhes" (overflow hidden) e a tabela de Desempenho corta "TAXA DE DOWNLOAD".
  3. ADM-03: com erro de rede no Funil, o subtítulo muda para o período novo, mas os números continuam os do período anterior.
  4. ADM-04: a Curva ABC de produtos mostra os nomes sem acento ("Kit Volta as Aulas", "Dia das Maes Premium") e categoria em UUID.
  5. ADM-05: com erro na Análise, a aba inteira vira "Failed to fetch", os seletores somem e não há botão de tentar de novo.

## 2. Tabela de cobertura

| Tela/aba              | Desktop | Mobile               | Console                           | Observações                             |
| --------------------- | ------- | -------------------- | --------------------------------- | --------------------------------------- |
| A01 /admin sem sessão | ok      | —                    | limpo                             | rotas antigas → 404                     |
| A02 Login             | ok      | —                    | limpo                             | sem 2FA                                 |
| A03 Casca             | ok      | parcial (iframe 390) | limpo                             | menu mobile sem Esc e sem aria-expanded |
| A04 Dashboard         | ok      | parcial              | 2× aviso de "key" (CategoryDonut) | legenda da rosca sem nome               |
| A05 Modal de pedido   | ok      | —                    | limpo                             | foco preso, Esc ok                      |
| A06 Faturamento       | ok      | —                    | limpo                             | barra em mês R$ 0                       |
| A07 Comparativo       | ok      | —                    | limpo                             | "Setembro De 2026"                      |
| A08 Desempenho        | ok      | falha (corta coluna) | limpo                             | 0 downloads em tudo                     |
| A09 Análise           | parcial | ok (coorte rola)     | limpo                             | nomes sem acento; erro derruba a aba    |
| A10 Funil             | ok      | ok                   | limpo                             | números velhos no erro                  |
| A11 Segmentos         | ok      | ok                   | limpo                             | "30 min" × cache de 1 h                 |
| A12 Coerência e cache | ok      | —                    | —                                 | números batem; cache confirmado         |
| A13 Sessão expirada   | parcial | —                    | —                                 | ADM-01                                  |
| A14 Varredura mobile  | parcial | iframe 390           | —                                 | ADM-02                                  |

## 3. Tabela de números (A04, A06–A08, A12)

| Métrica              | Onde                                         | Valor                                                                  | Deveria ser igual a                                        | Bate? |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- | ----- |
| Receita total        | Dashboard (mini)                             | R$ 556,60                                                              | summary.revenueTotal (556.5999999999999) e Bruto acumulado | sim   |
| Bruto acumulado      | Faturamento                                  | R$ 556,60                                                              | Receita total                                              | sim   |
| Pedidos aprovados    | Dashboard / Faturamento                      | 10 / 10                                                                | summary.approvedOrders 10                                  | sim   |
| Pendentes            | card "3 pendentes" / mini "Pendentes"        | 3 / 3                                                                  | summary.pendingOrders 3                                    | sim   |
| Ticket médio         | Faturamento                                  | R$ 55,66                                                               | 556,60 ÷ 10                                                | sim   |
| Ticket médio (12m)   | Dashboard KPI                                | R$ 55,66                                                               | kpis.ticketMedio                                           | sim   |
| Faturamento do mês   | Dashboard / Comparativo atual / última barra | R$ 0,00 / R$ 0,00 / out. R$ 0,00                                       | summary.revenueMonth 0                                     | sim   |
| Soma dos 6 meses     | Faturamento                                  | R$ 362,00                                                              | ≤ Bruto acumulado                                          | sim   |
| Receita por produto  | Curva ABC × Desempenho                       | 119,80 / 99,80 / 89,80 / 79,80 / 59,80 / 34,90 / 27,90 / 24,90 / 19,90 | iguais; soma 556,60 = Receita total                        | sim   |
| Linhas do Desempenho | Desempenho                                   | 11                                                                     | summary.totalProducts 11                                   | sim   |
| Clientes cadastrados | Dashboard                                    | 10                                                                     | Recorrentes 3 + Novos 4 + "3 cadastros sem compra"         | sim   |
| Produtos ativos      | Dashboard                                    | 11                                                                     | summary.activeProducts                                     | sim   |

Horário das medições: 18:25–18:30 (antes das 21 h; mês corrente sem vendas).

## 4. Problemas encontrados

### ADM-01 — Depois do logout, o painel continua exibindo relatórios do cache do navegador

- Severidade: alta
- Tela/URL: A13 item 3 — http://localhost:5173/admin, abas "Segmentos", "Funil" e "Dashboard" — 1920 px
- Passos para reproduzir: 1. Logado na aba A, abra uma aba B em /admin e clique "Encerrar sessão" (`GET /admin/session` → authenticated false). 2. Na aba A, que continua com o painel na tela, clique "Segmentos", depois "Funil" → "7 dias", depois "Dashboard".
- Esperado: detectar a sessão inválida (formulário, ou ao menos a caixa rosa "Sessão admin inválida ou expirada.").
- Obtido: as três abas renderizam números normalmente, sem toast e sem formulário. Rede: `segments 200 4 ms`, `funnel?days=30 200 3 ms`, `funnel?days=7 200 4 ms`, `dashboard 200 11 ms`, `kpis 200 6–11 ms`, todos servidos pelo cache HTTP. Só "Pedidos" (sem cache) detectou a expiração.
- Impacto: os relatórios do admin (inclusive o `/admin/dashboard` com `users` e `orders`, que trazem e-mails de clientes) ficam no cache do navegador por até 1 h depois do logout. Num computador compartilhado, eles continuam visíveis na aba aberta.
- Evidência: Cache-Control "private, max-age=3600" em dashboard, kpis, funnel, segments, abc-* e cohort.
- Arquivo provável: lib/http.js / handlers/admin/*.js (cabeçalho de cache), src/pages/AdminPage.jsx (isSessionError/onAuthExpired)
- Veio de verificação dirigida? sim (A13 item 3)

### ADM-02 — Mobile: tabelas do Dashboard e do Desempenho cortadas sem rolagem

- Severidade: alta
- Tela/URL: A14 — /admin, abas "Dashboard" e "Produtos ▸ Desempenho" — 390 px (iframe)
- Obtido: "Pedidos recentes": contêiner com scrollWidth 547 × clientWidth 307 e overflow-x hidden, então o botão "Detalhes" fica fora da área visível e não há como abrir o pedido. Desempenho: scrollWidth 448 × clientWidth 307 e overflow-x hidden, com a coluna "TAXA DE DOWNLOAD" terminando em x=482 numa tela de 390.
- Arquivo provável: src/components/admin/tabs/DashboardTab.jsx, src/components/admin/tabs/PerformanceTab.jsx
- Veio de verificação dirigida? sim (A14 itens 2 e 3)

### ADM-03 — Funil com erro de rede mostra números do período anterior com o subtítulo novo

- Severidade: média
- Tela/URL: A10 item 5 — aba "Funil"
- Passos para reproduzir: com "90 dias" carregado, `window.__bloquear = /admin\/funnel/` e clique "7 dias".
- Obtido: "Failed to fetch" (inglês cru) acima dos blocos, o subtítulo "Sessões únicas por etapa nos últimos 7 dias" e os números de 90 dias (Sessões únicas 8).
- Arquivo provável: src/components/admin/tabs/FunnelTab.jsx
- Veio de verificação dirigida? sim

### ADM-04 — Curva ABC de produtos com nomes sem acento e categoria em UUID

- Severidade: média
- Tela/URL: A09 — aba "Análise", "Produtos: último ano"
- Obtido: "#3 Caderno de Atividades 1o Ano", "#4 Kit Volta as Aulas", "#6 Dia das Maes Premium", "#8 Pascoa Pedagogica" (o catálogo e o Dashboard mostram "1º", "às", "Mães", "Páscoa"). "#2 Kit Festa Junina Completo" com a categoria "a672e791-c5e9-42c2-9dfe-a1357b96652a". O filtro de categoria lista 4 UUIDs, "teste" e "Sem nome (renomeie)".
- Arquivo provável: handlers/admin/abc-products.js (normalização do nome), src/components/admin/tabs/AnalysisTab.jsx
- Veio de verificação dirigida? não

### ADM-05 — Erro na Análise derruba a aba inteira, sem seletores nem nova tentativa

- Severidade: média
- Tela/URL: A09 item 6 — aba "Análise"
- Obtido: com `/admin\/cohort/` bloqueado, ao trocar um select a aba vira só "Failed to fetch". Os 3 seletores somem (0 selects) e não há botão de tentar de novo; só trocando de aba ela volta.
- Arquivo provável: src/components/admin/tabs/AnalysisTab.jsx
- Veio de verificação dirigida? sim

### ADM-06 — Logout com falha não avisa que a sessão continua aberta

- Severidade: média
- Tela/URL: A13 item 5 — /admin
- Obtido: com `/admin\/logout/` bloqueado, "Encerrar sessão" mostra só o toast error "Failed to fetch". O painel continua na tela e `/admin/session` → authenticated true, sem mensagem dizendo que a sessão segue ativa.
- Arquivo provável: src/pages/AdminPage.jsx, src/providers/AuthProvider.jsx
- Veio de verificação dirigida? não (código novo)

### ADM-07 — Curva ABC de clientes mostra nomes completos apesar da nota de máscara

- Severidade: média
- Tela/URL: A09 — "Curva ABC — Clientes" ("Clientes: último ano")
- Obtido: as 7 linhas trazem nome e sobrenome completos (ex.: "A. L." e "C. S.", mascarados aqui), embora a nota diga "E-mails são mascarados na visualização — export CSV usa a mesma máscara." e o subtítulo diga "não personalização nominal". O CSV de clientes foi gerado (download interceptado, não salvo nem aberto).
- Arquivo provável: handlers/admin/abc-customers.js, src/components/admin/tabs/AnalysisTab.jsx
- Veio de verificação dirigida? sim

### ADM-08 — Segmentos: "Cache de 30 min" × cache real de 1 h, e nenhum segmento com 10 pedidos aprovados

- Severidade: média
- Tela/URL: A11 — aba "Segmentos"
- Obtido:
  - rodapé "Cache de 30 min", mas a resposta é "private, max-age=3600";
  - "Sem assinantes classificados ainda / Tags ficam disponíveis quando há pedidos aprovados ou inscritos confirmados.", com 10 pedidos aprovados no Dashboard;
  - inscritos 0 / 0 / 0 / 0;
  - a resposta não contém e-mails (ok).
- Arquivo provável: src/components/admin/tabs/SegmentsTab.jsx, handlers/admin/segments.js, lib/customer-segmentation.js
- Veio de verificação dirigida? sim (item 3)

### ADM-09 — Desempenho: 0 downloads em todos os produtos e barra de 6% em "0%"

- Severidade: média
- Tela/URL: A08 — aba "Desempenho dos produtos"
- Obtido: os 11 produtos aparecem com DOWNLOADS 0 e "0%" com barra preenchida de 6% (inclusive "Palavras Mágicas" e "teste", com 0 vendas). São 10 pedidos aprovados com 0 downloads em todos: o contador pode não estar sendo alimentado (a confirmar).
- Arquivo provável: src/components/admin/tabs/PerformanceTab.jsx, handlers/admin/dashboard.js
- Veio de verificação dirigida? sim

### ADM-10 — Cartão "Funil de conversão" diz "Instrumentação pendente", mas a aba Funil existe e tem dados

- Severidade: média
- Tela/URL: A04 item 9 — Dashboard
- Obtido: "Funil de conversão / Instrumentação pendente / … Instrumentar eventos page_view, add_to_cart…", enquanto a aba Funil mostra 126 eventos em 30 dias. O cartão "Vendas por região" traz instrução técnica para o usuário final ("Adicione a coluna shipping_state na tabela orders…").
- Arquivo provável: src/components/admin/tabs/DashboardTab.jsx
- Veio de verificação dirigida? sim

### ADM-11 — Legenda da rosca sem nome da categoria e aviso de "key"

- Severidade: baixa
- Tela/URL: A04 item 6 — Dashboard, "Receita por categoria"
- Obtido: a legenda traz só bolinha, "30%" e "R$ 139,70", sem o nome. Console: 2× 'Each child in a list should have a unique "key" prop … Check the render method of `CategoryDonut`'.
- Arquivo provável: src/components/admin/tabs/dashboard-charts.js / DashboardTab.jsx
- Veio de verificação dirigida? sim

### ADM-12 — Menu lateral mobile: sem Esc, sem aria-expanded, foco em itens fora da tela, botão estreito

- Severidade: baixa
- Tela/URL: A03 item 6 — 390 px (iframe)
- Obtido: Esc não fecha; "Abrir menu" sem aria-expanded e com 36×44 px; com o menu fechado, "Ver loja" fica em x=-276 e continua focável (o Tab percorre o menu invisível). Os botões dos grupos ("Produtos", "Financeiro") também não têm aria-expanded no desktop.
- Arquivo provável: src/components/admin/AdminLayout.jsx
- Veio de verificação dirigida? sim

### ADM-13 — Modal "Como ler": sem Esc, sem role=dialog, página rola por trás

- Severidade: baixa
- Tela/URL: A09 item 4 — aba "Análise"
- Obtido: Esc não fecha os 3 modais; não há role=dialog; body.style.overflow fica vazio (a página rola por trás). X, "Entendi" e o fundo fecham (ok). Os itens por bloco batem (5/4/5, 4/4/5, 5/5/4).
- Arquivo provável: src/components/admin/tabs/AnalysisTab.jsx
- Veio de verificação dirigida? sim

### ADM-14 — Textos explicativos inconsistentes na Análise

- Severidade: baixa
- Tela/URL: A09 dirigida
- Obtido: o modal da coorte cita "M+12", mas a tabela vai até M+11; o modal de clientes fala em "ticket médio", mas a classificação usa número de pedidos. Jargão interno visível: "Regra D5", "regra F5", "Fase 5" (LTV/CAC no Dashboard). A instrução "Adicione ?nocache=1 à URL" não tem efeito, porque o front não repassa o parâmetro às chamadas.
- Arquivo provável: src/components/admin/tabs/analysis-content.js, AnalysisTab.jsx, SegmentsTab.jsx, DashboardTab.jsx
- Veio de verificação dirigida? sim

### ADM-15 — Faturamento: meses com R$ 0,00 aparecem com barra de 8%

- Severidade: baixa
- Tela/URL: A06 — aba "Faturamento"
- Obtido: jun.–out. com R$ 0,00 e barra verde de 8%. "Sem vendas no período." nunca aparece.
- Arquivo provável: src/components/admin/ui/BarList.jsx
- Veio de verificação dirigida? sim

### ADM-16 — Pedidos pendentes desde maio sem nenhuma ação possível

- Severidade: baixa
- Tela/URL: A04 item 10 / A05
- Obtido: 3 pedidos "Pendente" de 29–30/05/2026 continuam pendentes 4 meses depois. O modal não tem nenhuma ação (cancelar, reenviar, expirar) e não existe expiração automática visível. Dois pedidos usam o código novo "ORD-…" e seis usam hash de 32 caracteres sem prefixo.
- Arquivo provável: src/components/admin/OrderDetailModal.jsx, handlers/verify-payment.js / cron
- Veio de verificação dirigida? não

### ADM-17 — Plural e números crus

- Severidade: baixa
- Obtido: "+ 1 produtos restantes na cauda C." (singular errado); a API devolve revenueTotal 556.5999999999999 e ticketMedio 55.65999999999999 (float sem arredondamento; a tela formata certo); `kpis` é chamado 3–4 vezes a cada visita ao Dashboard.
- Arquivo provável: src/components/admin/tabs/DashboardTab.jsx, handlers/admin/dashboard.js, handlers/admin/kpis.js
- Veio de verificação dirigida? não

### ADM-18 — Login admin: campos sem required, sem título e sem "Esqueci minha senha"

- Severidade: baixa
- Tela/URL: A02 dirigida
- Obtido: document.title "Ateliê da Escola" (sem título próprio); sem link de volta à loja; sem recuperação de senha; os campos não têm `required` (a validação é só no JS). Métodos 2FA não verificáveis (2FA desligado).
- Arquivo provável: src/pages/AdminLoginPage.jsx
- Veio de verificação dirigida? sim

### ADM-19 — Rodapé do menu mostra sempre "Administrador"

- Severidade: baixa
- Tela/URL: A03 dirigida
- Obtido: "Administrador" / "SESSÃO ADMIN", sem o e-mail logado. Não dá para saber qual conta está ativa.
- Arquivo provável: src/components/admin/AdminLayout.jsx
- Veio de verificação dirigida? sim

### ADM-20 — "estável" × "Estável" e "Setembro De 2026"

- Severidade: cosmética
- Tela/URL: A04 / A07
- Obtido: Dashboard "estável" (minúsculo) e Comparativo "Estável"; nomes de mês "Setembro De 2026" / "Outubro De 2026" com "De" maiúsculo.
- Arquivo provável: src/components/admin/tabs/ComparisonTab.jsx, src/components/admin/utils/derive.js
- Veio de verificação dirigida? sim

### ADM-21 — Ícone de toast ausente nos toasts success/warning do painel

- Severidade: cosmética
- Obtido: "Login administrativo realizado." e "Sessão admin expirada. Faça login novamente." com ícone "none" (mesma causa da LOJA-17).
- Arquivo provável: public/fonts/bootstrap-icons-subset.css
- Veio de verificação dirigida? não

## 5. Pontos a confirmar: resultado de cada um

1. Login: a URL fica /admin, sem redirecionamento (confirmado). Sem 2FA no ambiente, então o painel aparece logo após a senha.
2. Sessão expirada: em Pedidos → toast âmbar "Sessão admin expirada. Faça login novamente." + formulário (só o âmbar, confirmado). Em Funil/Segmentos **não aparece nem a caixa rosa**: os dados vêm do cache (ADM-01).
3. "Encerrar sessão" mostra o formulário vazio na própria /admin, sem /login: confirmado (POST 200, toast info "Sessão administrativa encerrada.", session false, F5 continua no formulário).
4. A sessão admin não faz aparecer "Painel admin" na loja: confirmado ("Ver loja" → cabeçalho de visitante).
5. Rótulo do menu × h1: todos conforme a tabela (Desempenho → "Desempenho dos produtos", Comparativo → "Comparativo mensal", Funil → "Funil de conversão", Análise → "Análise (Curva ABC + Coorte)", Segmentos → "Segmentos de email"). Nenhum caso fora dela.

## 6. Itens NÃO testados e por quê

| Tela/item                                                     | Motivo                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A02.5 etapa 2FA e verificações dirigidas do código            | 2FA desligado neste ambiente                                                |
| A02 dirigida fontSize 14px no iPhone                          | não medido                                                                  |
| A04 dirigidas "venda após 21 h" e "anel some com 1 categoria" | sem vendas no período / receita em várias categorias                        |
| Larguras reais 390/1440                                       | janela maximizada; mobile emulado em iframe                                 |
| A09.5 abrir o CSV                                             | proibido (dados de clientes); os 3 downloads foram interceptados sem salvar |

## 7. Dados [TESTE] criados

Nenhum dado criado ou alterado. CSVs: nenhum arquivo salvo (cliques interceptados: curva-abc-produtos-year.csv, curva-abc-clientes-year.csv, cohort-mensal.csv).
Logins admin (senha): 18:22:40 (errada, 401), 18:24:41, 18:32:39, 18:36:25. Logouts reais: 2 (aba B, ~18:31 e ~18:34).

## 8. ESTADO PARA A PRÓXIMA ETAPA

- Telas concluídas: A01–A14
- Versão: ATUAL · 2FA: não exigido
- Logins admin gastos: 4 envios de senha entre 18:22 e 18:36 (último 18:36:25); 0 de código
- Sessão admin ativa agora? **sim** (aba única do Chrome em /admin, Dashboard)
- session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9
- Último ADM-nn: ADM-21
