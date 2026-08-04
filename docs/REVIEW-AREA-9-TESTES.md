# Área 9 — Testes & Confiabilidade — Relatório de Review

## Sumário executivo

A postura de testes deste e-commerce é **estruturalmente frágil e mal-priorizada para o domínio (pagamentos digitais)**. Existem 12 arquivos de teste de boa qualidade em pontos isolados (validação de assinatura HMAC do webhook, security-headers, schemas Zod, utilitários de analytics/atribuição/consentimento), mas eles cobrem apenas ramos de borda rasos e — criticamente — **os núcleos de segurança e dinheiro não têm cobertura alguma**: todo o fluxo de login admin (2FA/TOTP), os três primitivos de sessão HMAC (`admin-session`, `customer-session`, `auth.middleware`), as políticas RLS (o boundary de autorização do browser), o caminho `approved` do webhook (idempotência de tokens), a defesa anti-enumeração timing-safe do `verify-payment`, o uso-único do `download` token e o recálculo server-side de preço. Agravante que multiplica todo o risco: **nenhum workflow de CI executa `npm test`** — os únicos gates de PR são Lighthouse (a11y/SEO/performance) e um cron de email. Ou seja, mesmo os testes existentes não bloqueiam merge, e qualquer regressão de segurança/pagamento entra em `main` sem detecção automática. **O risco nº 1 é a cobertura ZERO do único gate de autenticação do painel admin (`verifySessionToken`/`ensureAdminSession`) combinada à ausência de gate de testes em CI: uma regressão na verificação de assinatura/exp/safeCompare permitiria forjar o cookie `admin_session` e obter acesso administrativo total, sem nenhum teste falhar.**

---

## Achados

### CRÍTICO

| Campo | Detalhe |
|---|---|
| **ID** | TEST-01 |
| **Severidade** | CRÍTICO |
| **Confiança** | Alta |
| **Local** | `api/admin-login.js:54-83,121-141,220-246,296-297`; `lib/admin-session.js:73-100` |
| **Problema** | Cobertura ZERO do fluxo de login admin e da validação de sessão HMAC. Nenhum teste referencia `admin-login`, `admin-session`, `verifySessionToken`, `isValidTotpCode`, `verifyChallengeToken` ou `ensureAdminSession`. Sem teste: assinatura do `challengeToken` de 2FA, binding email, validação TOTP com janela de drift, gate de papel admin/master, e `verifySessionToken` (sub==='admin', exp, safeCompare). |
| **Impacto** | `verifySessionToken`/`ensureAdminSession` é o único gate de autenticação do painel, reutilizado em 16 rotas `admin/*.js`. Regressão na verificação de assinatura/exp/`safeCompare` permitiria forjar `admin_session` e obter acesso total (preços, produtos, downloads, dados de clientes), ou anular o 2FA. Nada falha automaticamente. |
| **Repro/PoC** | N/A — ausência total de testes; qualquer mudança nesses módulos passa o suite. Único match "admin" em testes são strings de evento em analytics, alheias ao fluxo. |
| **Correção** | Criar `lib/__tests__/admin-session.test.js` (round-trip; assinatura adulterada/exp/sub errado → `{valid:false}`; token sem `.` → `{valid:false}`; `safeCompare` com comprimentos distintos → false sem lançar; `getSessionSecret` lança em produção sem `ADMIN_SESSION_SECRET`) e `api/__tests__/admin-login.test.js` (challenge com assinatura/email/exp inválidos rejeitado; TOTP fora da janela rejeitado; role não-admin → 403; `Set-Cookie` só no sucesso). Ver TEST-08/09/10 (AAA). |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-02 |
| **Severidade** | CRÍTICO |
| **Confiança** | Alta |
| **Local** | `lib/customer-session.js` (módulo inteiro); `middleware/auth.middleware.js` (módulo inteiro) |
| **Problema** | Nenhum teste referencia `customer-session` nem `auth.middleware` (`authenticate`/`checkRole`). `verifyCustomerSessionToken` (assinatura HMAC, exp, sub==='customer') e o middleware Express (`authenticate` valida via `supabase.auth.getUser`; `checkRole` resolve role server-side por `user.id` e nega 403) estão 100% descobertos. |
| **Impacto** | `customer-session` é a base da autenticação do cliente (cookie HMAC) — regressão permite forjar sessão e personificar usuários (IDOR sobre downloads/dados). `auth.middleware` protege `POST /produtos` (escrita via service role) com `checkRole('ADMIN')`; uma regressão fail-open (client null/role null tratado como autorizado, ou confiar no role do body) concede acesso administrativo. Ambos são fail-closed críticos sem trava. |
| **Repro/PoC** | N/A — ausência total de testes. Único hit "authenticate" em testes é segmento de URL do Supabase em `storage-signed-url.test.js:17-18`. |
| **Correção** | `lib/__tests__/customer-session.test.js` (round-trip; assinatura/exp/sub inválidos → `{valid:false}`; `getCustomerSessionSecret` lança em produção sem segredo; cookie HttpOnly+SameSite=Strict+Secure em prod). `middleware/__tests__/auth.middleware.test.js` (header ausente/scheme≠bearer → 401; `getUser` com erro/sem user → 401; `getAnonClient` null → 500; `checkRole` role inexistente → 403; matriz de aliases MASTER→ADMIN permite / CUSTOMER→ADMIN nega; role sempre do banco). |

*(Os achados D4-seguranca-07 e D4-seguranca-01/02/04 originais foram consolidados em TEST-01, TEST-02 e nos achados ALTO abaixo por serem duplicatas verificadas do mesmo gap.)*

---

### ALTO

