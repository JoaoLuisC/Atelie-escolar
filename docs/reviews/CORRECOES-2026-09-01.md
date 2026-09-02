# Rodada de correções — 01/09/2026

> **Retrato datado — 01/09/2026.** Base: commit `b8d5b8e`. Entregue nos commits `df21733`…`cedb953`.
> Este documento **não se atualiza**: quando um item aqui for corrigido ou mudar, o commit é a prova.
> Estado atual das regras: [CONTRIBUTING.md](../../CONTRIBUTING.md).

Execução dos oito blocos de [PROMPTS-CORRECAO-2026-09-01.md](../PROMPTS-CORRECAO-2026-09-01.md),
em modo verificar-e-corrigir. Cada bloco trazia uma **hipótese**, e a primeira tarefa era confirmá-la
no código de hoje.

## Sumário

| §   | Bloco                           | Veredito                                        | Commit                 |
| --- | ------------------------------- | ----------------------------------------------- | ---------------------- |
| 1   | Catraca de cobertura            | **Refutado** — já corrigido                     | — (girada junto do §4) |
| 2   | Migrations em produção          | Roteiro entregue, **aguarda decisão**           | —                      |
| 3   | Writers admin sem audit         | **Confirmado** e corrigido                      | `df21733`              |
| 4   | Montagem do caminho do dinheiro | **Confirmado** — buraco real, e um defeito novo | `5720c6f`              |
| 5   | Área 4 · API/Handlers           | Pontos quentes **refutados**                    | — (sem mudança)        |
| 6   | Área 10 · DevOps/Deploy         | **Confirmado** — 3 achados                      | `19986db`              |
| 7   | Área 6 · LGPD                   | Confirmado no que importava, **2 lacunas**      | `625e6e5`              |
| 8   | Áreas 5 e 8 · Front/Qualidade   | Manutenção feita, parcial                       | `7d136f6`, `e17e468`   |

**Números:** 846 → **935 testes** (67 → 75 arquivos); cobertura medida **49,78 / 40,51 / 42,43 /
51,33** com os pisos em 47/38/40/49; avisos de lint **17 → 13**, com a catraca baixada no mesmo
commit. `npm run check` verde.

**O fio que costura a rodada** é o mesmo do relatório de auth: guarda escrita não é guarda
executada. Os dois achados de maior peso (§4 e §6) não estavam em nenhum handler — estavam na
camada entre a URL pública e o código, e em configuração que afirma coisas que não acontecem mais.

---

## §1 — Catraca de cobertura · REFUTADO