| Campo | Detalhe |
|---|---|
| **ID** | TEST-03 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/webhook.js:103-148`; `api/__tests__/webhook-signature.test.js:91-137` |
| **Problema** | Nenhum teste exercita o caminho `payment.status === 'approved'`. Todos os 5 testes existentes param antes (type≠'payment' ou 401/405). Idempotência de tokens (reuso de `existingTokens`), criação de `download_tokens` (TTL 72h, `used=false`, `randomBytes(32)`), `updateTable` da order, provisionamento e `recordEvent('payment_approved')` ficam sem cobertura. |
| **Impacto** | O Mercado Pago reenvia a mesma notificação. Regressão que removesse o branch de reuso geraria múltiplos tokens por item a cada reenvio, multiplicando direitos de download (mitigado por constraint UNIQUE no DB, mas não travado por teste). Núcleo de idempotência sem guarda automatizada. |
| **Repro/PoC** | Não existe teste com `type='payment'` + `getPaymentInfo` retornando `status='approved'`. Bypass por `APP_ENV='test'` foi removido — teste exige HMAC válida via `buildSignedHeaders`. |
| **Correção** | Ver TEST-01/02 (AAA — testes ausentes de maior valor). Mockar `getPaymentInfo`/`serviceRoleHelpers`; assertar reuso vs criação e não-duplicação em reenvio. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-04 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/verify-payment.js:164-186`; `api/__tests__/api-endpoints.test.js:52-61` |
| **Problema** | O único teste cobre só `orderId` ausente → 400. A defesa anti-enumeração timing-safe (email mismatch → 404 idêntico a "Pedido não encontrado" + `recordSecurityEvent`) e a guarda de comprimento antes de `crypto.timingSafeEqual` (`expectedBuf.length === providedBuf.length`) não têm teste. |
| **Impacto** | `timingSafeEqual` lança se os buffers têm tamanhos diferentes. Se a guarda for removida num refactor, todo email de tamanho diferente cai no catch → **500 em vez de 404**, vazando sinal de existência/tamanho do email e quebrando a defesa anti-enumeração. Endpoint público; resposta de sucesso contém PII + download tokens. |
| **Repro/PoC** | Não há teste que monte order com `customer_email` e chame com email errado (mesmo tamanho e tamanho diferente) esperando 404 idêntico. |
| **Correção** | Ver TEST-03/04 (AAA). Mockar `loadOrder`; email errado mesmo tamanho → 404; tamanho diferente → 404 (sem 500); assertar `recordSecurityEvent` com `provided_email_hash` (não email cru); comparar corpo/status com pedido inexistente. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-05 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/verify-payment.js:104-119`; `routes/payment.routes.js:18-24` vs `routes/api-compat.routes.js:162-169` |
| **Problema** | (1) Idempotência de verify-payment (early-return quando já approved/completed; reuso de tokens) sem teste. (2) O mesmo handler é exposto **SEM rate limiter** em `routes/payment.routes.js:18-24` (`GET /payments/verify`), enquanto `api-compat.routes.js` aplica `verifyPaymentLimiter` (60/min) só em `/verify-payment`. |
| **Impacto** | Sem early-return, cada poll da tela de sucesso reconsulta o MP e pode recriar tokens. A rota `/payments/verify` desprotegida é bypass total do controle anti-varredura de um endpoint que retorna PII + download tokens — atacante enumera sem rate limit. Nenhum teste de rota detecta isso. |
| **Repro/PoC** | `GET /payments/verify` repetidamente não é limitado (sem middleware na rota); confirmado em `payment.routes.js:18-24` vs `api-compat.routes.js:169`. `supertest` não está no `package.json`. |
| **Correção** | Teste unitário: order já approved → sem `fetchPaymentByOrderId`/`createTokensForOrder`. Teste de integração (supertest): `/payments/verify` responde 429 após o limite; aplicar `verifyPaymentLimiter` também em `payment.routes.js`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-06 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/download.js:29-31,33-35,42-48,55-61`; `api/__tests__/api-endpoints.test.js:63-72` |
| **Problema** | O único teste cobre só token vazio → 400. Os ramos de autorização — token inexistente → 401, já usado → 401, expirado → 401, produto sem `download_url` → 404 — e o uso-único atômico (UPDATE condicional `used:'is.false'` + checagem `claimed.length===0`) não têm teste. |
| **Impacto** | Toda a lógica de uso-único/expiração do download digital pago pode regredir silenciosamente. Inverter a ordem ou afrouxar a comparação torna o token reutilizável/eterno, liberando o produto pago indefinidamente — perda de receita e vazamento de conteúdo. |
| **Repro/PoC** | Não há teste que monte `tokenRecord` com `used=true` / `expires_at` no passado / null e asserte 401. |
| **Correção** | Ver TEST-05/06/07 (AAA). Mockar `getTableRow('download_tokens')`; assertar 401/404 nos ramos e que `updateTable` NÃO é chamado (token não é queimado) nos ramos de erro; travar o filtro condicional `used:'is.false'`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-07 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `supabase/security-hardening.sql:36-81,92-95`; `supabase/migrations/*.sql`; `vite.config.js` (runner jsdom) |
| **Problema** | ZERO testes automatizados exercitam RLS. Não há pgTAP, `*.test.sql`, e o runner é Vitest+jsdom (incapaz de avaliar policies Postgres). Sem teste: `orders_own_read`, `order_items_via_orders`, `user_products_own_read`, `profiles_own_read/update`, e o padrão implícito "RLS on + sem policy = service-role only" (settings, download_tokens, coupons, security_events, admin_audit_log). |
| **Impacto** | RLS **é** o boundary de autorização do browser (`supabase-browser.js:27` usa anon key). `orders` contém PII (cpf/phone/email) e `mercadopago_data`. Um `using(true)`, `disable row level security` ou WITH CHECK removido em `profiles` (escalonamento CUSTOMER→ADMIN) vaza PII cross-tenant ou concede privilégio — regressão silenciosa, sem gate. |
| **Repro/PoC** | N/A — nenhuma infra de teste de DB existe. |
| **Correção** | Postgres efêmero (`supabase start`) com dois clientes (anon+JWT A/B; service_role para semear): user A não lê pedidos/itens/user_products de B; UPDATE de `profiles` não seta `role='ADMIN'`; SELECT anon em settings/download_tokens/coupons → 0 linhas; `analytics_events_public_insert` rejeita evento fora da whitelist. Alternativa pgTAP. Adicionar workflow CI como gate. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-08 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/cron-email-jobs.js:37-50,116-129`; `api/admin-cleanup-events.js:15-28` |
| **Problema** | Nenhum teste cobre esses handlers. Sem teste: `isAuthorized()` rejeitar com `CRON_SECRET` vazio (fail-closed), comparação timing-safe com catch→false, idempotência de envio por (email,kind,entityId), e o gate `ensureAdminSession` do cleanup (que apaga `analytics_events >180d` via RPC service-role). |
| **Impacto** | Sem teste do gate, regressão fail-open expõe disparo de email em massa a chamadas anônimas (spam/reputação) e exclusão permanente de analytics a qualquer um. Sem teste de idempotência, cada execução horária reenvia os mesmos lembretes. |
| **Repro/PoC** | N/A — ausência total de testes; `isAuthorized` e `ensureAdminSession` sem cobertura. Discrepância confirmada: docstring `cron-email-jobs.js:27-29` promete fallback de "sessão admin válida" que não existe em `isAuthorized`. |
| **Correção** | `cron-email-jobs.test.js`: sem `CRON_SECRET` → 401; segredo errado (timing-safe) → 401; tamanho divergente não lança; log 'sent' bloqueia reenvio. `admin-cleanup-events.test.js`: sem cookie → 401 antes do RPC; método ≠ POST → 405; origem não-allowlisted sem `Access-Control-Allow-Credentials`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-09 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/__tests__/webhook-signature.test.js:117-137`; `lib/mercadopago-config.js:108-129` |
| **Problema** | O teste de assinatura HMAC válida cobre o caminho positivo, mas a guarda de comprimento antes de `crypto.timingSafeEqual` não é exercitada: `'deadbeef'` (8 chars) tem comprimento ≠ hash sha256 (64), então `timingSafeEqual` nunca é alcançado com comprimentos iguais-mas-hash-diferente. Sem teste: x-signature/x-request-id ausentes isolados, ts/v1 malformado, `WEBHOOK_SECRET` ausente. |
| **Impacto** | Se a guarda de comprimento for removida, `timingSafeEqual` lança (buffers de tamanhos diferentes) → 500 em vez de 401, ou abre canal de timing. Um v1 de 64 chars errado (comprimento igual) nunca é testado — a comparação timing-safe não tem caso negativo de hash-mismatch de mesmo tamanho. |
| **Repro/PoC** | Enviar x-signature com v1 de 64 hex chars inválido → deveria 401; não há teste. Enviar sem x-signature → deveria 401; não há teste. |
| **Correção** | Adicionar casos (`APP_ENV=production`): v1 de 64 chars hex incorreto → 401; x-signature ausente → 401; x-request-id ausente → 401; ts/v1 malformado → 401; `WEBHOOK_SECRET` deletado → 401. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-10 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/__tests__/api-endpoints.test.js:74-83`; `api/admin-products.js:~253` |
| **Problema** | O teste "admin-products responde preflight OPTIONS" assere só `statusCode 200` e `res.end` 1x. Não verifica headers CORS nem — criticamente — o gate `ensureAdminSession`: nenhum caso de 401 para requisição sem cookie admin válido. O OPTIONS retorna **antes** do gate. Nenhum verbo CRUD é exercitado. |
| **Impacto** | O controle de acesso do CRUD administrativo (preço/catálogo, via `serviceRoleHelpers` que bypassa RLS) fica totalmente sem teste. Uma regressão que removesse/pulasse `ensureAdminSession` liberaria escrita administrativa sem nenhum teste falhar. |
| **Repro/PoC** | Remover o gate: nenhum teste quebra (o único teste toca apenas o ramo pré-gate de OPTIONS). |
| **Correção** | Adicionar: GET/POST/PUT/DELETE sem cookie admin → 401 (mock `ensureAdminSession` não autorizado) e que nenhuma escrita é alcançada; assertar `Access-Control-Allow-Methods/Headers` no preflight; `setAdminCorsHeaders` não reflete origem fora da allowlist com credenciais. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-11 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/webhook.js:103-119` (sem reconciliação de valor); `lib/mercadopago-config.js:104-129` (sem janela anti-replay) |
| **Problema** | Duas defesas **ausentes no código** e sem teste-âncora: (1) o webhook grava order como completed sem reconciliar `payment.transaction_amount` contra `order.total_amount` (`transaction_amount` nunca é lido); (2) não há janela anti-replay — o manifest HMAC inclui `ts` mas o validador nunca compara `ts` com o relógio. |
| **Impacto** | Pagamento aprovado de valor menor ainda libera tokens (sem reconciliação server-side). Replay de notificação válida antiga é aceito pela assinatura (mitigado quanto a re-liberação por idempotência atômica, mas a assinatura passa). Sem teste-âncora, ninguém percebe que essas proteções não existem. |
| **Repro/PoC** | Reenviar o mesmo webhook assinado válido após horas → aceito (`ts` não verificado). Aprovar pagamento com `transaction_amount < total_amount` → tokens liberados (sem reconciliação). |
| **Correção** | Testes que documentem/imponham: (a) falha se order for marcada completed quando `transaction_amount != total_amount` (após adicionar reconciliação); (b) rejeição 401 de assinatura com `ts` fora da janela (após adicionar validação). Até a correção, registrar a lacuna com teste skip/documentado. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-12 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `src/providers/CartProvider.jsx:1-78` (sem arquivo de teste) |
| **Problema** | O `CartProvider` — única fonte de verdade do carrinho que alimenta o payload de `/create-payment` — não possui nenhum teste. Invariantes não travadas: dedup por `String(item.id)===String(product.id)`, normalização `price→Number||0`, persistência round-trip `readCart/writeCart`, `clearCart`. |
| **Impacto** | Regressão (comparação estrita sem `String()`, ou quebra do `useEffect` de persistência) duplicaria itens ou perderia o carrinho no reload, corrompendo o que vai ao pagamento — sem alarme. |
| **Repro/PoC** | Glob `src/**/*.test.{js,jsx}` retorna só 3 páginas; `CartProvider` não é importado por nenhum teste (só mocks de `useCart` em ProductsPage/CheckoutPage). |
| **Correção** | `src/providers/__tests__/CartProvider.test.jsx` com consumidor de teste: addToCart 2× mesmo id → `{ok:false}` e cart inalterado; price inválido → `Number||0`; mock `readCart/writeCart` para provar hidratação no mount e `writeCart` a cada mudança; `clearCart` esvazia. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-13 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `src/providers/AuthProvider.jsx:50-70,107-118`; `src/services/customer-auth.js:96-133` |
| **Problema** | Toda a entrada de identidade do cliente via OAuth está descoberta. `AuthProvider` (bootstrap, hidratação pós-OAuth, sanitização de `setCustomerSession`) e `customer-auth.js` (`consumeCustomerSessionFromAuthCallback`, `normalizeUser`) sem testes. |
| **Impacto** | `AuthProvider` só aceita callbackSession com email; `setCustomerSession` rejeita sessão sem email e normaliza role para lowercase (usado em gating); `customer-auth.js` exige `access_token` antes do backend e só persiste se `response.ok && success===true`; `normalizeUser` rejeita user sem uid/email. Regressão que aceite sessão sem email/access_token ou pule a normalização atribui identidade incorreta ou cria sessão sem verificação. |
| **Repro/PoC** | Não existem `src/services/__tests__/` nem `src/providers/__tests__/`. `useAuth`/`setCustomerSession` aparecem só como `vi.mock` stubs nos testes de página. |
| **Correção** | `customer-auth.test.js`: sem `access_token` → null e limpa params; backend `!ok` → null; sucesso → `normalizeUser`; sem uid/email → null. `AuthProvider.test.jsx`: bootstrap com erro → `adminAuthenticated=false`/`customerSession=null`/`authReady=true`; callback sem email não altera sessão; `setCustomerSession` sanitiza role e rejeita sem email. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-14 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `src/pages/CheckoutPage.jsx:123-133`; `src/pages/__tests__/CheckoutPage.test.jsx` (só cobre rejected e timeout) |
| **Problema** | O caminho `'approved'` do polling de verify-payment — o fluxo feliz do pagamento — NÃO tem teste. O ramo approved chama `clearInterval`, `clearCart()`, `pushToast success`, `setStatus` e `navigate('/downloads?...&success=1')` e nunca é exercitado. |
| **Impacto** | Regressão no ramo approved pode deixar o cliente pago sem redirecionamento, com carrinho não esvaziado (risco de re-cobrança), ou com `clearInterval` não chamado gerando polling infinito a cada 4s. É o caminho de maior valor de conversão e está sem trava. |
| **Repro/PoC** | Os 3 `it` existentes (linhas 40, 51, 88) nunca injetam `paymentStatus='approved'`. Não há mock de `react-router-dom` nem captura de `useNavigate`. |
| **Correção** | Adicionar teste: create-payment success + verify-payment com `paymentStatus='approved'`, clicar "Ir para pagamento" e assertar `clearCart` chamado, `navigate` com URL contendo `/downloads` e `success=1`, `clearInterval` chamado. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-15 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `src/pages/DownloadsPage.jsx:14-79` (`usePendingOrderPolling`); `DownloadsPage.test.jsx` (só vazio e erro de token) |
| **Problema** | O hook `usePendingOrderPolling` não tem cobertura. As transições do polling (approved, rejected/cancelled, `maxAttempts=12`) e o `clearInterval` nunca são exercitados; os 2 testes existentes montam sem order pending, então a guarda retorna cedo. |
| **Impacto** | Regressão na condição de guarda (`orderId && orderEmail && paymentStatus==='pending'`) ou na ausência de `clearInterval` gera requisições infinitas a `/verify-payment` (carga no backend) ou nunca libera arquivos do cliente pago. |
| **Repro/PoC** | Os 2 `it` usam `customerSession:null` e rota sem pending — o hook retorna cedo e nunca roda. |
| **Correção** | `usePendingOrderPolling.test.jsx` com `renderHook`, mock de `setInterval/clearInterval` e fetch: não inicia intervalo quando `paymentStatus!='pending'`; 'approved' → `setOrder`+`pushToast`+`clearInterval`; após `maxAttempts` → pausa+`clearInterval`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-16 |
| **Severidade** | ALTO |
| **Confiança** | Média |
| **Local** | `src/pages/DownloadsPage.jsx:107-114,137` |
| **Problema** | A precedência e normalização de `orderId`/`orderEmail` (query.order ‖ localStorage; email com fallback de 3 fontes + `trim().toLowerCase()`) não é testada. O email é o controle anti-IDOR que autoriza ver `downloadTokens` do pedido. |
| **Impacto** | Regressão na precedência (não dar lowercase, ou priorizar email errado de `customerSession` sobre o da query) pode bloquear pedidos legítimos ou montar a consulta com email indevido, expondo/ocultando pedidos. Não há trava sobre a URL exata enviada a `/verify-payment`. |
| **Repro/PoC** | `DownloadsPage.test.jsx:34-48` usa email já-minúsculo e só checa mensagem de erro; nenhum assert sobre a query string montada. |
| **Correção** | Teste com `/downloads?order=ORD-1&email=Cliente@Teste.com` mockando fetch e assertando que a URL chamada contém `orderId='ORD-1'` e `email='cliente@teste.com'` (normalizado); cobrir precedência localStorage quando query ausente. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-17 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `.github/workflows/lighthouse.yml:9-34`; `.github/workflows/email-cron.yml:21-38`; `package.json:15` |
| **Problema** | Nenhum dos 2 workflows executa a suíte de testes. `lighthouse.yml` roda só `npm ci` + `npm run build` + `lhci autorun`; `email-cron.yml` só dispara um curl. Os scripts `test`/`check` nunca são invocados em CI. |
| **Impacto** | Os 12 testes (incluindo o único teste de assinatura HMAC do webhook e as validações de schema de pagamento) NÃO são gate de merge. Qualquer PR que quebre/remova testes de segurança/pagamento entra em `main` sem detecção. Módulos críticos sem cobertura também nunca serão protegidos por CI mesmo após escritos. |
| **Repro/PoC** | Abrir PR contra `main` que altere um teste para `expect(true).toBe(false)`: os checks do PR (só Lighthouse) passam; o merge não é bloqueado. |
| **Correção** | Adicionar `.github/workflows/test.yml` em `pull_request` e `push` para main: `checkout@v4`, `setup-node@v4` (node 20, cache npm), `npm ci`, `npm run test` (ou `npm run check`). Tornar `required status check` na proteção de branch de `main`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-18 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/webhook.js:110-163`; `api/verify-payment.js`; `api/download.js:20-83` (fluxo ponta-a-ponta) |
| **Problema** | Não existe teste de integração que exercite o fluxo de compra ponta-a-ponta (create-payment → webhook aprova/gera tokens → verify-payment/download consomem o token). Os 12 arquivos são unitários/de componente isolados; nenhum liga os handlers entre si. |
| **Impacto** | Toda a lógica que conecta pagamento→entrega fica sem cobertura de contrato: idempotência da aprovação, reuso vs criação de tokens, consumo único atômico e o pareamento `order_code`↔`external_reference`. Uma regressão que quebre a ligação (token com `order_id` errado, ou order nunca vira completed) libera produto sem pagamento OU deixa cliente pago sem download — nenhum teste falha. |
| **Repro/PoC** | Introduzir bug em `webhook.js` (createDownloadTokens usando `order.order_code` em vez de `order.id`) e rodar `npm test`: todos os 12 arquivos continuam verdes. |
| **Correção** | 1 teste de integração handler-para-handler (vitest environment 'node') com fake in-memory do Supabase REST (roteando por método+path): create-payment → webhook approved → download → assertar tokens criados 1×, redirect e que a 2ª chamada de download retorna 401 "Token já utilizado". |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-19 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `api/webhook.js:110-133`; `api/download.js:55-61` |
| **Problema** | As invariantes de idempotência/atomicidade mais críticas (UPDATE condicional `payment_status:'neq.approved'` = "primeira aprovação vence"; `used:'is.false'` = "download único vence") são implementadas como UPDATE condicional no Postgres, mas nenhum teste as exercita. Só observáveis contra um banco/REST que respeite o filtro condicional e retorne linhas afetadas. |
| **Impacto** | São exatamente os pontos onde "reenvio de webhook" e "clique/prefetch duplo no download" se defendem contra duplicação. Um refactor que remova o filtro condicional (volta a PATCH incondicional) ou interprete errado o retorno de linhas afetadas reabre fraude/perda de receita. A implementação evoluiu recentemente → alto risco de regressão em manutenção. |
| **Repro/PoC** | No teste de integração (TEST-18): chamar webhook 2× com o mesmo approved → tokens criados 1× e `payment_approved` só na 1ª; chamar download 2× com o mesmo token → 1 redirect + 1 rejeição 401. |
| **Correção** | No fake in-memory, implementar a semântica `neq`/`is.false` e retorno de linhas afetadas (`Prefer: return=representation`); assertar idempotência de webhook duplicado e download concorrente. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-20 |
| **Severidade** | ALTO |
| **Confiança** | Alta |
| **Local** | `.github/workflows/lighthouse.yml:1-37`; `email-cron.yml`; `package.json:15` |
| **Problema** | Nenhum workflow executa `npm test`/`vitest run`; portanto mesmo os 12 testes existentes não são gate de merge, e qualquer teste de integração/e2e futuro também não bloquearia regressão automaticamente. |
| **Impacto** | A estratégia de testes é decorativa quanto a proteção: um PR que quebre pagamento/entrega/segurança pode ser mesclado com testes vermelhos (ou sem rodá-los). Isso multiplica o risco das lacunas de fluxo (TEST-18/19). *(Sobreposto a TEST-17; mantido por ser o eixo estratégico que amplifica todos os demais.)* |
| **Repro/PoC** | `Grep` por `vitest`/`npm test`/`npm run check` em `.github/` → zero matches. |
| **Correção** | Mesmo remédio de TEST-17: `test.yml` com `npm test` em `pull_request`/`push`, como required check no branch protection. |

---

### MÉDIO

| Campo | Detalhe |
|---|---|
| **ID** | TEST-21 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `api/create-payment.js:118-124,126,163,173`; `api/__tests__/api-endpoints.test.js:35-50` |
| **Problema** | O único teste cobre só `items:[]` → 400. NÃO há teste de que preço/subtotal usam APENAS `product.price` do banco ignorando `price` do payload; item inexistente → 404; produto inativo → 400; desconto recalculado server-side via `computeDiscount` ignorando `discount` do client; total clamp `Math.max(0,...)`. |
| **Impacto** | Pricing server-side é a defesa central contra fraude de preço. Se um refactor passar a confiar em `item.price`/`discount` do payload, o cliente paga valor arbitrário. Regressão silenciosa. *(Nota: `quantity` já é validado 1..99 em runtime — a sub-alegação original de quantity sem clamp foi refutada.)* |
| **Repro/PoC** | Enviar `item {productId, price:0.01}` com produto real de R$100 no banco: não há teste asserting que subtotal usa 100. |
| **Correção** | Mockar `getTableRow('products')`: payload com price forjado → total baseado no preço do banco; `productId` inexistente → 404 e nenhum `insertIntoTable('orders')`; inativo → 400; `couponCode` com discount forjado → desconto do coupon do banco; desconto fixo > subtotal → total ≥ 0. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-22 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `api/webhook.js:103-119`; `lib/mercadopago-config.js:104-129` |
| **Problema** | Duas lacunas de segurança no código (não só de teste): (1) ausência de janela anti-replay (o `ts` entra no manifest mas nunca é comparado ao relógio); (2) ausência de reconciliação de valor (`transaction_amount` não é lido). *(Consolida parcialmente TEST-11 na ótica de cobertura; replay tem mitigação por idempotência atômica, reduzindo severidade.)* |
| **Impacto** | Replay de notificação aprovada antiga é aceito pela assinatura (mas a transição atômica `neq.approved` impede re-liberação de tokens novos). Pagamento aprovado de valor menor ainda libera o produto, pois o status é a única condição. |
| **Repro/PoC** | Reenviar webhook assinado válido após horas → aceito. Aprovar com `transaction_amount < total_amount` → tokens liberados. |
| **Correção** | Implementar e testar janela de `ts` (rejeitar > 5 min) e reconciliação `transaction_amount == total_amount` antes de criar `download_tokens`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-23 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `validation/__tests__/schemas.test.js:47`; `validation/payment.schemas.js` |
| **Problema** | O caso rotulado `'__proto__'` só rejeita porque `items:[]` viola `min(1)` — não por defesa contra prototype pollution. O teste verifica só `.success`, nunca `.data`/protótipo. `{ __proto__:{...}, ...validPayload }` com items válidos parseia `success:true`. Defesa anti-XSS de `downloadUrl` só testa `javascript:` (não `data:`/`file:`/`vbscript:`). |
| **Impacto** | Falsa sensação de cobertura de prototype pollution: o rótulo sugere uma defesa que não é asserida. Regressão real de poluição passaria. |
| **Repro/PoC** | `safeParse` com payload `__proto__` + items válidos → `success:true`; o teste continua verde por outro motivo. |
| **Correção** | Trocar por payload com items válidos + `__proto__` e assertar `Object.getPrototypeOf(out.data)` e ausência da chave poluída; adicionar `data:`/`file:`/`vbscript:` para `downloadUrl` e asserts sobre `out.data`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-24 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `api/validate-coupon.js:34-48,57-79` |
| **Problema** | `validate-coupon.js` (helpers reusados por `create-payment.js`) não tem teste. Sem cobertura: `computeDiscount` (`Math.min(fixed,base)`, clamp pct 0-100, base≤0), `validateCouponState` (exhausted, expired/not_yet_valid, below_min), `buildEligibleSet` (applies_to como String). |
| **Impacto** | `computeDiscount` é reusado server-side para o total cobrado no MP. Cupom fixo > subtotal, percent>100, ou expirado/esgotado aplicado indevidamente é perda financeira direta. *(Nota: `used_count` agora é incrementado atomicamente via RPC — a sub-alegação de "única defesa do limite" foi ajustada.)* |
| **Repro/PoC** | N/A — nenhum teste do módulo; qualquer regressão nos clamps/janelas passa. |
| **Correção** | `validate-coupon.test.js`: fixo R$500 em base R$50 → desconto=50; percent 150 → 100; `valid_until` passado → expired; `used_count>=max_uses` → exhausted; `subtotal<min_order_amount` → below_min; `applies_to` por categoria → desconto só sobre `eligibleSubtotal`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-25 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/pages/__tests__/CheckoutPage.test.jsx:40-127`; `src/pages/CheckoutPage.jsx:192-210` |
| **Problema** | Nenhum dos 3 testes inspeciona o corpo enviado a `/create-payment`. O payload envia só `{productId, quantity}` por item (server-side pricing), mas nada trava isso; o teste "preenche dados com a sessão" é essencialmente um smoke que confirma o próprio mock de `useAuth`. |
| **Impacto** | O invariante de pagamento (cliente nunca envia preço) fica sem rede de segurança secundária; uma regressão que passasse a incluir `item.price`/`total` no body não quebraria nenhum teste. |
| **Repro/PoC** | Editar `CheckoutPage.jsx:193` para incluir `price: item.price` — a suíte continua verde. |
| **Correção** | No teste 'rejected', capturar `JSON.parse(globalThis.fetch.mock.calls[0][1].body)` e assertar que cada item tem exatamente `{productId, quantity}` e ausência de qualquer chave monetária. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-26 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/pages/__tests__/CheckoutPage.test.jsx:88-114`; `CheckoutPage.jsx:100,106` |
| **Problema** | O teste de timeout itera o callback exatamente 152 vezes (`for i<152`), número mágico acoplado ao `maxAttempts=150` interno. O mock de `setInterval` ignora o intervalo de 4000ms e executa sincronamente; `clearInterval` é no-op — agendamento/cleanup reais nunca validados. |
| **Impacto** | Acoplamento frágil: se `maxAttempts` mudar, o teste quebra ou passa pelo motivo errado. O cleanup/`clearInterval` nunca é validado — vazamento de timer/loop infinito não seria detectado. |
| **Repro/PoC** | Alterar `maxAttempts` para 200: o loop de 152 não alcança o ramo de timeout e o `waitFor` falha por timeout. |
| **Correção** | Usar `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(maxAttempts*4000)` para exercitar o agendamento real e assertar `clearInterval`; ou derivar o número de iterações de uma constante exportada. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-27 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/pages/__tests__/DownloadsPage.test.jsx:19-32` |
| **Problema** | O teste "mostra estado vazio" mocka fetch para `{success:true, orders:[]}`, mas a rota não tem param `order` e localStorage está vazio, então `loadOrder` retorna ANTES de chamar fetch. O mock de fetch é código morto: nunca é invocado. (O shape `{orders:[]}` pertence a `/customer-orders`, não a `/verify-payment`.) |
| **Impacto** | Falso indício de cobertura: aparenta testar o ramo `orders:[]` da API, mas o estado vazio asserido vem apenas do `orderId` ausente. O caminho real de resposta vazia da API fica sem teste. |
| **Repro/PoC** | Remover o mock fetch inteiramente — o teste continua passando. |
| **Correção** | (a) remover o mock enganoso e renomear o teste para "orderId ausente"; ou (b) teste separado com order+email válidos e mock de resposta vazia para exercitar o ramo real. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-28 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/pages/__tests__/ProductsPage.test.jsx:30-50` |
| **Problema** | Único teste da página: renderiza 1 produto e verifica nome/descrição. Hooks mockados mas nenhuma interação exercitada; `addToCart` retorna `{ok:true}` hardcoded e nunca é chamado. Nenhum caminho de erro, vazio, filtro, ordenação ou add-to-cart é asserido. |
| **Impacto** | Teste de fumaça: cobre só o happy-path de render de 1 card. O núcleo da página (filtragem/ordenação, add-to-cart, estados loading/erro/vazio) fica sem cobertura. |
| **Repro/PoC** | Único `it` (linha 30) com 2 asserts de texto. |
| **Correção** | Adicionar: `fetchProducts` rejeitado → "Erro ao carregar produtos"; `[]` → "Nenhum produto encontrado"; clique em "Adicionar" → `addToCart`+`pushToast`; ao menos um caso de filtro/ordenação via `useProductFilters`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-29 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `api/__tests__/api-endpoints.test.js:35-72` |
| **Problema** | Os 3 casos (create/verify/download) cobrem só 1 ramo de erro de borda por endpoint. Os caminhos de segurança centrais não são tocados: anti-enumeração timing-safe (verify), uso-único/expiração de token (download), email obrigatório (create). |
| **Impacto** | `securityRegressionValue` baixo: pega regressão trivial nos guards de entrada, mas NÃO pega regressões de autorização/autenticação/anti-enumeração — os vetores que importam. |
| **Repro/PoC** | Ver TEST-04/TEST-06 (mesma lacuna vista pela ótica do arquivo de testes agregado). |
| **Correção** | Acrescentar casos para verify-payment (email mismatch → 404 idêntico) e download (token inválido/usado/expirado → 401), mockando as libs de Supabase. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-30 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/utils/__tests__/analytics.test.js:90-104` (estado em `analytics.js:35,227-235`) |
| **Problema** | O Set module-level `trackedPurchases` acumula orderIds entre testes e nunca é resetado (`vi.restoreAllMocks` não limpa Sets do módulo; sem `vi.resetModules`). Os testes passam só porque ORD-123/ORD-A/ORD-B não colidem. |
| **Impacto** | Fragilidade real de dependência de ordem/estado: se um teste futuro reusar um orderId ou a ordem mudar, `toHaveBeenCalledTimes` quebra silenciosamente sem o código estar errado — falso negativo de regressão. Além disso, dedup e conteúdo do payload (incluindo remoção de PII/LGPD) não são asseridos (só contagem de fetch). |
| **Repro/PoC** | Adicionar `trackPurchaseOnce('ORD-A', {value:1})` antes do teste da linha 100 → o `expect Times(2)` falha. |
| **Correção** | `vi.resetModules()` em beforeEach + reimport dinâmico, OU exportar helper de reset do Set; inspecionar `fetch.mock.calls[0][1].body` e assertar `transaction_id===orderId`, `session_id` e ausência de chaves PII. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-31 |
| **Severidade** | MÉDIO |
| **Confiança** | Média |
| **Local** | `src/utils/__tests__/analytics.test.js:124-131` (caminho `analytics.js:120-126`) |
| **Problema** | As asserções de fetch dependem de `navigator.sendBeacon` estar undefined no jsdom: `postEventToBackend` tenta `sendBeacon` ANTES de fetch. O teste nunca anula/controla `navigator.sendBeacon`. |
| **Impacto** | Cobertura acidental dependente do ambiente: o caminho preferencial em produção (`sendBeacon`) nunca é testado e o caminho fetch só é exercitado por sorte da config do jsdom. Um upgrade/polyfill que defina `sendBeacon` faria TODAS essas asserções falharem. |
| **Repro/PoC** | Definir `globalThis.navigator.sendBeacon = vi.fn(() => true)` no beforeEach → o teste de evento essencial falha (fetch nunca chamado). |
| **Correção** | Definir `globalThis.navigator.sendBeacon = undefined` (ou `vi.fn` controlado) no beforeEach para tornar o caminho determinístico; adicionar um teste do ramo `sendBeacon`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-32 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `api/verify-payment.js:104-119,8-19` |
| **Problema** | Sem teste para: (a) early-return quando order já approved/completed; (b) não-duplicação de tokens (reusa `existingTokens`); (c) filtro que só considera payment 'approved' com `external_reference` exatamente igual. |
| **Impacto** | Verify-payment é chamado repetidamente pelo polling. Regressão na idempotência geraria tokens duplicados por poll; afrouxar o filtro de status/`external_reference` liberaria downloads para pagamento não confirmado ou de outra order. |
| **Repro/PoC** | Único teste (`api-endpoints.test.js:52-61`) só cobre o 400 de `orderId` obrigatório; nunca mocka `loadOrder`/`fetchPaymentByOrderId`. |
| **Correção** | Mockar `loadOrder`+`fetchPaymentByOrderId`: order já approved → nenhuma chamada a fetch/createTokens; tokens existentes → sem `insertIntoTable`; MP com status≠approved ou `external_reference` divergente → null. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-33 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/hooks/useProductFilters.js:1-181` (sem teste direto) |
| **Problema** | O hook que é o cerne da ProductsPage (filtro categoria/preço/preset, ordenação, sync de query params) não tem teste direto. Zero cobertura de `sortProducts`, faixas de preço 0-25/25-50/50+, `matchesPreset('novidades')` janela 7 dias, sync de query `categoria`/`preset`. |
| **Impacto** | Bug de borda na faixa de preço ou no casamento de categoria por query exibe produtos/preços errados antes do checkout (re-validado server-side, daí MÉDIO). |
| **Repro/PoC** | `Grep 'useProductFilters'` em testes = nenhum resultado; `src/hooks/__tests__/` não existe. |
| **Correção** | `useProductFilters.test.jsx` com `renderHook` dentro de `MemoryRouter` (`?categoria=...&preset=...`), mock de `fetchProducts`: assertar filtro por faixa de preço, ordenação, e preset `novidades` por `createdAt < 7 dias`; fake timers para `Date.now()`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-34 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/pages/CheckoutPage.jsx:183-186,430` (guarda de carrinho vazio) |
| **Problema** | Não há teste de que `onSubmit` aborta com "carrinho está vazio" e não chama `/create-payment` quando `cart.length===0`, nem de que o botão fica `disabled`. O mock de `useCart` sempre fornece 1 item. |
| **Impacto** | Regressão que remova a guarda criaria pedidos órfãos/zerados no backend a partir de carrinho vazio. |
| **Repro/PoC** | `CheckoutPage.test.jsx:6-14` hardcoda cart com 1 item em todos os testes. |
| **Correção** | Teste com `useCart` retornando `cart:[]`/`total:0`: botão `disabled`; ao forçar submit, `/create-payment` NÃO é chamado e aparece a mensagem de carrinho vazio. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-35 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/pages/CheckoutPage.jsx:49-76` (abandoned-cart, debounce 1.5s) |
| **Problema** | O effect de carrinho abandonado (POST `/abandoned-cart` com debounce 1500ms, validação de email por regex, keepalive, `.catch` silencioso) não tem nenhum teste. |
| **Impacto** | Captura PII (email+itens). Regressão que remova a validação/debounce enviaria dados parciais/inválidos a cada tecla; e quebra do `.catch` poderia derrubar o fluxo de pagamento. A garantia "falha silenciosa não quebra checkout" não está travada. |
| **Repro/PoC** | Nenhum dos 3 testes manipula `watchedEmail` nem avança timers para o debounce de 1.5s. |
| **Correção** | Fake timers: email inválido → nenhuma chamada; email válido + 1500ms → exatamente 1 POST com email normalizado e items mapeados; fetch rejeitado → não lança. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-36 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/pages/CheckoutPage.jsx:395-420`; `DownloadsPage.jsx:301-304` (validação de formulário) |
| **Problema** | As validações react-hook-form (name required + minLength 3, email required + pattern) e suas mensagens `role='alert'` nunca são asseridas. Os testes submetem só com dados válidos ou nem submetem. |
| **Impacto** | Regressão que afrouxe a validação (remover pattern de email) permitiria submeter dados inválidos ao backend de pagamento/consulta. As mensagens acessíveis (`role='alert'`) não têm trava. |
| **Repro/PoC** | `CheckoutPage.test.jsx` só clica submit com email/nome válidos; nenhum assert sobre `errors`/`role=alert`. |
| **Correção** | Submeter com nome <3 chars e email sem `@`; assertar mensagens via `getByRole('alert')`/`findByText` e que o fetch de pagamento NÃO é chamado. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-37 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `src/pages/DownloadsPage.jsx:192-219,355-378,380-410` |
| **Problema** | A busca por e-mail (POST `/customer-orders`), a renderização do histórico e a liberação de links de download (`a href=/api/download?token=`) no caminho approved não têm teste. Os 2 testes cobrem só vazio e erro de token. |
| **Impacto** | O caminho feliz pós-aprovação — que efetivamente entrega os arquivos pagos — e a busca por email estão descobertos. Regressão que quebre a montagem do `href` do token ou a listagem deixa o cliente pago sem acesso, sem alarme. |
| **Repro/PoC** | `DownloadsPage.test.jsx:19-48` nunca injeta `order.paymentStatus='approved'` nem submete o form de busca. |
| **Correção** | (a) submeter form de email + mock `/customer-orders` com lista → assertar "Pedido #..." e "Abrir pedido"; (b) rota com order aprovado + `downloadTokens` → assertar links com `href` contendo `/api/download?token=`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-38 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `webhook.js:78-88` (`recordSecurityEvent` no 401); `webhook-signature.test.js:55-89` |
| **Problema** | Os dois testes de 401 cobrem o gate de assinatura mas NÃO asseram o efeito de auditoria `recordSecurityEvent('webhook_invalid_signature')` nem seus campos (ip, has_signature_header, payment_id). É a trilha de detecção de tentativa de forja. |
| **Impacto** | Uma regressão que silencie o registro de tentativas de assinatura inválida deixaria ataques de forja invisíveis sem nenhum teste falhar. |
| **Repro/PoC** | Remover/condicionar a chamada `recordSecurityEvent` no 401: os testes continuam verdes (só checam status/body). `setupTests.js` não mocka `security-logger`. |
| **Correção** | Estender os testes de 401: spy em `recordSecurityEvent` e assertar chamada 1× com `eventName 'webhook_invalid_signature'` e `properties.payment_id` derivado de `req.body.data.id`. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-39 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `lib/mercadopago-config.js:108-129`; `webhook-signature.test.js` |
| **Problema** | Complemento de TEST-09 pela ótica do validador: os `return false` de `WEBHOOK_SECRET` ausente (fail-closed) e ts/v1 malformado nunca são exercidos. *(A sub-alegação de "x-signature/x-request-id ausentes não testados" foi refutada — o caso `headers:{}` cobre a guarda combinada.)* |
| **Impacto** | Regressão fail-open quando o secret está ausente passaria sem teste; ramo timing-safe de mesmo comprimento com hash diferente não coberto. |
| **Repro/PoC** | `beforeEach` sempre define `WEBHOOK_SECRET`; nenhum teste o remove. |
| **Correção** | Casos com `WEBHOOK_SECRET` removido → 401; v1 de 64 chars hex incorreto → 401; ts/v1 malformado → 401. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-40 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `routes/payment.routes.js:18-24` vs `routes/api-compat.routes.js:162-169` |
| **Problema** | `verifyPaymentHandler` é exposto em duas rotas: `/verify-payment` com `verifyPaymentLimiter` e `/payments/verify` SEM rate limiter. Nenhum teste de rota prova a presença/ausência do limiter. *(Complemento de rota de TEST-05.)* |
| **Impacto** | Endpoint retorna PII + download tokens; `/payments/verify` é bypass total do controle anti-varredura, e o limiter da outra rota pode ser removido sem nenhum teste falhar. |
| **Repro/PoC** | Chamadas repetidas a `GET /payments/verify` não recebem 429; a mesma carga em `/verify-payment` recebe. |
| **Correção** | Teste de integração (supertest): >60× em `/verify-payment` → 429; aplicar `verifyPaymentLimiter` em `payment.routes.js` e cobrir com 429. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-41 |
| **Severidade** | MÉDIO |
| **Confiança** | Média |
| **Local** | `package.json:53-67`; ausência de config de lint/format na raiz |
| **Problema** | Não existe ESLint nem Prettier no projeto (nenhum em dependencies/devDependencies; nenhum arquivo de config na raiz; sem script `lint`). |
| **Impacto** | Nenhuma análise estática automatizada roda em dev ou CI. Bugs detectáveis por lint (vars não usadas, `no-undef`, promessas não-tratadas, hooks React mal usados, `==` vs `===`) e inconsistência de formato passam sem barreira. |
| **Repro/PoC** | `npm run lint` → falha (script inexistente). Config de lint na raiz → inexistente (só sob `node_modules/`). |
| **Correção** | Adicionar `eslint` + `@eslint/js` + `eslint-plugin-react-hooks` + `eslint-plugin-react` (+ prettier + eslint-config-prettier); `eslint.config.js` na raiz; scripts `lint`/`format:check`; incluir `npm run lint` no CI de testes (TEST-17). |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-42 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `vite.config.js:28-32`; `package.json:15-17` |
| **Problema** | Não há configuração de cobertura: o bloco `test` só define environment/globals/setupFiles, sem `coverage`; nenhum provider (`@vitest/coverage-v8`) nem script `test:coverage`. |
| **Impacto** | Impossível medir ou impor limiar mínimo de cobertura. Módulos com cobertura zero (webhook approved, verify-payment, admin-login, sessões, auth.middleware) não aparecem em relatório — a lacuna é invisível e não há thresholds que falhem o build. |
| **Repro/PoC** | `npx vitest run --coverage` → erro pedindo instalar provider. |
| **Correção** | `@vitest/coverage-v8`; `test.coverage = { provider:'v8', reporter:['text','lcov'], thresholds }`; script `test:coverage`; rodar coverage no CI (após TEST-17). |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-43 |
| **Severidade** | MÉDIO |
| **Confiança** | Média |
| **Local** | `.github/workflows/lighthouse.yml:3-7`; `lighthouserc.json:14-22` |
| **Problema** | O pipeline de PR investe em Lighthouse como gate (assertions `error`) mas não roda nenhum teste funcional/unitário. Gate de qualidade cosmética sem gate de corretude. |
| **Impacto** | Prioridade de CI invertida para um e-commerce que processa pagamentos: queda de score de a11y bloqueia o merge, mas regressão na validação de assinatura do webhook ou no preço server-side não bloqueia nada. Falsa sensação de "CI verde". |
| **Repro/PoC** | `lighthouse.yml:31-34` executa `lhci autorun` com assertions em modo error; nenhum step de teste existe. |
| **Correção** | Manter o Lighthouse, adicionar o job de testes (TEST-17) e torná-lo required; rodar testes antes/como pré-requisito do build+lighthouse. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-44 |
| **Severidade** | MÉDIO |
| **Confiança** | Baixa |
| **Local** | `.github/` (sem CODEOWNERS/dependabot); raiz (sem renovate) |
| **Problema** | Não há artefatos de governança versionados: sem `.github/CODEOWNERS`, `.github/dependabot.yml`, `renovate.json`. Proteção de branch de `main` não é confirmável por arquivo. |
| **Impacto** | Sem CODEOWNERS, mudanças em código sensível (`webhook.js`, `*-session.js`, `migrations`) não exigem revisão de dono. Sem dependabot/renovate, deps críticas (mercadopago, @supabase/supabase-js, express, helmet) não recebem update automatizado. Combinado com TEST-17, o job de testes só bloqueia se marcado required. |
| **Repro/PoC** | `.github/` contém só `workflows/`; CODEOWNERS/dependabot/renovate inexistentes. |
| **Correção** | Adicionar `.github/dependabot.yml` (npm + github-actions), `.github/CODEOWNERS` (api/, lib/, middleware/, supabase/migrations/); habilitar branch protection em `main` com job de testes como required. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-45 |
| **Severidade** | MÉDIO |
| **Confiança** | Média |
| **Local** | `src/pages/__tests__/CheckoutPage.test.jsx`; `DownloadsPage.test.jsx` (ausência de e2e) |
| **Problema** | Não há nenhum teste e2e (sem Playwright/Cypress/Puppeteer). O caminho feliz de compra pela UI real (carrinho → checkout → redirect → retorno approved → downloads) nunca é exercido ponta-a-ponta. |
| **Impacto** | Regressões de integração front↔back que só aparecem no navegador real (contrato do payload mudar, redirect perder `success=1`, polling não parar, carrinho não esvaziar) não são capturadas por nenhuma camada. O caminho de conversão é o ativo mais crítico e o único sem cobertura de aceitação. |
| **Repro/PoC** | Glob `**/{playwright,cypress,puppeteer}*` → vazio; sem script e2e em `package.json`. |
| **Correção** | Estratégia mínima: priorizar o teste de integração de handlers (TEST-18) a custo baixo; reservar 1 smoke e2e (Playwright) para o caminho de conversão feliz contra staging + MP sandbox, como gate nightly não-bloqueante. |

| Campo | Detalhe |
|---|---|
| **ID** | TEST-46 |
| **Severidade** | MÉDIO |
| **Confiança** | Alta |
| **Local** | `lib/supabase.js:85-99`; `api/webhook.js:2-6`; `api/create-payment.js:2-5`; `api/download.js:1-3` |
| **Problema** | A camada de dados usa `fetch` direto contra a REST do Supabase e os handlers importam helpers via `require` no topo, sem injeção de dependência nem client substituível. Não há seam de teste projetado; a única forma de isolar o SUT é mockar `global.fetch` ou `vi.mock` dos módulos. |
| **Impacto** | A testabilidade de integração é possível mas frágil: sem ponto de injeção, cada teste reconstrói o comportamento REST (roteamento por path/method, filtros `neq`/`is.`, `Prefer:return=representation`), elevando custo e risco de o fake divergir do Postgres real — especialmente para as invariantes de TEST-19. |
| **Repro/PoC** | `Grep` por `vi.mock(...supabase)`/`global.fetch` em testes = zero matches; os testes só alcançam early-returns antes de qualquer chamada REST. |
| **Correção** | Padronizar UMA estratégia de seam: (a) baixo custo — helper de teste que instala fake de `global.fetch` roteando por URL/método (GET/POST/PATCH com `eq`/`neq`/`is.false` e `return=representation`); ou (b) maior fidelidade — Supabase local (`supabase start`) contra Postgres real (também habilita RLS). Recomenda-se (a) para o MVP e (b) como evolução. |