A hipótese dizia pisos em 25/19/21/25. O arquivo está em **42/32/34/43** desde `b8d5b8e`
([vite.config.js:193-198](../../vite.config.js#L193-L198)), e o gate roda no CI
([test.yml:88](../../.github/workflows/test.yml#L88)).

Medido no início da sessão: `44,2 / 34,62 / 36,25 / 45,69` — folga de 2,2 a 2,7pp, que é
exatamente a regra D2. Nada a fazer.

**Mas a catraca precisou girar mesmo assim**, no fim da rodada e por outro motivo: as suítes novas
do §3 e do §4 subiram a medição, e `api/**/*.js` entrou no `include` da cobertura. Recalibrada para
**43/34/35/45** dentro do commit `5720c6f`, com a tabela de medição no comentário.

> O `api/` estar fora do `include` de cobertura não era detalhe: `api/index.js` é a **única função
> publicada**, e a cobertura do caminho por onde toda requisição de produção passa não contava para
> o piso.

---

## §2 — Migrations: código auditado ≠ banco em produção · AGUARDA DECISÃO

Nada foi executado contra o banco. Segue o inventário e o roteiro de conferência.

### O que as 18 migrations declaram

| Objeto                     | Quantidade | Onde                                                                                                                                                      |
| -------------------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabelas criadas            |         10 | analytics_events, coupons, abandoned_carts, security_events, email_subscribers, email_sent_log, admin_audit_log, rate_limit_hit (+ as 14 do `schema.sql`) |
| Tabelas com RLS habilitada |     **17** | baseline em `20260702000000_phase6_db_rls_hardening.sql`                                                                                                  |
| Policies criadas           |         12 | phase0, phase2, phase6, wave1                                                                                                                             |
| Funções                    |         12 | slugify, purge_old_logs, cleanup_old_analytics_events, cleanup_old_email_logs, increment_coupon_usage, rate_limit_hit, find_profile_id_by_email, …        |
| Jobs `pg_cron`             |          6 | purge_old_logs_daily, cleanup-analytics-events, cleanup-email-logs-monthly, purge-stale-subscribers-monthly, purge-rate-limit-hits-hourly                 |
| Índices                    |         39 | inclui os de FK e os de performance de 03/07 e 13/08                                                                                                      |

### Checklist de validação (somente leitura)

Rodar no SQL Editor do projeto de produção. Cada consulta responde **uma** pergunta.

```sql
-- 1. RLS ligada nas 17? Qualquer linha aqui é uma tabela desprotegida.
select tablename from pg_tables t
 where schemaname = 'public'
   and not exists (select 1 from pg_class c
                    where c.relname = t.tablename and c.relrowsecurity);

-- 2. As 8 tabelas que nascem em migration existem?
select unnest(array['analytics_events','coupons','abandoned_carts','security_events',
                    'email_subscribers','email_sent_log','admin_audit_log','rate_limit_hit']) as esperada
except select tablename from pg_tables where schemaname = 'public';

-- 3. As funções de purga e as do caminho crítico existem?
select unnest(array['purge_old_logs','cleanup_old_analytics_events','cleanup_old_email_logs',
                    'purge_stale_email_subscribers','purge_old_rate_limit_hits',
                    'increment_coupon_usage','rate_limit_hit','find_profile_id_by_email']) as esperada
except select proname from pg_proc where pronamespace = 'public'::regnamespace;

-- 4. pg_cron habilitado e os 5 jobs agendados?
select extname from pg_extension where extname = 'pg_cron';
select jobname, schedule, active from cron.job order by jobname;

-- 5. Audit log append-only (phase5) — os triggers de bloqueio existem?
select tgname from pg_trigger where tgrelid = 'public.admin_audit_log'::regclass;

-- 6. UNIQUE que sustenta a idempotência do webhook (phase5_payment_hardening).
select indexname from pg_indexes
 where tablename = 'download_tokens' and indexdef ilike '%unique%';

-- 7. Índices que a wave1 e o 13/08 tornaram necessários (senão é seq scan em RLS).
select indexname from pg_indexes
 where (tablename = 'orders'   and indexdef ilike '%customer_id%')
    or (tablename = 'profiles' and indexdef ilike '%lower%');

-- 8. `products.download_url` revogado do anon (wave1) — o conteúdo pago.
select privilege_type from information_schema.column_privileges
 where table_name = 'products' and column_name = 'download_url' and grantee = 'anon';
```

### O que eu preciso de você

1. Posso rodar essas consultas com acesso somente-leitura ao banco de produção? Sem isso, a Área 3
   continua auditada só no `.sql` — que é o que o §1 do roadmap já registra como não confirmado.
2. Se alguma divergir, a correção é `supabase db push` ou SQL no editor — **e isso eu não faço sem
   você mandar**.

### Pendência de migration que esta rodada encontrou

`abandoned_carts` **não tem purga por tempo**, apesar de o comentário da migration que a criou
prometer limpeza "após 7 dias"
([20260526000000_phase2_conversion.sql:53-55](../../supabase/migrations/20260526000000_phase2_conversion.sql#L53-L55)).
Não existe função `cleanup_*` nem job para ela. A tabela guarda e-mail e conteúdo de carrinho de
gente que nunca comprou. O §7 fechou o lado da aplicação (exclusão de conta agora apaga a linha do
titular), mas a retenção é migration — **proposta, não aplicada**:

```sql
-- PROPOSTA, não aplicada. Espelha cleanup_old_analytics_events.
create or replace function public.cleanup_old_abandoned_carts()
returns integer language plpgsql security definer set search_path = public as $$
declare removidos integer;
begin
  delete from public.abandoned_carts
   where recovered_at is null and updated_at < now() - interval '90 days';
  get diagnostics removidos = row_count;
  return removidos;
end $$;
```

> 90 dias e não 7: o `updated_at < 1h` do cron de recuperação usa a mesma tabela, e 7 dias
> descartaria a base de reativação junto. O número é uma decisão de negócio — é sua, não minha.

---

## §3 — Dois writers admin fora do audit log · CONFIRMADO → `df21733`

`logAdminAction` chegava aos 5 recursos CRUD pela factory
([lib/admin-resource-handler.js:102](../../lib/admin-resource-handler.js#L102)) e a
[handlers/admin/settings.js:603](../../handlers/admin/settings.js#L603) pelo próprio arquivo. Os
dois writers restantes **apagam dado** e não deixavam rastro:

| Endpoint                                         | Ação registrada agora                                 |
| ------------------------------------------------ | ----------------------------------------------------- |
| `POST /api/admin/cleanup-events`                 | `delete` · `analytics_events` · `after: { deleted }`  |
| `POST /api/admin/upload-url` (sign)              | `create` · `storage_object` · `targetId: bucket/path` |
| `POST /api/admin/upload-url` (confirm rejeitado) | `delete` · `storage_object` · com `before` e o motivo |

A confirmação **bem-sucedida** não gera linha: ela não muda estado, e o `create` do sign já registra
o objeto. Está escrito no código para ninguém "consertar" a ausência.

**Teste:** [handlers/\_\_tests\_\_/admin-write-audit.test.js](../../handlers/__tests__/admin-write-audit.test.js)
— 9 casos, 4 falham sem a mudança. Afirma sobre a chamada que o handler faz, e leva o **par
negativo** junto: sessão recusada, método barrado e declaração inválida não podem gravar linha
nenhuma. Audit log que registra tentativa recusada como ação executada mente na hora em que alguém
precisa dele.

### O gate proposto (não implementado, como pedido)

Um `handlers/__tests__/admin-audit-coverage.test.js` no espírito do de rate limit: parte das rotas
**montadas**, filtra as que aceitam método de escrita, e exige `logAdminAction`,
`createAdminResourceHandler`, ou entrada numa lista `DISPENSADOS` nomeada.

**Por que ele não veio junto:** a chave da dispensa precisa ser o par (rota, método), não a rota —
`admin/settings` audita o PUT e não o GET, e `upload-url` audita duas das três ações do mesmo POST.
Um gate que só olhe a rota daria verde para um handler que audita **uma** de suas ações. Isso é
desenho a decidir, não linha a escrever, e vale meia hora com você antes. **Quer que eu faça?**

---

## §4 — Montagem do caminho do dinheiro · CONFIRMADO → `5720c6f`

### O que os gates já cobriam

| Gate                                               | O que ele prova                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `routes/__tests__/api-route-parity.test.js`        | que `/webhook` **no router** é o módulo `handlers/webhook.js` — identidade de módulo, não string |
| `handlers/__tests__/rate-limit-coverage.test.js`   | que todo handler **montado** tem contador, sessão admin, ou dispensa nomeada                     |
| `routes/__tests__/auth-guards-integration.test.js` | que as guardas de auth rodam num servidor de verdade — contra `createApiApp`                     |

Encadeados com as suítes de unidade (`webhook-signature`, `download-single-use`,
`payment-integrity`), eles fecham: guarda existe no módulo **e** o módulo é o que o router montou.
Confirmado, uma a uma, que as quatro guardas do relatório de 12/08 estão no caminho executado —
HMAC ([webhook.js:116-139](../../handlers/webhook.js#L116-L139)), rate limit dedicado nos quatro
handlers, uso único atômico via `used: 'is.false'` no próprio UPDATE
([download.js:145-148](../../handlers/download.js#L145-L148)), e checagem de origem onde ela de fato
existe (logout admin e de cliente; os endpoints de dinheiro nunca dependeram dela).

### O buraco que sobrava

**Nenhum teste carregava `api/index.js`** — a única função publicada — e **nada conferia o
`vercel.json`**. O de auth sobe `createApiApp`, que é o app _por dentro_ da função. Entre a URL que
a cliente digita e o router existem duas traduções sem cobertura: a reescrita da borda e o
`restoreOriginalPath`.

Pior: um teste colocado em `api/__tests__/` **não era coletado** — a árvore não estava no `include`
do projeto `node`. A suíte do entrypoint teria ficado verde sem nunca rodar. Mesmo modo de falha do
`660fe74`, uma camada acima.

### E apareceu um defeito real

[api/\_\_tests\_\_/serverless-entry.test.js](../../api/__tests__/serverless-entry.test.js) lê a
tabela do próprio `vercel.json`, aplica a reescrita e fala **por HTTP** com o entrypoint. Ao exigir
o mesmo resultado nas duas ordens possíveis de concatenação de query, expôs isto:

> A Vercel concatena a query original à do `dest`, e **a ordem não é contrato publicado**. Numa das
> ordens, `/api/validate-coupon?__path=download` executava o handler escolhido pelo **cliente**.

Não é escalada de privilégio — cada handler impõe a própria guarda, e `?__path=admin/orders`
continua esbarrando em `ensureAdminSession`. O que quebra é a correspondência entre a URL que a
borda roteou e o código que rodou: exatamente o que alguém vai querer ao investigar um incidente
pelo log de acesso. `__path` duplicado agora **não roteia** — 404 no envelope da regra A1.

14 testes, 2 falham sem a correção. Cobrem também que a query do `/api/download?token=…` sobrevive
(é dela que sai o token do produto pago) e que o corpo do POST de `create-payment` chega inteiro.

---

## §5 — Área 4 · API/Handlers · PONTOS QUENTES REFUTADOS

Rodada inteira, sem mudança de código. Os quatro pontos quentes do prompt foram escritos antes do
`660fe74` e já não valem:

| Ponto quente                                       | Hoje                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `admin-coupons` sem o guard/audit dos demais       | Usa a factory → sessão admin **e** audit log                                              |
| Ordenação/seleção dinâmica vinda do client         | **Zero** ocorrências: nenhum `req.query.order/sort/select/limit` em `handlers/` ou `lib/` |
| Cron sem segredo, exposto publicamente             | `X-Cron-Secret` timing-safe, sem fallback por sessão nem query                            |
| Divergência `vercel.json` ↔ `api-compat.routes.js` | Coberta pelo gate de paridade, e agora também da URL pública (§4)                         |

Verificado junto, e também limpo: paginação sem teto (todos os `limit` são constantes de servidor),
IDOR em `customer-orders` (ancorado em `customer_id = auth.uid()`, com o histórico do `ilike`
documentado no arquivo), cache em memória da regra E2 (removido dos quatro handlers, com o
`X-Cache: HIT` mentiroso junto), escape em templates de e-mail, e double opt-in no
subscribe/confirm/unsubscribe.

**Tabela endpoint × auth × validação × audit** (44 handlers) — resumo, a íntegra sai de
`node` sobre `handlers/`:

| Grupo                                 | Qtd | Auth                 | Rate limit | Audit           |
| ------------------------------------- | --: | -------------------- | ---------- | --------------- |
| Recursos CRUD admin (factory)         |   5 | `ensureAdminSession` | sessão     | factory         |
| Relatórios admin (kpis, dashboard, …) |   8 | `ensureAdminSession` | sessão     | leitura         |
| Escrita admin fora da factory         |   3 | `ensureAdminSession` | settings   | **sim** (era 1) |
| Auth admin/cliente                    |   8 | própria              | 5 de 8     | —               |
| Dinheiro                              |   5 | HMAC / público       | 4 de 5     | —               |
| Público (catálogo, e-mail, analytics) |  12 | público              | sim        | —               |
| Cron / infra / sem corpo JSON         |   3 | CRON_SECRET / n/a    | dispensado | —               |

---

## §6 — Área 10 · DevOps/Deploy · CONFIRMADO → `19986db`

Três achados, todos da família "certo no código, errado em produção".

**1. `.env.example` não listava `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.** Elas existiam só no
`.env.local.template`. Quem seguisse o `.env.example` — o arquivo citado no setup — subia um front
**sem cliente Supabase**: login com Google e reset de senha paravam, sem erro que apontasse a causa.
Junto entraram as 15 variáveis lidas em runtime que não estavam documentadas em lugar nenhum
(`LOG_LEVEL`, `RATE_LIMIT_TIMEOUT_MS`, `REACTIVATION_COUPON_CODE`, …), e `DOWNLOAD_TOKEN_SECRET`
ganhou o aviso de que é inerte.

**2. `email-cron.yml` e `lighthouse.yml` sem `permissions`.** O `GITHUB_TOKEN` entrava com a
permissão padrão do repositório. O do cron não lê o repo nem publica nada e agora é `{}`; o do
lighthouse ficou em `contents: read` (o status do PR vai pelo `LHCI_GITHUB_APP_TOKEN`).

**3. `module.exports.config = { maxDuration: 60 }` em `cron-email-jobs.js`.** Desde o `660fe74` o
arquivo não é mais uma Serverless Function — a Vercel só lê `config` dentro de `api/` — então a
linha não aumentava timeout nenhum e afirmava um limite por endpoint que não existe. O limite real
segue no bloco `functions` do `vercel.json`.

**Teste:** [scripts/\_\_tests\_\_/deploy-config.test.js](../../scripts/__tests__/deploy-config.test.js)
— 10 casos, 5 falham sem as mudanças.

> **Sobre o método, porque contraria a regra da casa.** Aqui a asserção é sobre **texto de arquivo**,
> de propósito. A distinção é real: num handler, o arquivo não é o que roda (o que roda é o módulo
> que o router montou); um workflow do GitHub e o `vercel.json` **são literalmente** o artefato que a
> plataforma executa. Não existe camada abaixo para inspecionar — e é por isso que esses dois são
> justamente os que ficam sem gate nenhum quando a regra é aplicada sem pensar.

Conferido e **limpo**: `dist/` e `tcc-build/` não versionados; `REQUIRED_PRODUCTION_SECRETS`
completa com `APP_URL` https enforçado; `check:env` bloqueante no `buildCommand` da Vercel e
permissivo no CI, com o porquê escrito; `test.yml` com `permissions: contents: read`, timeout,
concurrency e os 7 passos do `npm run check`.

---

## §7 — Área 6 · LGPD · CONFIRMADO NO ESSENCIAL, 2 LACUNAS → `625e6e5`

### A pergunta do bloco, respondida

**Sim, o consentimento barra GA4/Pixel no caminho executado**, e não só no componente:

- não há tracker em `index.html` — o único caminho de carga é `applyMarketingConsent`, chamado
  apenas com consentimento concedido ([analytics.js:154-160](../../src/utils/analytics.js#L154-L160));
- `trackEvent` regate a cada chamada: `if (!hasMarketingConsent()) return;` antes de `gtag`/`fbq`
  ([analytics.js:202](../../src/utils/analytics.js#L202));
- eventos essenciais vão só para o backend first-party, com PII removida por `sanitizeProperties`.

### Lacuna 1 — não havia como revogar (art. 8º §5º)

`setConsentState` só era chamado do `ConsentBanner`, e o banner **some** assim que existe decisão
gravada. Depois de "Aceitar todos", nenhum caminho no produto voltava atrás — enquanto a política
prometia revogação "a qualquer momento" e oferecia como via "limpar os dados do site", que é verdade
técnica e não é procedimento facilitado.

[ConsentPreferences](../../src/components/ConsentPreferences.jsx) entra na página de privacidade,
mostra a escolha atual e permite trocar. **Ao revogar, recarrega**: parar de medir é imediato, mas os
scripts do Google e da Meta já injetados nesta aba continuariam carregados. Ao conceder não há
reload — `applyMarketingConsent` escuta a mudança e sobe os scripts sozinho.

### Lacuna 2 — a exclusão deixava o carrinho para trás

O fluxo cobria `orders` (anonimização), `download_tokens` (delete), `auth.users` (cascade em
`profiles`/`user_products`) e `email_subscribers` (unsubscribe). Faltava **`abandoned_carts`** — e é
a mais fácil de esquecer justamente porque a âncora dela é o **e-mail digitado no checkout**, não
`customer_id`: nenhum cascade a alcança. Quem exercia o direito ao esquecimento ficava com e-mail e
conteúdo do carrinho gravados por tempo indeterminado.

Filtro por `eq` e não `ilike`: `_` é caractere legal em e-mail e viraria coringa — o IDOR silencioso
que `customer-orders.js` já pagou.

**Testes:** [ConsentPreferences.test.jsx](../../src/components/__tests__/ConsentPreferences.test.jsx)
(5 casos) afirma o **efeito** — depois do clique, `trackEvent` para de alimentar `gtag`/`fbq` —, não
a existência do botão. [account-deletion-lgpd.test.js](../../handlers/__tests__/account-deletion-lgpd.test.js)
(6 casos) percorre os **dois passos reais** do fluxo (pedido → token por e-mail → confirmação) e
verifica que o carrinho de outra pessoa continua lá.

### Fica em aberto

- **Retenção de `abandoned_carts`** — proposta no §2 acima; é migration.
- `page_views`, `security_events` e `download_logs` guardam IP e user-agent sem anonimização. Há
  purga por tempo (`purge_old_logs`), então não é retenção infinita, mas o IP em claro dentro da
  janela é decisão a registrar na política — não mexi.
- Portabilidade (art. 18, V): não existe exportação self-service dos próprios dados. É funcionalidade
  nova, fora do escopo de uma rodada de correção.

---

## §8 — Áreas 5 e 8 · Frontend e Qualidade → `7d136f6`, `e17e468`

### Os 17 avisos de lint, nominalmente

Todos são diagnósticos do React Compiler. Quatro saíram; a diferença entre eles e os 12 restantes é
o que explica por que a catraca não fecha em zero de uma vez.

| Aviso                                            | Onde                                                                                                                                                                    | Situação                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `immutability` (`resetForm` antes da declaração) | CategoryWizard:28, ProductWizard:65                                                                                                                                     | **zerado** — reordenação pura                                                           |
| `purity` (`Date.now()` no render)                | SegmentsTab:151                                                                                                                                                         | **zerado** — o fallback ainda _afirmava_ uma hora de geração que o backend não mandou   |
| `immutability` (`let cumulative` no `map`)       | DashboardTab:319                                                                                                                                                        | **zerado** — virou soma de prefixo, mesmo ângulo por fatia                              |
| `set-state-in-effect` × 12                       | CategoryWizard, CouponWizard, CrossSellSection, ProductWizard, AnalysisTab, CouponsTab, SecurityTab, SegmentsTab, useProductFilters, CustomerAuthPage, DownloadsPage ×2 | **fica** — cada um é repensar o carregamento de dados do componente; muda comportamento |
| `incompatible-library`                           | CheckoutPage:95 (`react-hook-form`)                                                                                                                                     | **fica** — sem conserto do nosso lado                                                   |

Teto baixado para 13 no `package.json` e no comentário do workflow, no mesmo commit — que é a regra
de operação da catraca (D5).

### Arquivos grandes

| Arquivo             | Antes |    Hoje | Teste             |
| ------------------- | ----: | ------: | ----------------- |
| `ProductWizard.jsx` |   883 | **792** | **22** (era 0)    |
| `DashboardTab.jsx`  |   810 |     819 | 0                 |
| `AnalysisTab.jsx`   |   676 |     676 | 0                 |
| `CheckoutPage.jsx`  |   666 |     666 | tem suíte própria |

Do `ProductWizard` saiu a metade **pura** — normalização do produto carregado para edição, limpeza
no submit e a validação que libera cada passo —, para
[product-wizard-form.js](../../src/components/product-wizard-form.js), ao lado do componente
(regra C4). É a parte que decide o conteúdo das colunas `benefits`, `faq` e `reviews` e se um
produto pode ser salvo, e estava inalcançável para teste.

> **O move não foi de graça, e é o achado desta parte.** O teste de ida e volta banco → formulário →
> banco pegou que a extração tinha **perdido o campo `text` de `normalizeReviews`**. Sem ele, abrir
> um produto com depoimento e salvar sem tocar em nada apagaria o texto de todos os depoimentos. O
> defeito foi meu, nasceu e morreu dentro do mesmo commit — mas é a demonstração exata de por que
> **DashboardTab e AnalysisTab não foram quebrados nesta sessão**: sem teste de caracterização, um
> split de 800 linhas comete esse mesmo erro e ninguém percebe.

**Recomendação, na ordem:** teste de caracterização do `DashboardTab` (as derivações já estão
isoladas em `admin/utils/derive.js`, então o alvo é o JSX e o carregamento) → extrair os gráficos →
só então dividir. Mesma sequência para `AnalysisTab`.

---

## O que ficou de fora, consolidado

| Item                                                 | Por quê                                             | §    |
| ---------------------------------------------------- | --------------------------------------------------- | ---- |
| Rodar as consultas de validação no banco de produção | **Precisa da sua autorização** — nada foi executado | 2    |
| `cleanup_old_abandoned_carts()` + job                | É migration — proposta, não aplicada                | 2, 7 |
| Anonimização de IP em `page_views`/`security_events` | Decisão de política, não bug                        | 7    |
| Exportação self-service de dados (art. 18, V)        | Funcionalidade nova                                 | 7    |
| Split de `AnalysisTab` (676 linhas)                  | Mesma sequência do DashboardTab: caracterizar antes | 8    |
| Os 12 `set-state-in-effect`                          | Cada um muda comportamento                          | 8    |

> Os três itens que saíram desta tabela foram fechados na continuação da mesma sessão — ver o fim
> do documento.

## Achados fora do escopo dos blocos

Anotados, não corrigidos, conforme a regra 4 do preâmbulo:

1. **`api/` fora do `include` de cobertura** — corrigido junto do §4 porque era pré-requisito para
   medir o que o §4 entregou.
2. **Comentários apontando para `api/__tests__/rate-limit-coverage.test.js`** em
   [api-compat.routes.js:93](../../routes/api-compat.routes.js#L93) e no cabeçalho do próprio gate:
   o arquivo mora em `handlers/__tests__/` desde a mudança de pasta. Referência morta da família D4,
   custo de uma linha cada.
3. **`supabase/security-hardening.sql`** é descrito na doc como "espelho fora da sequência de
   migrations". Dois lugares descrevendo o mesmo RLS é a divergência que a regra F2 combate — vale
   decidir qual é o canônico.

---

## Continuação da mesma sessão — o que foi fechado depois do relatório

Três dos itens que a tabela acima listava como abertos não dependiam de acesso a produção, e foram
resolvidos na sequência.

### Gate de cobertura do audit log admin → `fe28a7a`

O que faltava era a **decisão de desenho**, e ela é: a chave é o par **(rota, método)**, não a rota.
`admin/settings` audita o PUT e não o GET; a factory audita todo método que não seja GET. Dispensa
por rota daria verde para um handler que audita uma de suas ações.

A lista de métodos também não é lida do texto: é **perguntada ao módulo que o router montou**,
chamando-o com um verbo que ninguém aceita e lendo o `Allow` do 405
([lib/http.js:188-203](../../lib/http.js#L188-L203)). Handler que mude os métodos aceitos muda a
resposta do gate junto; handler que não responda `Allow` cai num teste de sanidade próprio, em vez
de sair do conjunto medido em silêncio.

Duas dispensas nomeadas: `admin/login.js:POST` (autenticação, não mutação — o rastro dela é
`security_events`, que registra tentativa recusada, coisa que o audit log não deve fazer) e
`admin/logout.js:POST`. Verificado contra `df21733~1`: acusa `admin/cleanup-events.js:POST` e
`admin/upload-url.js:POST`, nominalmente.

O limite está escrito no cabeçalho do arquivo: o gate prova que rota+método de escrita é servida por
um módulo que audita, **não** que aquela linha roda naquele caminho. A segunda prova é das suítes de
comportamento — `admin-write-audit`, `admin-settings-guard` e `admin-resource-handler`.

### Referências mortas a `api/` → `f6ee510`

O achado nº 2 da lista "fora do escopo" era maior do que parecia: **75 referências em 37 arquivos**
citavam `api/<handler>.js`, caminho que deixou de existir no `660fe74`. Quem lia o cabeçalho de
`lib/payment-integrity.js` e tentava abrir `api/webhook.js` não achava nada.

Só comentário e JSDoc, com todo destino conferido no disco antes de escrever — uma referência
legítima a `api/__tests__/serverless-entry.test.js` foi corretamente deixada em paz, porque esse
arquivo existe mesmo em `api/`. Os retratos em `docs/reviews/` **não** foram tocados: são datados de
propósito (regra F2), e o caminho antigo neles está certo para a data que descrevem.

### `DashboardTab` — a sequência que este relatório recomendou, executada → `cedb953`

Na ordem, e a ordem é o ponto:

1. **Caracterização primeiro** —
   [DashboardTab.test.jsx](../../src/components/admin/tabs/__tests__/DashboardTab.test.jsx), 14 casos
   descrevendo o que a tela **faz** hoje: os quatro KPIs do topo, o badge de tendência, os KPIs
   avançados que chegam por `fetch` depois do primeiro render (com o travessão enquanto não chegam e
   o `catch` da falha), os estados vazios de cada gráfico e a tabela de pedidos recentes.
2. **Só então a extração** — a matemática dos gráficos foi para
   [dashboard-charts.js](../../src/components/admin/tabs/dashboard-charts.js). 819 → **758 linhas**.
3. **Os 14 continuam verdes sem uma linha alterada** — é a prova de que foi refatoração, e não
   reescrita.

Mais 25 testes cobrem as bordas que eram inalcançáveis enquanto isso vivia dentro do JSX: período
inteiro zerado (o `Math.max(1, …)` faz a linha correr na base em vez de virar `NaN` e sumir o
`<polyline>`), uma entrada só (denominador `n - 1`), valor ausente tratado como zero, ciclo da
paleta, encadeamento dos ângulos fechando 360°, e o flag `largeArc` — sem ele, categoria com mais de
50% da receita é desenhada pelo caminho curto e aparece como a **menor** fatia do gráfico.

> O sintoma de um erro nessa matemática nunca foi exceção nem tela em branco: é um gráfico plausível
> e errado, em cima do qual alguém decide preço e estoque.

### E a catraca girou junto

896 → 935 testes, quase tudo no painel, que era a maior área sem cobertura. Medido
**49,78 / 40,51 / 42,43 / 51,33**, pisos recalibrados para **47/38/40/49** — deixar a folga crescer
para 6pp seria transformar o gate em enfeite, que é o que a regra D2 existe para impedir.