---

### BAIXO

| ID | Local | Problema (resumo) | Correção |
|---|---|---|---|
| **TEST-47** | `CheckoutPage.test.jsx:52-56` | Mock de `setInterval` via microtask substitui o timing real do polling; só valida o ramo 'rejected', não o agendamento/`clearInterval`. Rótulo 'determinism' impreciso (ordenação é determinística). | `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`; assertar `clearInterval`. |
| **TEST-48** | `DownloadsPage.test.jsx:20,35` | `globalThis.fetch` atribuído direto sem `afterEach`/`restoreAllMocks` e sem `localStorage.clear()`. Fragilidade latente intra-arquivo (Vitest isola por arquivo, sem vazamento cross-file real). | `beforeEach(localStorage.clear())` + `afterEach(vi.restoreAllMocks())`; preferir `vi.spyOn(globalThis,'fetch')`. |
| **TEST-49** | `src/test/setupTests.js:6-13` | Mock GLOBAL de `../utils/analytics` silencia disparo de eventos nos testes de página. *(Impacto mitigado: a idempotência real de `trackPurchaseOnce` É coberta no unit via `vi.unmock`.)* | Nos testes de página, assertar que o mock de `trackPurchaseOnce` é chamado 1× com o orderId correto por caminho aprovado. |
| **TEST-50** | `schemas.test.js:48-50,70-72` | `it.each` de rejeição asserem só `.success===false`; nunca `.error/issues` nem o campo/código; `out.data` (defaults/coerção/trim) sem teste; `downloadUrl 'javascript:'` também falha em `z.url()`, não isolando o `.refine()`. | Assertar `out.error.issues` do campo esperado nos casos sensíveis; testar `out.data` (coerção/defaults). |
| **TEST-51** | `attribution.test.js:80` | Truncamento de UTM usa `toBeLessThanOrEqual(200)` — passaria mesmo com truncamento a 50/10; não fixa a borda exata. Padrão fraco também em `consent.test.js:68` (`toMatch(/T/)`). | Assertar valor exato na borda (`length === 200` para entrada de 500 chars). |
| **TEST-52** | `storage-signed-url.test.js:1-46` | Arquivo cobre só `parseStorageRef`. `createSignedDownloadUrl` (serviceRoleKey nos headers, clamp de TTL [60,3600], fetch, fallback) sem teste; fetch nunca mockado. | Mockar `globalThis.fetch`: clamp TTL (0→60, 99999→3600), headers apikey/Authorization, retorno null em `!ok`/throw. |
| **TEST-53** | `security-headers.test.js:40-44` | Em produção só assere que `connect-src` não contém `ws://localhost:*`, não `http://localhost:*`. Sem teste de `style-src`/`img-src`/`base-uri` nem headers Cross-Origin do middleware. | `expect(directives['connect-src']).not.toContain('http://localhost:*')`; cobrir `style-src`/`base-uri`/`img-src` e Cross-Origin-*. |
| **TEST-54** | `CheckoutPage.test.jsx:218-219` vs `DownloadsPage.test.jsx:19-32` | Dependência implícita de `lastOrderId`/`lastOrderEmail` ausentes no localStorage sem `clear()`. *(Latente: nenhum caminho de teste atual grava essas chaves; Vitest isola por arquivo.)* | `beforeEach(() => localStorage.clear())` nos dois arquivos. |
| **TEST-55** | `DownloadsPage.test.jsx:20,35` | `globalThis.fetch` reatribuído sem cleanup — stub pendura em `globalThis` após a suíte. *(Impacto de flakiness inter-arquivo refutado: consumidores reinicializam fetch no beforeEach; Vitest isola por arquivo.)* | `afterEach(vi.restoreAllMocks())` + `vi.stubGlobal('fetch',...)`; ou `restoreMocks:true` no vite.config. |
| **TEST-56** | `attribution.test.js:57-58` | `expires_at toBeGreaterThan(Date.now())` depende do relógio real sem fake timers; tautológico para qualquer TTL positivo; não cobre `expires_at === now`. | `vi.setSystemTime(fixedDate)` e assertar `expires_at === now + TTL_MS`. |
| **TEST-57** | `DownloadsPage.jsx:51-61,151-160`; `setupTests.js:6-13` | Idempotência de `trackPurchaseOnce` nos dois caminhos não validável via teste de página (analytics mockado global). *(Mitigado: dedup por chave É coberta no unit; regressão de chave seria pega lá.)* | Assertar `transaction_id` no body do fetch no unit; nas páginas, spy local por caminho aprovado. |
| **TEST-58** | `src/pages` (todo); `package.json` | Nenhum teste de acessibilidade (sem jest-axe/axe-core). aria-invalid/aria-describedby/`role='alert'`/labels sem trava de regressão. | Adicionar `jest-axe`; `expect(await axe(container)).toHaveNoViolations()`; no mínimo `getByLabelText`/`role='alert'`. |
| **TEST-59** | `ProductsPage.test.jsx:30-50` | Único `it` smoke; não cobre loading/erro/vazio/filtro/sort/add-to-cart. *(Duplicata parcial de TEST-28, mantida como visão de página.)* | Estender com erro (`mockRejectedValue`), vazio (`[]`), clique "Adicionar" → `pushToast`. |
| **TEST-60** | `vite.config.js:28-32`; `package.json:15-17` | Config Vitest é projeto único jsdom global; sem projeto 'node' para handlers api/lib. Testes de backend rodam sob jsdom por acidente. *(Mocks globais são inertes para os handlers atuais.)* | Migrar para Vitest `projects`: 'web' (jsdom, src/**) e 'node' (api/**, lib/**, validation/**, integração). |

---

### INFO

| ID | Local | Problema (resumo) |
|---|---|---|
| **TEST-61** | `attribution.test.js:108-115` | `location.search` não resetado entre testes. *(Dependência de ordem não afeta pass/fail: `buildAttributionPayload` lê só do localStorage, limpo em beforeEach. Cosmético.)* Correção: `history.replaceState({}, '', '/')` em beforeEach. |
| **TEST-62** | `package.json` + `.github/workflows/` | Nenhum workflow roda `npm test` — mesmo os testes de boa qualidade não são gate de PR. *(Eixo já capturado em TEST-17/20; mantido como INFO consolidador.)* |
| **TEST-63** | `CheckoutPage.test.jsx:52-56` | Acoplamento a microtasks/ordem de `mockResolvedValueOnce`. *('Falha intermitente' refutada: há ordenação causal estrita create→verify no código atual; sem flakiness.)* Correção: rotear `fetch` por URL + fake timers. |
| **TEST-64** | `DownloadsPage.test.jsx:20,35` | fetch global sem cleanup + localStorage não limpo. *(Vazamento inter-arquivo refutado por isolamento do Vitest; nenhum teste grava `lastOrderId`.)* Higiene de estilo. |

---

## (a) Tabela-resumo

| ID | Severidade | Local | Resumo (1 linha) |
|---|---|---|---|
| TEST-01 | CRÍTICO | `api/admin-login.js`, `lib/admin-session.js` | Login admin + 2FA + `verifySessionToken` (gate de todo o painel) com cobertura ZERO. |
| TEST-02 | CRÍTICO | `lib/customer-session.js`, `middleware/auth.middleware.js` | Sessão de cliente HMAC e middleware `authenticate`/`checkRole` sem nenhum teste. |
| TEST-03 | ALTO | `api/webhook.js:103-148` | Caminho `approved` do webhook (idempotência de tokens) nunca exercitado. |
| TEST-04 | ALTO | `api/verify-payment.js:164-186` | Anti-enumeração timing-safe + guarda de comprimento sem teste (risco de 500). |
| TEST-05 | ALTO | `api/verify-payment.js`, `routes/payment.routes.js:18-24` | Idempotência sem teste + `/payments/verify` sem rate limiter. |
| TEST-06 | ALTO | `api/download.js:29-61` | Uso-único/expiração de token e UPDATE condicional atômico sem teste. |
| TEST-07 | ALTO | `supabase/security-hardening.sql` | RLS (boundary de autorização do browser) sem nenhum teste automatizado. |
| TEST-08 | ALTO | `api/cron-email-jobs.js`, `api/admin-cleanup-events.js` | `CRON_SECRET`/idempotência e gate de exclusão em massa sem teste. |
| TEST-09 | ALTO | `webhook-signature.test.js`, `mercadopago-config.js:108-129` | Guarda de comprimento HMAC + casos negativos de mesmo tamanho não cobertos. |
| TEST-10 | ALTO | `api-endpoints.test.js:74-83`, `admin-products.js` | Gate `ensureAdminSession` do CRUD admin totalmente descoberto. |
| TEST-11 | ALTO | `webhook.js:103-119`, `mercadopago-config.js:104-129` | Sem reconciliação de valor pago e sem janela anti-replay (ausentes no código). |
| TEST-12 | ALTO | `src/providers/CartProvider.jsx` | Carrinho (fonte do payload de pagamento) sem teste: dedup/persistência. |
| TEST-13 | ALTO | `AuthProvider.jsx`, `customer-auth.js` | Identidade OAuth do cliente descoberta (sessão sem email/access_token). |
| TEST-14 | ALTO | `CheckoutPage.jsx:123-133` | Caminho `approved` do polling (conversão) sem teste. |
| TEST-15 | ALTO | `DownloadsPage.jsx:14-79` | `usePendingOrderPolling` sem cobertura (polling infinito/entrega). |
| TEST-16 | ALTO | `DownloadsPage.jsx:107-114` | Precedência/normalização de order+email (anti-IDOR) sem teste. |
| TEST-17 | ALTO | `.github/workflows/*` | Nenhum workflow roda `npm test` — testes não são gate de merge. |
| TEST-18 | ALTO | `webhook.js`/`verify-payment.js`/`download.js` | Sem teste de integração pagamento→entrega ponta-a-ponta. |
| TEST-19 | ALTO | `webhook.js:110-133`, `download.js:55-61` | Invariantes de idempotência/atomicidade condicionais sem trava. |
| TEST-20 | ALTO | `.github/workflows/*` | CI não bloqueia regressão — testes existentes e futuros decorativos. |
| TEST-21 | MÉDIO | `create-payment.js:118-173` | Pricing/cupom server-side sem teste (defesa antifraude). |
| TEST-22 | MÉDIO | `webhook.js`, `mercadopago-config.js` | Reconciliação de valor + anti-replay sem cobertura (replay mitigado). |
| TEST-23 | MÉDIO | `schemas.test.js:47` | Caso `__proto__` é falso-positivo (rejeita por `items:[]`). |
| TEST-24 | MÉDIO | `api/validate-coupon.js` | Helpers de cupom (reusados no total do MP) sem teste. |
| TEST-25 | MÉDIO | `CheckoutPage.test.jsx`, `CheckoutPage.jsx:192-210` | Payload de `/create-payment` (só productId+quantity) não travado. |
| TEST-26 | MÉDIO | `CheckoutPage.test.jsx:88-114` | Número mágico 152 acoplado a `maxAttempts=150`; `clearInterval` não validado. |
| TEST-27 | MÉDIO | `DownloadsPage.test.jsx:19-32` | Mock de fetch é código morto; estado vazio vem de `orderId` ausente. |
| TEST-28 | MÉDIO | `ProductsPage.test.jsx:30-50` | Teste de fumaça: sem erro/vazio/filtro/add-to-cart. |
| TEST-29 | MÉDIO | `api-endpoints.test.js:35-72` | Só guards de borda; vetores de auth/anti-enumeração não tocados. |
| TEST-30 | MÉDIO | `analytics.test.js:90-104` | Set `trackedPurchases` não resetado + payload/PII não asseridos. |
| TEST-31 | MÉDIO | `analytics.test.js:124-131` | Fetch depende de `sendBeacon` undefined no jsdom (não fixado). |
| TEST-32 | MÉDIO | `verify-payment.js:104-119` | Early-return/reuso de tokens/filtro `external_reference` sem teste. |
| TEST-33 | MÉDIO | `useProductFilters.js` | Hook central de filtro/sort/preset sem teste direto. |
| TEST-34 | MÉDIO | `CheckoutPage.jsx:183-186,430` | Guarda de carrinho vazio sem teste (pedidos órfãos). |
| TEST-35 | MÉDIO | `CheckoutPage.jsx:49-76` | Abandoned-cart (debounce/regex/PII) sem teste. |
| TEST-36 | MÉDIO | `CheckoutPage.jsx:395-420`, `DownloadsPage.jsx:301-304` | Validação de formulário + `role='alert'` não asseridas. |
| TEST-37 | MÉDIO | `DownloadsPage.jsx:192-410` | Busca por email + histórico + links de download (entrega) sem teste. |
| TEST-38 | MÉDIO | `webhook.js:78-88` | `recordSecurityEvent` de assinatura inválida não asserido. |
| TEST-39 | MÉDIO | `mercadopago-config.js:108-129` | `WEBHOOK_SECRET` ausente + ts/v1 malformado não testados. |
| TEST-40 | MÉDIO | `payment.routes.js` vs `api-compat.routes.js` | Inconsistência de rate limiter entre rotas sem teste. |
| TEST-41 | MÉDIO | `package.json`/raiz | Sem ESLint/Prettier — nenhuma análise estática. |
| TEST-42 | MÉDIO | `vite.config.js:28-32` | Sem config de cobertura — gaps invisíveis, sem thresholds. |
| TEST-43 | MÉDIO | `lighthouse.yml`, `lighthouserc.json` | Prioridade de CI invertida (a11y gate, corretude não). |
| TEST-44 | MÉDIO | `.github/` | Sem CODEOWNERS/dependabot/renovate. |
| TEST-45 | MÉDIO | `CheckoutPage/DownloadsPage.test.jsx` | Sem e2e do caminho de conversão feliz. |
| TEST-46 | MÉDIO | `lib/supabase.js:85-99` | Sem seam de teste (fetch direto, require estático) — integração frágil. |
| TEST-47 | BAIXO | `CheckoutPage.test.jsx:52-56` | Mock de `setInterval` esconde agendamento/`clearInterval` reais. |
| TEST-48 | BAIXO | `DownloadsPage.test.jsx:20,35` | fetch/localStorage sem cleanup (latente intra-arquivo). |
| TEST-49 | BAIXO | `setupTests.js:6-13` | Mock global de analytics silencia fiação nas páginas. |
| TEST-50 | BAIXO | `schemas.test.js:48-72` | Rejeições só checam `.success`; `out.data`/`issues` sem teste. |
| TEST-51 | BAIXO | `attribution.test.js:80` | Assertion tolerante demais (`<=200` em vez de `===200`). |
| TEST-52 | BAIXO | `storage-signed-url.test.js` | `createSignedDownloadUrl` (TTL/serviceRoleKey/erro) sem teste. |
| TEST-53 | BAIXO | `security-headers.test.js:40-44` | Lacunas de borda em CSP prod/Cross-Origin. |
| TEST-54 | BAIXO | `Checkout`/`Downloads` test | Dependência de localStorage sem `clear()` (latente). |
| TEST-55 | BAIXO | `DownloadsPage.test.jsx:20,35` | fetch global sem cleanup (impacto inter-arquivo refutado). |
| TEST-56 | BAIXO | `attribution.test.js:57-58` | Relógio real sem fake timers (assertion fraca). |
| TEST-57 | BAIXO | `DownloadsPage.jsx:51,151`; `setupTests.js` | Idempotência de purchase não validável via página (mitigado no unit). |
| TEST-58 | BAIXO | `src/pages`; `package.json` | Sem testes de acessibilidade (jest-axe). |
| TEST-59 | BAIXO | `ProductsPage.test.jsx` | Smoke de catálogo sem erro/vazio/interação. |
| TEST-60 | BAIXO | `vite.config.js`; `package.json` | Sem segmentação node/web de projetos Vitest. |
| TEST-61 | INFO | `attribution.test.js:108-115` | `location.search` não resetado (cosmético, sem afetar pass/fail). |
| TEST-62 | INFO | `package.json`/`.github` | Nenhum gate de testes em CI (consolidador). |
| TEST-63 | INFO | `CheckoutPage.test.jsx:52-56` | Acoplamento a microtasks/ordem (flakiness refutada). |
| TEST-64 | INFO | `DownloadsPage.test.jsx:20,35` | fetch/localStorage sem cleanup (vazamento refutado). |

---

## (b) Top 3 mais urgentes

1. **TEST-01 (CRÍTICO) — Login admin + `verifySessionToken`/`ensureAdminSession` com cobertura ZERO.** É o único gate de autenticação do painel, reutilizado em 16 rotas admin; uma regressão em assinatura/exp/`safeCompare` permite forjar o cookie `admin_session` e obter acesso administrativo total, e nada falharia.
2. **TEST-02 (CRÍTICO) — `customer-session` + `auth.middleware` sem teste.** São os primitivos fail-closed de identidade do cliente e de autorização por role (protegendo escrita via service role); uma regressão fail-open aqui abre IDOR/personificação e escalonamento de privilégio sem qualquer trava.
3. **TEST-17 / TEST-20 (ALTO) — Nenhum gate de testes em CI.** Multiplica todos os demais riscos: mesmo os testes bons existentes e qualquer teste novo (TEST-01/02/18) não bloqueiam merge, então toda regressão de segurança/pagamento pode chegar a `main` sem detecção — é o remédio de menor custo e maior alavancagem.

---

## (c) Inconclusivos

Nada ficou tecnicamente inconclusivo quanto à **existência** dos gaps — todos os achados foram confirmados por `Grep`/`Glob`/leitura de arquivo com referência `arquivo:linha`. As únicas incertezas residuais, sinalizadas como **Confiança Média/Baixa**, são de natureza operacional e não verificáveis pelo repositório:

- **Proteção de branch de `main` (TEST-44, Confiança Baixa):** é configuração server-side do GitHub, não versionada; não é possível confirmar por arquivo se algum check é `required`. Presume-se que não há gate de testes porque nenhum workflow o executa.
- **Comportamento de ambiente do jsdom (TEST-31, Confiança Média):** a asserção de que o caminho `fetch` só funciona por `navigator.sendBeacon` ser undefined depende da versão atual do jsdom; um upgrade/polyfill poderia alterar isso — risco latente, não falha presente.
- **Reconciliação de valor / anti-replay (TEST-11/22):** confirmou-se que ambas as defesas estão **ausentes no código**; o que é "inconclusivo" é apenas a intenção de design (se é omissão deliberada), não o fato técnico.

---

## Matriz: módulo crítico × tem teste? × qualidade

| Módulo | Risco | Tem teste? | Qualidade | Notas |
|---|---|---|---|---|
| `api/webhook.js` (HMAC, idempotência, replay, tokens) | CRÍTICO | Parcial | Strong (só HMAC) | Gate de assinatura coberto com qualidade real (validador não mockado); LACUNA: nenhum teste alcança `approved` — idempotência, reconciliação, TTL/entropia do token, rejected/cancelled, provisionamento, `recordSecurityEvent`. |
| `api/create-payment.js` (pricing/desconto/cupom) | CRÍTICO | Parcial | Smoke | Só `items:[]`→400. Núcleo (preço do banco, 404/400, desconto server-side, clamp, rateio) sem teste. `processPaymentSchema` NÃO é usado pelo handler (gate manual). |
| `api/verify-payment.js` (anti-enumeração, idempotência) | CRÍTICO | Parcial | Smoke | Só `orderId`→400. Timing-safe/guarda de comprimento, 404 idêntico, idempotência, `external_reference`, hash de email sem teste. Rota `/payments/verify` sem rate limiter. |
| `api/download.js` (uso-único, signed URL, IDOR) | CRÍTICO | Parcial | Smoke | Só token vazio→400. UPDATE condicional atômico, 401/404, headers de segurança, `createSignedDownloadUrl` sem teste. |
| `api/validate-coupon.js` | ALTO | Não | Nenhuma | ZERO testes; helpers reusados no total cobrado no MP. |
| `lib/storage-signed-url.js` | ALTO | Parcial | Strong (só parse) | `parseStorageRef` bem coberto (12 casos). `createSignedDownloadUrl` (TTL/serviceRoleKey/erro) sem teste. |
| `api/admin-login.js` (2FA/TOTP/challenge/gate) | CRÍTICO | Não | Nenhuma | ZERO testes. Também gaps no código: sem rate limit/lockout; enumeração 401 vs 403. |
| `lib/admin-session.js` (`verifySessionToken`, cookie, CORS) | CRÍTICO | Não | Nenhuma | ZERO testes; guarda reutilizado que autoriza TODAS as rotas admin. |
| `lib/customer-session.js` | CRÍTICO | Não | Nenhuma | ZERO testes; base de auth do cliente por cookie HMAC. |
| `lib/mercadopago-config.js` (HMAC) | ALTO | Parcial | Strong | Exercitado de verdade via webhook test. Lacunas: guarda de comprimento (mesmo tamanho), `WEBHOOK_SECRET` ausente, malformado, **ausência de janela de timestamp (replay)**. |
| `middleware/auth.middleware.js` (`authenticate`/`checkRole`) | CRÍTICO | Não | Nenhuma | ZERO testes; guarda de `POST /produtos` (service role). Nenhum vetor de escalonamento/IDOR travado. |
| RLS policies (migrations + security-hardening.sql) | CRÍTICO | Não | Nenhuma | ZERO testes de RLS — impossível no stack atual (jsdom); requer Postgres real + gate CI. |
| `api/cron-email-jobs.js` + `admin-cleanup-events.js` | CRÍTICO | Não | Nenhuma | ZERO testes; `CRON_SECRET` fail-closed, idempotência, gate de DELETE em massa. Discrepância doc×código. |
| `validation/payment.schemas.js` + `product.schemas.js` | MÉDIO | Sim | Strong | 36 casos reais. Ressalvas: só `.success`; `__proto__` é falso-positivo; só `javascript:`; `processPaymentSchema` não usado pelo endpoint. |
| Frontend: `CartProvider` | MÉDIO | Não | Nenhuma | ZERO testes; dedup/persistência do carrinho (fonte do payload). |
| Frontend: `AuthProvider` / OAuth (`customer-auth.js`) | ALTO | Não | Nenhuma | ZERO testes; controles de identidade/sessão do cliente. |
| Frontend: Checkout polling / DownloadsPage | ALTO | Parcial | Mixed | rejected/timeout cobertos; `approved`, payload, guarda de carrinho vazio, abandoned-cart, `usePendingOrderPolling`, precedência order+email sem teste. |
| Frontend: `useProductFilters` | BAIXO | Parcial | Smoke | 1 `it` exercita o hook real por caminho feliz; filtro/sort/preset/erro/vazio sem teste (catálogo público, re-validado server-side). |

---

## 10 testes ausentes de maior valor (Arrange/Act/Assert)

### TEST-A1 — webhook: pagamento `approved` cria download tokens e responde 200 (fluxo aprovado, hoje SEM cobertura)
**Módulo:** `api/webhook.js` · **Prioridade:** 1
- **Arrange:** `vi.mock('../lib/mercadopago-config', () => ({ validateWebhookSignature: vi.fn(()=>true), getPaymentInfo: vi.fn(async()=>({id:'MP-1',status:'approved',external_reference:'ORD-1',payment_method_id:'pix'})) }))`. `vi.mock('../lib/supabase')` expondo `getSupabaseConfig: vi.fn(()=>({url,anonKey,serviceRoleKey}))` e `serviceRoleHelpers` (`getTableRow`/`insertIntoTable`/`listTableRows`/`updateTable` como `vi.fn`). `getTableRow('orders')` → `{id:10,order_code:'ORD-1',customer_email:'c@t.com',payment_status:'pending',status:'pending',total_amount:50}`. `updateTable` (transição orders) → `[{id:10}]` (1ª aprovação). `listTableRows('order_items')` → `[{order_id:10,product_id:'p1',product_name:'Kit',unit_price:50,quantity:1}]`. `listTableRows('download_tokens')` → `[]` na 1ª leitura e `[{product_id:'p1',token:'abc'}]` após. Mockar `customer-account-provisioning`, `analytics-events` (`recordEvent`), `security-logger`. `req={method:'POST',headers:{},body:{type:'payment',data:{id:'MP-1'}}}`, `res=createMockRes`.
- **Act:** `await webhookHandler(req, res)`
- **Assert:** `res.statusCode===200`; `res.body.downloadTokens` é array com 1 token string não-vazia; `insertIntoTable` chamado com `'download_tokens'` e objeto com `used:false` + `expires_at` (token de 64 chars hex); `updateTable('orders',...)` chamado com filtro `payment_status:'neq.approved'` (idempotência atômica); `recordEvent` chamado 1× com `'payment_approved'`.

### TEST-A2 — webhook: reentrega de `approved` NÃO recria tokens nem re-emite `payment_approved`
**Módulo:** `api/webhook.js` · **Prioridade:** 1
- **Arrange:** Mesmos mocks, porém `updateTable` (transição orders) → `[]` (0 linhas ⇒ `isFirstApproval=false`); `listTableRows('download_tokens')` → já retorna `[{product_id:'p1',token:'abc'}]`. `recordEvent` e `ensureCustomerAccountFromCheckout` como `vi.fn`. `req` com `type:'payment',data:{id:'MP-1'}`.
- **Act:** `await webhookHandler(req, res)`
- **Assert:** `res.statusCode===200`; `downloadTokens` reutiliza `'abc'`; `insertIntoTable` NUNCA chamado para `'download_tokens'`; `recordEvent` NÃO chamado; `ensureCustomerAccountFromCheckout` NÃO chamado (idempotência de analytics/provisionamento em reenvios do MP).

### TEST-A3 — verify-payment: order válido + email ERRADO → 404 idêntico a inexistente, evento sem PII em claro
**Módulo:** `api/verify-payment.js` · **Prioridade:** 1
- **Arrange:** `vi.mock('../lib/supabase')` com `getSupabaseConfig` truthy e `getTableRow('orders')` → `{id:1,order_code:'ORD-1',customer_email:'dono@real.com',payment_status:'approved',status:'completed',total_amount:10}`. Mockar `security-logger` (`recordSecurityEvent: vi.fn()`, `extractClientIp: vi.fn(()=>'9.9.9.9')`). Mockar `mercadopago-config`/`customer-account-provisioning` (não devem ser alcançados). `req={method:'GET',query:{orderId:'ORD-1',email:'atacante@evil.com'},headers:{}}`.
- **Act:** `await verifyPaymentHandler(req, res)`
- **Assert:** `res.statusCode===404` e `res.body.error==='Pedido não encontrado'` (mesma string do ramo inexistente); `recordSecurityEvent` chamado 1× com `'verify_payment_email_mismatch'`; `properties.provided_email_hash` NÃO contém `'atacante@evil.com'` (hash sha256 truncado); nenhuma chamada a `getPaymentInfo`; `res.body` sem `downloadTokens`/`total_amount`.

### TEST-A4 — verify-payment: email de tamanho DIFERENTE → 404 (não lança timingSafeEqual → não vira 500)
**Módulo:** `api/verify-payment.js` · **Prioridade:** 1
- **Arrange:** Igual ao A3, mas `customer_email='dono@real.com'` (13 chars) e `query.email='a@b.co'` (6 chars). `recordSecurityEvent: vi.fn()`; `getTableRow('orders')` retorna o pedido.
- **Act:** `await verifyPaymentHandler(req, res)`
- **Assert:** `res.statusCode===404` (e NÃO 500) — prova que a guarda `expectedBuf.length===providedBuf.length` impede o throw de `crypto.timingSafeEqual`; `res.body.error==='Pedido não encontrado'`; `recordSecurityEvent` chamado 1×. Remover a guarda faria o catch retornar 500 e este teste falharia.

### TEST-A5 — download: token já utilizado → 401 e NÃO gera signed URL nem log
**Módulo:** `api/download.js` · **Prioridade:** 1
- **Arrange:** `vi.mock('../lib/supabase')` com `getSupabaseConfig` truthy; `getTableRow('download_tokens')` → `{token:'T',order_id:1,product_id:'p1',used:true,expires_at:<futuro>}`. Mockar `storage-signed-url` (`createSignedDownloadUrl: vi.fn()`) e `security-logger`. `updateTable`/`insertIntoTable` como `vi.fn`. `req={method:'GET',query:{token:'T'},headers:{}}`.
- **Act:** `await downloadHandler(req, res)`
- **Assert:** `res.statusCode===401` e `res.body.error==='Token já utilizado'`; `createSignedDownloadUrl` NÃO chamado; `updateTable` NÃO chamado (token não re-reivindicado); `insertIntoTable('download_logs')` NÃO chamado; `res.redirect` NÃO chamado.

### TEST-A6 — download: corrida no uso único — UPDATE condicional retornando 0 linhas barra o 2º consumidor com 401
**Módulo:** `api/download.js` · **Prioridade:** 1
- **Arrange:** `getSupabaseConfig` truthy; `getTableRow('download_tokens')` → `{token:'T',...,used:false,expires_at:<futuro>}`; `getTableRow('products')` → `{id:'p1',download_url:'https://drive.google.com/x'}`. `updateTable: vi.fn(async()=>[])` (0 linhas — outro request já reivindicou). `createSignedDownloadUrl: vi.fn(()=>null)`. `req` GET com `token:'T'`.
- **Act:** `await downloadHandler(req, res)`
- **Assert:** `res.statusCode===401` e `res.body.error==='Token já utilizado'` (`!Array.isArray(claimed)||length===0`); `updateTable` chamado com filtro `{token:'eq.T', used:'is.false'}` (UPDATE condicional atômico); `res.redirect` NÃO chamado; `insertIntoTable('download_logs')` NÃO chamado.

### TEST-A7 — download: caminho feliz seta headers de segurança, reivindica token e redireciona para signed URL
**Módulo:** `api/download.js` · **Prioridade:** 1
- **Arrange:** `getTableRow('download_tokens')` → `{token:'T',...,used:false,expires_at:<futuro>}`; `getTableRow('products')` → `{id:'p1',download_url:'product_files/kit.pdf'}`. `updateTable: vi.fn(async()=>[{token:'T'}])`. `createSignedDownloadUrl: vi.fn(async()=>'https://sb.co/storage/v1/object/sign/kit.pdf?token=sig')`. `insertIntoTable('download_logs'): vi.fn()`. `extractClientIp: vi.fn(()=>'1.2.3.4')`. `req` GET com `token:'T'`, `headers:{'user-agent':'UA'}`.
- **Act:** `await downloadHandler(req, res)`
- **Assert:** `res.headers['Referrer-Policy']==='no-referrer'`, `Cache-Control==='no-store, max-age=0'`, `X-Download-Mode==='signed-storage'`; `res.redirect` chamado com a signed URL (não com `download_url` cru); `updateTable` chamado ANTES da geração da URL; `insertIntoTable('download_logs')` com `order_id/product_id/token` do `tokenRecord` (server-side, não da query) e `ip_address '1.2.3.4'`.

### TEST-A8 — admin-session: `verifySessionToken` rejeita assinatura adulterada, expirado e sub≠'admin'; aceita round-trip válido
**Módulo:** `lib/admin-session.js` · **Prioridade:** 1
- **Arrange:** `process.env.ADMIN_SESSION_SECRET='segredo-fixo-de-teste'` no beforeEach (restaurar no afterEach). Gerar token válido via `setSessionCookie` (capturar de `Set-Cookie`) ou construir manualmente com o mesmo HMAC-sha256. Para expirado/sub: forjar payload base64url + assinatura válida, variando `exp` (passado) e `sub` (`'customer'`).
- **Act:** `verifySessionToken(token)` para: (a) válido recém-emitido; (b) mesmo token com último char da assinatura trocado; (c) payload `exp=now-10` com assinatura recomputada válida; (d) `sub:'customer'` com assinatura válida.
- **Assert:** (a) `{valid:true, payload.sub:'admin'}`; (b) `{valid:false}` (safeCompare falha); (c) `{valid:false}` (exp≤now); (d) `{valid:false}` (sub≠admin). Também `verifySessionToken('')` e `verifySessionToken('sem-ponto')` → `{valid:false}` sem lançar.

### TEST-A9 — admin-session: `ensureAdminSession` bloqueia POST cross-origin com 403 (CSRF) mesmo com sessão válida
**Módulo:** `lib/admin-session.js` · **Prioridade:** 1
- **Arrange:** `ADMIN_SESSION_SECRET` fixo e `APP_URL='https://loja.com'`. Gerar cookie admin válido; montar `req` base com `headers.cookie` contendo o token. Caso A: `method:'POST', headers.origin:'https://evil.com'`. Caso B: `method:'POST', headers.origin:'https://loja.com'`. Caso C: `method:'POST'` sem origin/referer.
- **Act:** `ensureAdminSession(reqA,res)`, `ensureAdminSession(reqB,res)`, `ensureAdminSession(reqC,res)`
- **Assert:** A → `false` + `res.status(403)` com error contendo `'CSRF'`; B → `true` e `res.status` não chamado (origin na allowlist); C → `false` com 403 (fail-closed sem Origin/Referer). Um GET com a mesma sessão válida → `true` sem checagem de origem.

### TEST-A10 — admin-session: `buildCookieHeader` emite HttpOnly+SameSite=Strict sempre e Secure só fora de dev/test; clear usa Max-Age=0
**Módulo:** `lib/admin-session.js` · **Prioridade:** 2
- **Arrange:** `ADMIN_SESSION_SECRET` fixo. Ramo Secure via env: dev/test → `NODE_ENV='test'` e `APP_ENV` indefinido; implantado → `APP_ENV='production'`. `res` falso capturando `Set-Cookie`. Restaurar env no afterEach.
- **Act:** `setSessionCookie(res,{email:'a@a.com',role:'admin'})` em test e em `APP_ENV='production'`; depois `clearSessionCookie(res)`.
- **Assert:** `Set-Cookie` sempre contém `HttpOnly`, `SameSite=Strict`, `Path=/`; em `NODE_ENV='test'` NÃO contém `Secure`; em `APP_ENV='production'` contém `Secure`; `clearSessionCookie` produz cookie com valor vazio e `Max-Age=0` mantendo `Path=/`.