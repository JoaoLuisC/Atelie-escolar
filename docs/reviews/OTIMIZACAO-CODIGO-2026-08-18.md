# Correções de otimização de código — Ateliê da Escola (2026-08-18)

> Revisão de **desempenho e enxugamento** feita sobre o commit `4b42fe8`
> (`chore(deps): remove o CLI vercel e documenta as advisories que sobraram`).
>
> **Escopo:** custo de carregamento no navegador, custo por requisição no backend,
> duplicação estrutural e código sem consumidor. **Não** é revisão de segurança —
> para isso, [REVIEW-GERAL-2026-08-12.md](./REVIEW-GERAL-2026-08-12.md) e
> [ProjectDocs/08-SEGURANCA.md](../ProjectDocs/08-SEGURANCA.md).
>
> **Método.** Nada aqui vem de leitura de código isolada. Cada número foi medido:
> build de produção real e `gzip -c` em cada chunk; grafo de imports resolvido
> arquivo a arquivo (`api/`, `lib/`, `src/`, `routes/`, `services/`, `validation/`);
> `manualChunks` instrumentado durante um build para ver os ids que ele recebe de
> verdade; suíte de testes executada duas vezes; `eslint .` executado.
>
> **Legendas** — Severidade: `ALTO` · `MÉDIO` · `BAIXO`.
> Status: 🔧 A corrigir · ✅ Corrigido · ⛔ Descartado (ver motivo) · 🔎 Verificado-OK

> ### ⚠️ Fronteira com `PADRONIZACAO-CORRECOES.md` (regra F2)
>
> `docs/PADRONIZACAO-CORRECOES.md` foi levantado no
> **mesmo dia, sobre o mesmo commit**, e mede dívida contra as 25 regras do
> CONTRIBUTING. Os dois documentos se cruzam em quatro pontos. Para não terem duas
> versões da mesma verdade, a divisão é:
>
> | Assunto                                | Canônico                     | Aqui                                                               |
> | -------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
> | Envelope de resposta legado (regra A1) | **P1.1 / P1.2 / P1.3** de lá | §3.2, só o ângulo de por que a factory do §3.1 fecha isso de graça |
> | `guardMethod` sem adoção (regra A3)    | **P2.1** de lá               | §3.3, ponteiro                                                     |
> | Suíte instável (regra D2)              | **P0.3** de lá               | §5.1, ponteiro — o diagnóstico de lá é mais completo               |
> | `--max-warnings` congelado (regra D5)  | **P3.3** de lá               | §5.2, ponteiro                                                     |
>
> **Exclusivo deste documento** (não coberto lá): §1 bundle inteiro, §2 tetos de escala
> do backend, §3.1 factory dos CRUD admin, §4 código sem consumidor.
>
> Se um item divergir entre os dois, **o de lá vence** nos quatro assuntos da tabela.

---

## 0. TL;DR

O projeto **não tem problema de arquitetura nem de código morto espalhado** — a
varredura de imports não achou um único módulo órfão em `src/`, o logger está
unificado, o `Promise.all` está nos lugares certos e a aritmética de dinheiro está
em centavos. O que existe é outra coisa: **decisões de carregamento que ninguém
mediu depois de escrever**, e **abstrações que foram criadas mas não adotadas**.

| #   | Item                                                                            | Tipo       | Severidade | Esforço                  | Status  |
| --- | ------------------------------------------------------------------------------- | ---------- | ---------- | ------------------------ | ------- |
| 1.1 | SDK do Supabase (48 KB gz) baixado por toda visita; só 4 funções usam           | Bundle     | `ALTO`     | ~30 linhas em 4 arquivos | ✅      |
| 1.2 | `manualChunks` não produz o split que o comentário descreve                     | Bundle     | `ALTO`     | reescrever 1 função      | ✅      |
| 1.3 | `AdminPage` = 147 KB num chunk só (14 abas + 2 wizards)                         | Bundle     | `MÉDIO`    | 14 linhas                | ✅      |
| 1.4 | bootstrap-icons via CDN: fonte inteira + CSS render-blocking de terceiro        | Bundle     | `MÉDIO`    | self-host + subset       | ✅      |
| 2.1 | `/admin/dashboard` varre 7 tabelas sem `limit`; truncamento silencioso          | Backend    | `ALTO`     | agregar no servidor      | ✅ piso |
| 2.2 | 1 conexão SMTP nova por e-mail, em série, sob `maxDuration: 60`                 | Backend    | `ALTO`     | ~10 linhas               | ✅      |
| 2.3 | Dois loops sequenciais que deveriam ser lote (tokens, busca de usuário)         | Backend    | `MÉDIO`    | ~20 linhas               | ✅      |
| 3.1 | 5 handlers CRUD admin byte-a-byte idênticos (~275 linhas)                       | Duplicação | `MÉDIO`    | 1 factory                | ✅      |
| 3.2 | 27 respostas ainda no envelope legado, driblando o `fail()` (regra A1)          | Contrato   | `MÉDIO`    | sai junto com 3.1        | ✅      |
| 3.3 | `guardMethod` existe, é testado, e **nenhum** dos 44 handlers usa (regra A3)    | Duplicação | `BAIXO`    | adotar ou remover        | ✅ P2.1 |
| 4   | 6 exports sem consumidor em `lib/supabase.js` + 1.143 linhas de doc em retirada | Morto      | `BAIXO`    | apagar                   | ✅      |
| 5.1 | Suíte instável: 3 falhas por timeout numa execução, 387/387 na seguinte         | Tooling    | `ALTO`     | config de ambiente       | ✅ P0.3 |
| 5.2 | `--max-warnings=19` com exatamente 19 avisos — congela o débito (regra D5)      | Tooling    | `BAIXO`    | ratchet                  | ✅ P3.3 |

📍 = a correção canônica está em `PADRONIZACAO-CORRECOES.md`,
no item indicado. Ver a nota de fronteira no topo.

**Ganho medido dos itens 1.1 + 1.2:** de **158 KB** para **~103 KB** gzipped no
caminho crítico — **−35%**, sem remover uma única funcionalidade.

---

## 1. Caminho crítico do bundle

### Linha de base medida

Build de produção, tudo que o `dist/index.html` baixa antes de pintar a primeira tela
(entry + os `modulepreload` que ele declara):

| Chunk                   |         gzip | O que é                                    |
| ----------------------- | -----------: | ------------------------------------------ |
| `react-*.js`            |      57,4 KB | react-dom + react                          |
| **`supabase-*.js`**     |  **48,1 KB** | **@supabase/supabase-js completo**         |
| `router-*.js`           |      15,2 KB | react-router                               |
| `forms-*.js`            |      11,6 KB | React core **+ react-hook-form** (ver 1.2) |
| `index-*.css`           |      10,5 KB | Tailwind                                   |
| `index-*.js`            |       8,9 KB | código da aplicação                        |
| `vendor-*.js`           |       5,7 KB | helmet-async, prop-types, scheduler        |
| `rolldown-runtime-*.js` |       0,4 KB | runtime                                    |
| **Total**               | **157,8 KB** |                                            |

O `index-*.js` — o código que a equipe escreveu — é **5,6%** do que a visitante baixa.
Todo o resto é dependência, e duas delas não precisavam estar ali.

---

### 1.1 · O SDK do Supabase é 30% do caminho crítico e a home nunca o usa — `ALTO`

**Evidência.** A cadeia é estática, do entry até o SDK:

```
src/main.jsx:8            import { AuthProvider } from './providers/AuthProvider'
  └─ AuthProvider.jsx:5   import { ... } from '../services/customer-auth'
       └─ customer-auth.js:2  import { ... } from './supabase-browser'
            └─ supabase-browser.js:1  import { createClient } from '@supabase/supabase-js'
```

Confirmado no build: `supabase-*.js` é importado por **exatamente um** chunk — o de
entrada — e o `dist/index.html` ainda o declara como `modulepreload`, ou seja, ele
compete em prioridade de rede com o que a tela precisa para pintar.

O uso real do cliente, varrido em todo o `src/`, é **só `supabase.auth.*`**:

| Arquivo                                                           | Chamadas                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| [customer-auth.js](../../src/services/customer-auth.js)           | `signInWithOAuth`, `getSession`, `signOut` ×2                      |
| [ResetPasswordPage.jsx](../../src/pages/ResetPasswordPage.jsx)    | `exchangeCodeForSession`, `getSession`, `setSession`, `updateUser` |
| [CustomerAuthPage.jsx](../../src/pages/CustomerAuthPage.jsx#L133) | `resetPasswordForEmail`                                            |

Zero `.from()`, zero `.storage`, zero `.channel()`, zero `.functions`. Mesmo assim o
chunk carrega `realtime-js` + `@supabase/phoenix` (websockets), `storage-js`,
`postgrest-js` e `functions-js`. E `storage-js` arrasta **`iceberg-js` — um cliente do
Apache Iceberg REST Catalog** — para dentro do bundle do navegador de quem só quer ver
um banner de alfabetização.

**Por que importa.** `fetchCustomerSession()` é a única chamada do boot do
`AuthProvider` e ela usa `apiRequest`, não o SDK. Ou seja: **nenhuma visita precisa do
SDK antes de alguém clicar em "Entrar com Google" ou abrir um link de recuperação de
senha.** São 48 KB comprimidos (186 KB descomprimidos, que ainda precisam ser
parseados e executados) cobrados de 100% do tráfego para servir uma fração dele.

#### Correção — passo 1: tirar o SDK do caminho crítico

Separar o que é URL (puro, minúsculo, pode ficar no entry) do que é cliente (pesado,
vai por `import()` dinâmico).

Em [`src/services/supabase-browser.js`](../../src/services/supabase-browser.js) —
remover o import estático do topo e tornar a criação do cliente assíncrona. As duas
funções de URL (`buildPasswordResetRedirectUrl`, `buildOAuthRedirectUrl`) **não mudam**:
elas só usam `URL` e `constants/routes`, e continuam síncronas.

```js
// ── ANTES (topo do arquivo) ─────────────────────────────────────────
// import { createClient } from '@supabase/supabase-js';

// ── DEPOIS ──────────────────────────────────────────────────────────
// Sem import estático: o SDK só é baixado quando alguém realmente entra
// num fluxo de auth do Supabase (Google OAuth ou recuperação de senha).
// Ver docs/reviews/OTIMIZACAO-CODIGO-2026-08-18.md §1.1.

let supabaseBrowserClient = null;
let clientPromise = null;

export async function getSupabaseBrowserClient() {
  if (supabaseBrowserClient) return supabaseBrowserClient;

  const config = getSupabaseBrowserConfig();
  if (!config) return null;

  // Memoiza a PROMESSA, não só o cliente: duas chamadas concorrentes
  // (o efeito do ResetPasswordPage e um clique) não podem baixar o
  // chunk duas vezes nem criar dois clientes com PKCE state separado.
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      supabaseBrowserClient = createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      });
      return supabaseBrowserClient;
    });
  }

  return clientPromise;
}
```

Ajuste nos 3 pontos de chamada:

| Local                                                                                                                                                  | Mudança                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [customer-auth.js](../../src/services/customer-auth.js) — `loginCustomerWithGoogle`, `consumeCustomerSessionFromAuthCallback`, `logoutCustomerSession` | já são `async`: basta `await getSupabaseBrowserClient()`                                                                                                                                                                    |
| [CustomerAuthPage.jsx:133](../../src/pages/CustomerAuthPage.jsx#L133)                                                                                  | já está dentro de `async function submitPasswordReset`: basta `await`                                                                                                                                                       |
| [ResetPasswordPage.jsx:42](../../src/pages/ResetPasswordPage.jsx#L42)                                                                                  | **precisa de refactor**: hoje chama no corpo do componente. Mover para dentro do `useEffect` que já existe (`bootstrapRecoverySession`) e guardar em `useRef`, já que o `supabase` só é usado dentro de efeitos e handlers. |

> ⚠️ **Cuidado no `ResetPasswordPage`.** O `supabase` é lido no corpo do componente e
> usado em `bootstrapRecoverySession` **e** no submit da nova senha. Se virar `state`,
> um render extra acontece antes de o cliente existir — o guard `if (!supabase)` já
> cobre isso, mas o toast de "Configuração ausente" não pode disparar nesse intervalo.
> Guardar em `useRef` e resolver dentro do efeito evita o falso negativo.

#### Correção — passo 2 (opcional, ganho maior): trocar o guarda-chuva por `@supabase/auth-js`

Com o passo 1 o custo sai do caminho crítico, mas quem entra no fluxo de login ainda
baixa 48 KB para usar só `auth`. Importar `@supabase/auth-js` direto derruba o chunk
para a faixa de **~20 KB gz** e elimina `realtime-js`, `storage-js` (e o `iceberg-js`
junto), `postgrest-js` e `functions-js`.

> ⚠️ **Não faça isso sem testar os dois fluxos ponta a ponta.** O `createClient` do
> pacote guarda-chuva define a `storageKey` (`sb-<project-ref>-auth-token`) e os headers
> (`apikey`) por você. Instanciando o `AuthClient` na mão é preciso reproduzir os dois,
> ou o `code_verifier` do PKCE é gravado numa chave diferente da que o callback lê — e o
> login com Google passa a falhar **só em produção**, depois do redirect do Google.
> Valide: (a) Google OAuth completo, (b) link de recuperação de senha, (c) logout.

**Como verificar (os dois passos).**

```bash
npm run build
grep -c modulepreload dist/index.html          # supabase não pode mais aparecer
grep -l 'supabase-' dist/assets/index-*.js     # não deve retornar nada
for f in dist/assets/*.js dist/assets/*.css; do echo "$(gzip -c "$f" | wc -c)  $f"; done
```

---

### 1.2 · O `manualChunks` não produz o split que o comentário descreve — `ALTO`

**Evidência.** Instrumentei a função de
[`vite.config.js:16`](../../vite.config.js#L16) durante um build real, imprimindo o
`id` que ela recebe e o bucket que ela devolve. **A classificação está certa:**

```
PROBE forms  <= /react-hook-form/dist/index.esm.mjs
PROBE react  <= /react/jsx-runtime.js
PROBE react  <= /react/cjs/react-jsx-runtime.production.js
PROBE react  <= /react-dom/cjs/react-dom-client.production.js
PROBE vendor <= /scheduler/index.js
```

**Os chunks emitidos não batem com ela.** O arquivo `forms-*.js` (31,7 KB) contém as
duas coisas ao mesmo tempo:

```bash
$ grep -c "react.transitional" dist/assets/forms-*.js   # React core      → 1
$ grep -c "shouldUnregister"   dist/assets/forms-*.js   # react-hook-form → 1
$ grep -l 'forms-gg2rl3zR' dist/assets/*.js | wc -l     # importadores    → 17 (todos)
```

Ou seja: o rolldown reagrupou os módulos por cima da dica, e o chunk que **todo mundo**
importa — porque todo mundo precisa do `jsx-runtime` — levou o react-hook-form de
carona. O react-hook-form é usado em **um** arquivo:
[`CheckoutPage.jsx:3`](../../src/pages/CheckoutPage.jsx#L3).

De quebra, o `scheduler` (dependência dura do react-dom) caiu no `vendor`, então o
runtime do React está espalhado por três arquivos diferentes no caminho crítico.

**Por que importa.** Os nomes dos chunks estão mentindo, e é isso que faz o problema
sobreviver: quem abre o `vite.config.js` lê uma função correta e conclui que o split
está correto. Ninguém vai olhar o `dist`.

#### Correção

Menos buckets, casados por fronteira de pacote — e **sem** bucket para o
react-hook-form, para que ele fique no chunk do `CheckoutPage`, que é o único lugar que
o usa:

```js
manualChunks(id) {
  if (!id.includes('node_modules')) return undefined;

  // O id chega com barras normais e prefixo `node_modules/` mesmo no
  // Windows (medido, não suposto — ver §1.2 do doc de otimização).
  // Casar por fronteira de pacote evita que `react-hook-form` e
  // `react-helmet-async` caiam no bucket do React por substring.
  const pkg = id.split('node_modules/').pop();

  // react + react-dom + scheduler juntos: scheduler é dependência dura do
  // react-dom, separá-los só adiciona uma requisição no caminho crítico.
  if (/^(react|react-dom|scheduler)\//.test(pkg)) return 'react';
  if (pkg.startsWith('react-router')) return 'router';
  if (pkg.startsWith('@supabase/')) return 'supabase';

  // Sem bucket para react-hook-form: usado só no CheckoutPage, deve viajar
  // com ele. Um bucket nomeado o transformaria em chunk compartilhado.
  return 'vendor';
}
```

**Como verificar.** O teste não é ler a função — é conferir o `dist`:

```bash
npm run build
grep -l "shouldUnregister" dist/assets/*.js   # só CheckoutPage-*.js
grep -l "react.transitional" dist/assets/*.js # só react-*.js
```

> **Regra que isso sugere.** Configuração de chunk se valida contra o artefato, nunca
> contra a intenção. Se o item 1.2 for corrigido, vale um comentário no
> `vite.config.js` com os dois `grep` acima — é o que impede a regressão silenciosa
> na próxima atualização do Vite.

---

### 1.3 · `AdminPage`: 147 KB num chunk só — `MÉDIO`

**Evidência.** [`AdminPage.jsx:9-23`](../../src/pages/AdminPage.jsx#L9-L23) importa
estaticamente as 14 abas e os 2 wizards. Resultado: `AdminPage-*.js` = 147 KB
(36,2 KB gz), o maior chunk de aplicação do projeto.

Quem abre a aba "Produtos" baixa `DashboardTab` (809 linhas), `AnalysisTab` (673),
`FunnelTab` (242), `SegmentsTab` (157), `ComparisonTab` (78) e `ProductWizard` (879) —
sem abrir nenhum deles.

**Correção.** O padrão já existe e funciona no projeto — é o mesmo do
[`App.jsx:5`](../../src/App.jsx#L5):

```js
const DashboardTab = lazy(() =>
  import('../components/admin/tabs/DashboardTab').then((m) => ({ default: m.DashboardTab })),
);
// … idem para as outras 13 abas e os 2 wizards
```

O `<Suspense>` pode envolver só a área de conteúdo do
[`AdminLayout`](../../src/components/admin/AdminLayout.jsx), com o mesmo
`RouteFallback` do `App.jsx` — a navegação lateral continua instantânea.

**Bônus barato, no mesmo arquivo.** As 12 derivações de
[`AdminPage.jsx:176-205`](../../src/pages/AdminPage.jsx#L176-L205)
(`deriveAbcCurve`, `deriveFaturamentoSeries`, `deriveCohort`…) rodam a cada carga do
dashboard independente da aba aberta. Como `TABS_NEEDING_DASHBOARD` já existe em
[`tabs.js:18`](../../src/components/admin/utils/tabs.js#L18), dá para condicionar cada
`useMemo` à aba que consome o valor.

---

### 1.4 · bootstrap-icons: fonte inteira via CDN de terceiro — `MÉDIO`

**Evidência.** [`index.html:20`](../../index.html#L20) carrega
`bootstrap-icons.min.css` do `cdn.jsdelivr.net`. É uma folha **render-blocking**, de um
terceiro, que puxa a família de ícones inteira (~120 KB de woff2 para ~2.000 glifos).
O projeto usa **66 ícones distintos** — medido varrendo `bi bi-*` em `src/` e
`index.html`.

**Por que importa.** Três custos somados: latência extra de DNS+TLS para um host a mais
no caminho crítico; ~120 KB de fonte para usar 3% dela; e uma dependência de
disponibilidade externa em cima da primeira pintura.

**Correção (escolher uma).**

1. **Self-host com subset** — `npm i bootstrap-icons`, gerar um woff2 só com os 66
   glifos (`glyphhanger` ou `fonttools pyftsubset`), servir de `public/`. Fica na casa
   de 6–10 KB e some o host externo.
2. **SVG inline** — 66 ícones viram um componente `<Icon name="…" />` com sprite.
   Mais trabalho, elimina a fonte inteira e o FOUT.

**Ganho colateral que vale citar:** com o CDN fora, dá para remover
`https://cdn.jsdelivr.net` de `style-src` **e** `font-src` no CSP de
[`vercel.json:18`](../../vercel.json#L18) — menos superfície, não só menos bytes.

---

## 2. Backend — custo por requisição e tetos de escala

### 2.1 · `/api/admin/dashboard` varre 7 tabelas inteiras, sem `limit` — `ALTO`

**Evidência.** [`api/admin/dashboard.js:65-105`](../../api/admin/dashboard.js#L65-L105)
faz `listTableRows` **sem `limit` e sem filtro de data** em:

| Tabela                               | Cresce com                            |
| ------------------------------------ | ------------------------------------- |
| `products`, `categories`, `settings` | catálogo (limitado, tudo bem)         |
| `profiles`                           | base de clientes                      |
| `orders`                             | **cada venda**                        |
| `order_items`                        | **cada item de cada venda**           |
| `download_logs`                      | **cada download** — a que mais cresce |

Tudo isso é serializado e enviado ao navegador, que então refaz as contas nas 12
derivações do `AdminPage`.

**Por que importa — dois problemas, e o segundo é o pior.**

1. O payload cresce linearmente com o volume de vendas. Numa loja que deu certo, a aba
   Dashboard vira um download de megabytes.
2. **Truncamento silencioso.** `listTableRows` monta a query em
   [`lib/supabase.js:39`](../../lib/supabase.js#L39) e só emite `limit` se o chamador
   passar um. Se o `db-max-rows` do PostgREST estiver (ou vier a ser) configurado no
   projeto Supabase, o corte acontece **sem erro** — o faturamento total aparece menor
   do que é, e nada no sistema avisa. Um número de dinheiro errado que não levanta
   exceção é a pior classe de bug que existe neste projeto.

**Correção.** Em ordem de esforço crescente:

1. **Piso imediato (poucas linhas):** passar `limit` explícito em toda chamada e
   comparar com o retorno. Se `rows.length === limit`, logar
   `log.warn('possivel_truncamento', { table, limit })`. Isso não conserta o custo, mas
   converte um erro silencioso em erro visível — e é o que a regra E3 (dinheiro) exige
   em espírito.
2. **Janela de data** em `orders` / `order_items` / `download_logs`. O dashboard mostra
   mês corrente e comparativo mensal; `download_logs` é usado só para contagem por
   produto. Nada disso precisa de 2023.
3. **Agregação no servidor.** O caminho certo, e o projeto já anda nele: `/admin/kpis`,
   `/admin/abc-products`, `/admin/abc-customers`, `/admin/cohort` e `/admin/funnel` já
   agregam server-side. O `/admin/dashboard` é o que ficou para trás. Contagens e somas
   viram uma view ou uma função SQL; o navegador recebe números, não linhas.

> A regra **E4** já dá a política de cache pronta para o resultado
> (`setCachePolicy(res, 'adminReport')`), e ela **já está sendo usada** nos endpoints
> agregados. Mais um motivo para o dashboard convergir para o mesmo formato.

---

### 2.2 · Uma conexão SMTP nova por e-mail, em série, sob teto de 60s — `ALTO`

**Evidência.** [`lib/email-sender.js:198`](../../lib/email-sender.js#L198) chama
`buildTransporter()` **dentro** de `sendEmail`. Cada e-mail abre TCP + handshake TLS +
AUTH do zero. E [`api/cron-email-jobs.js`](../../api/cron-email-jobs.js#L372) percorre
os destinatários em `for` sequencial — quatro laços independentes (carrinho 1h, 24h,
pós-compra, reativação), cada um com `await sendEmail` por destinatário.

Some a isso **3 round-trips ao Supabase por e-mail**: `findExistingSentLog`,
`recordSentLog('queued')` e `updateSentLogStatus('sent')`.

**Por que importa.** [`vercel.json:6`](../../vercel.json#L6) dá `maxDuration: 60` a essa
função, e o [`email-cron.yml`](../../.github/workflows/email-cron.yml#L17) a dispara de
hora em hora. Com handshake TLS completo por mensagem mais 3 idas ao banco, o teto
prático fica em algumas dezenas de e-mails por execução. Passando disso, a função é
morta no meio — e como a idempotência é por `(email, kind, entity_id)`, a próxima hora
retoma, mas **a fila nunca esvazia** se a taxa de entrada superar a de saída. Falha por
crescimento, em silêncio, exatamente quando a newsletter começa a dar certo.

**Correção.** Memoizar o transporter no módulo, com pool — o nodemailer suporta
nativamente:

```js
// ── ANTES ───────────────────────────────────────────────────────────
// function buildTransporter() { return nodemailer.createTransport({ … }); }
// … e, dentro de sendEmail:  const transporter = buildTransporter();

// ── DEPOIS ──────────────────────────────────────────────────────────
// Transporter ÚNICO por instância da função. Sem isto, cada e-mail paga
// TCP + TLS + AUTH do zero — o que, somado aos 3 round-trips ao Supabase
// por mensagem, colocava o cron contra o maxDuration de 60s do
// vercel.json. Ver docs/reviews/OTIMIZACAO-CODIGO-2026-08-18.md §2.2.
let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS) || 3,
    maxMessages: 100,
  });

  return cachedTransporter;
}
```

> ⚠️ **Confirme o limite de conexões simultâneas do Resend** antes de subir
> `maxConnections`. Estourar o limite do provedor troca "lento" por "bloqueado", que é
> pior. Comece em 3 e meça.
>
> ℹ️ **Isto não viola a regra E2** ("nada de estado em memória dentro de função
> serverless"). E2 existe para estado _de decisão_ — cache de dados, contador de rate
> limit — cujo acerto entre instâncias é acidental. Um pool de conexões é recurso de
> I/O local à instância: se a instância morre, o pool morre junto e nada fica
> inconsistente. Vale registrar esse racional no PR, porque a leitura apressada da E2
> proibiria a correção.

**Segundo passo, se ainda faltar folga:** trocar os `for` sequenciais por lotes com
concorrência limitada (ex.: 5 por vez). Não use `Promise.all` no array inteiro — sem
teto, cem envios simultâneos derrubam o pool e o rate limit do Resend ao mesmo tempo.

---

### 2.3 · Dois loops sequenciais que deveriam ser uma chamada — `MÉDIO`

#### 2.3.a · `createTokensForOrder` insere token a token, dentro do checkout

**Evidência.** [`api/verify-payment.js:149`](../../api/verify-payment.js#L149): um
`await insertIntoTable('download_tokens', …)` **por item do pedido**, em série, no
caminho da confirmação de pagamento — o momento em que a cliente está olhando para a
tela esperando.

**Correção.** O PostgREST aceita array. E o tratamento de 409 por item — que existe por
causa da corrida com o webhook, protegida pela `UNIQUE(order_id, product_id)` da
migration `20260701_phase5_payment_hardening` — some usando `upsert`:

```js
async function createTokensForOrder(order, items) {
  // Lote único em vez de N round-trips: a UNIQUE(order_id, product_id) da
  // migration de hardening resolve a corrida com o webhook, e o
  // merge-duplicates do upsert dispensa o try/catch por item.
  await upsertIntoTable(
    'download_tokens',
    items.map((item) => ({
      token: crypto.randomBytes(32).toString('hex'),
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      used: false,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    })),
    'order_id,product_id',
  );

  // Continua devolvendo o conjunto efetivamente persistido (cobre a corrida).
  return mapTokenRows(await loadDownloadTokens(order.id));
}
```

> Isso **dá uso ao `upsertIntoTable`**, que hoje é um dos exports mortos do §4 — ele
> deixa de ser candidato a remoção.
>
> ⚠️ **Confirme o comportamento do `merge-duplicates` na coluna `token`.** Se o webhook
> já criou a linha, o upsert **não pode** sobrescrever o `token` existente com um novo —
> isso invalidaria um link de download já enviado por e-mail. Se o
> `Prefer: resolution=merge-duplicates` de
> [`lib/supabase.js:172`](../../lib/supabase.js#L172) atualizar todas as colunas
> enviadas, use `Prefer: resolution=ignore-duplicates` para este caso. **Testar antes de
> subir** — a suíte `download-single-use.test.js` é o lugar certo para travar isso.

#### 2.3.b · `findUserByEmail` pagina até 2.000 usuários procurando um e-mail

**Evidência.**
[`lib/customer-account-provisioning.js:41`](../../lib/customer-account-provisioning.js#L41):
`while (page <= 10)` com `perPage: 200`, chamando `admin.auth.admin.listUsers()` a cada
volta e filtrando em memória. São até **10 chamadas sequenciais** à Admin API para achar
um e-mail.

E há um teto: passando de 2.000 usuários a função devolve `null` para quem existe, e o
chamador segue para criar a conta duplicada.

**Correção.** A tabela `profiles` já tem `email` e é populada pelo trigger
`handle_new_user()` (migration `20260702_phase6_db_rls_hardening`). Uma consulta
indexada substitui a varredura:

```js
async function findUserByEmail(admin, email) {
  const profile = await getTableRow('profiles', {
    select: 'id',
    filters: [{ column: 'email', operator: 'eq', value: email.toLowerCase() }],
    useServiceRole: true,
  });

  if (profile?.id) {
    const { data } = await admin.auth.admin.getUserById(profile.id);
    if (data?.user) return data.user;
  }

  // Fallback: conta criada em auth.users sem linha em profiles (falha do
  // trigger). Raro, mas se cair aqui e a base for grande, o resultado é um
  // negativo falso — melhor logar do que assumir que não existe.
  return null;
}
```

> ⚠️ **Requer um índice em `profiles(lower(email))`** para valer a pena — sem ele a
> troca é cosmética. Vale uma migration junto.

---

## 3. Duplicação estrutural

### 3.1 · Cinco handlers CRUD admin byte-a-byte idênticos — `MÉDIO`

**Evidência.** [`products.js`](../../api/admin/products.js),
[`categories.js`](../../api/admin/categories.js),
[`coupons.js`](../../api/admin/coupons.js), [`orders.js`](../../api/admin/orders.js) e
[`users.js`](../../api/admin/users.js) terminam com o **mesmo bloco de ~55 linhas**:

```
setAdminCorsHeaders → OPTIONS → ensureAdminSession → getSupabaseConfig
  → mapa de métodos → executa → logAdminAction → res.status().json() → catch fail()
```

Diferem em exatamente três coisas: o `targetType` da auditoria, a chave do recurso na
resposta (`products` / `categories` / …) e a mensagem do catch. Comparei os cinco lado a
lado — até o comentário `// Auditoria de escrita (regra I1) — best-effort.` e o mapa
`actionByMethod` estão replicados caractere por caractere.

São **~275 linhas onde deveriam existir ~60**.

**Por que importa — e não é contagem de linhas.** É que existem cinco lugares onde a
auditoria de escrita pode ser esquecida no próximo recurso admin, e nenhum teste pega.
A regra **I1** (auditoria) depende hoje de alguém lembrar de copiar o bloco certo.

**Correção.** Uma factory em `lib/` — `createAdminResourceHandler` — que recebe o mapa
de operações e o `targetType`, e concentra CORS, sessão, método, auditoria e catch:

```js
// lib/admin-resource-handler.js
function createAdminResourceHandler({ targetType, errorMessage, operations }) {
  const allowed = [...Object.keys(operations), 'OPTIONS'];

  return async function adminResourceHandler(req, res) {
    setAdminCorsHeaders(req, res);
    if (guardMethod(req, res, Object.keys(operations))) return; // ver §3.3
    if (!ensureAdminSession(req, res)) return;

    try {
      if (!getSupabaseConfig()) {
        return fail(res, {
          status: 500,
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Supabase não configurado.',
        });
      }

      const result = await operations[req.method](req);

      if (req.method !== 'GET' && result.status >= 200 && result.status < 300) {
        await logAdminAction({ req, targetType /* … */ });
      }

      return result.error
        ? fail(res, result.error) // ver §3.2
        : ok(res, result.body, { status: result.status });
    } catch (error) {
      log.error('handler_failed', { reason: error?.message || String(error) });
      return fail(res, { status: 500, code: ERROR_CODES.INTERNAL_ERROR, message: errorMessage });
    }
  };
}
```

Cada handler vira a sua parte de domínio mais ~8 linhas de declaração. `allowed` sai do
próprio mapa de operações, então o header `Allow` do 405 nunca mais diverge do que o
handler realmente aceita.

> **Isto é decisão que atravessa arquivos → merece ADR** (regra F3). Sugestão:
> `docs/adr/0005-factory-para-recursos-crud-do-admin.md`, com a seção "Alternativas
> descartadas" registrando por que não virou um router genérico dirigido por
> configuração — a resposta é que cada recurso tem validação e normalização próprias, e
> genericizar isso troca duplicação visível por indireção invisível.

---

### 3.2 · 27 respostas ainda no envelope legado, driblando o `fail()` — `MÉDIO`

> ### 📍 Canônico: **P1.1 / P1.2 / P1.3** de `PADRONIZACAO-CORRECOES.md`
>
> Aquele levantamento é mais amplo (59 sites, incluindo auth do cliente e rate limit do
> Express, que esta revisão não varreu). **A correção a seguir é a de lá.** O que esta
> seção acrescenta é o recorte que a factory do §3.1 fecha sem trabalho extra — os 27
> sites que vivem dentro dos cinco handlers CRUD.

**Evidência.** As funções internas dos mesmos cinco handlers devolvem
`{ status, body: { success: false, error: 'texto' } }`, e o wrapper faz
`res.status(result.status).json(result.body)` — **sem passar pelo `fail()`**. São 27
ocorrências:

| Arquivo                                                                       | Ocorrências |
| ----------------------------------------------------------------------------- | ----------- |
| [api/admin/users.js](../../api/admin/users.js)                                | 7           |
| [api/admin/coupons.js](../../api/admin/coupons.js)                            | 5           |
| [api/admin/orders.js](../../api/admin/orders.js)                              | 5           |
| [api/admin/categories.js](../../api/admin/categories.js)                      | 4           |
| [api/me-delete-account.js](../../api/me-delete-account.js)                    | 5           |
| [lib/admin-session.js:202,210](../../lib/admin-session.js#L202)               | 2           |
| [lib/customer-auth-handlers.js:141](../../lib/customer-auth-handlers.js#L141) | 1           |

**Por que importa.** É exatamente o formato que o cabeçalho de
[`lib/http.js`](../../lib/http.js#L1-L20) documenta como **extinto**, e que o
[ADR 0004](../adr/0004-envelope-de-resposta-e-codigo-de-erro.md) declara resolvido.
Nessas 27 respostas o cliente **não recebe `code`** — então a regra **A2** ("ramifique
por código, nunca por texto") não vale nelas, e o
[`parseJson`](../../src/utils/api.js#L25) devolve `errorCode: null`. Quem escrever um
`if` por código numa dessas telas escreve um ramo morto para sempre.

Pior no caso de [`admin-session.js:202`](../../lib/admin-session.js#L202): é a resposta
de **sessão admin inválida**, justamente a que o
`format.js` precisa reconhecer para
disparar o re-login. O `ADMIN_SESSION_INVALID` existe no catálogo dos dois lados
([lib/http.js](../../lib/http.js) e
[src/constants/error-codes.js](../../src/constants/error-codes.js)) — e não é emitido
aqui.

**Correção.** Sai de graça junto com o §3.1: as funções internas passam a devolver
`{ status, body }` no sucesso e `{ error: { status, code, message } }` na falha, e o
wrapper roteia para `ok()` / `fail()`. Os três casos de `lib/` são substituição direta
por `fail(res, { status: 401, code: ERROR_CODES.ADMIN_SESSION_INVALID, … })`.

> ⚠️ **Isto muda o corpo de respostas de erro que o frontend já consome.** O `parseJson`
> achata `error.message` para string, então as telas que leem `data.error` como texto
> continuam funcionando — mas confirme os testes de
> [CheckoutPage](../../src/pages/__tests__/CheckoutPage.test.jsx) e
> [DownloadsPage](../../src/pages/__tests__/DownloadsPage.test.jsx) no mesmo commit.

---

### 3.3 · `guardMethod` existe, é testado, e nenhum handler usa — `BAIXO`

> ### 📍 Canônico: **P2.1** de `PADRONIZACAO-CORRECOES.md`
>
> Mesmo achado, medido independentemente nos dois documentos (zero adoções em 44
> handlers). **Siga o P2.1.** Registrado aqui porque a factory do §3.1 já usa
> `guardMethod` no exemplo de código — se o P2.1 optar por remover em vez de adotar, o
> §3.1 precisa ser ajustado junto.

**Evidência.** [`lib/http.js:220`](../../lib/http.js#L220) exporta `guardMethod`, com
docstring e exemplo de uso. Consumidores em `api/`: **zero** — varri os 44 handlers.
O único lugar que o menciona é [`lib/__tests__/http.test.js`](../../lib/__tests__/http.test.js).

Enquanto isso, os 44 handlers repetem o par à mão, em duas variantes que não conversam:

```js
// variante A (abc-customers, abc-products, cohort, kpis…)
if (req.method === 'OPTIONS') return preflight(res);
if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'OPTIONS']);

// variante B (categories, coupons, dashboard, funnel…)
if (req.method === 'OPTIONS') {
  return preflight(res);
}
if (req.method !== 'GET') {
  return methodNotAllowed(res, ['GET', 'OPTIONS']);
}
```

**Por que importa.** A regra **A3** fixa a ordem do topo do handler justamente para que
um bloco ausente seja _visível_. Um helper que existe mas ninguém usa é pior do que
não existir: ele documenta uma convenção que o código não segue, e faz a próxima pessoa
achar que seguiu.

**Correção — escolher uma, não deixar como está:**

- **Adotar** nos 44 handlers (`if (guardMethod(req, res, ['GET'])) return;`) — corta
  ~90 linhas, elimina a divergência de estilo e garante o header `Allow` em todo 405,
  que hoje depende de cada handler lembrar de passar a lista certa. É a opção coerente
  com a A3, e o §3.1 já a usa.
- **Remover** o export e seu teste, e apagar o exemplo da docstring.

---

## 4. Código sem consumidor

**Exports mortos em [`lib/supabase.js`](../../lib/supabase.js)** — verificado em todo o
repositório, incluindo testes:

| Export                  | Consumidores                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `buildSupabaseHeaders`  | 0                                                                     |
| `getSupabaseRestUrl`    | 0                                                                     |
| `getSupabaseStorageUrl` | 0                                                                     |
| `selectFromTable`       | 0                                                                     |
| `buildTableQuery`       | 0 (só citado num comentário de `validation/payment.schemas.js`)       |
| `upsertIntoTable`       | 0 — **mas ganha uso no §2.3.a; não remover se aquele item for feito** |

`getSupabaseStorageUrl` merece nota: ele monta URL **pública** de objeto do Storage. O
projeto entrega arquivo por URL **assinada** ([`lib/storage-signed-url.js`](../../lib/storage-signed-url.js)),
que é o comportamento correto. Deixar uma função de URL pública exportada, ao lado da
assinada, é um convite para alguém "simplificar" o download um dia. Remover é ganho de
segurança, não só de linhas.

**Documentos em retirada** — 1.143 linhas marcadas "⚠️ Documento em retirada. Não edite
este arquivo":

| Arquivo                          | Linhas | Canônico                                                          |
| -------------------------------- | -----: | ----------------------------------------------------------------- |
| `docs/ARCHITECTURE.md` (apagado) |     95 | [ProjectDocs/02-ARQUITETURA.md](../ProjectDocs/02-ARQUITETURA.md) |
| `docs/FLOWS.md` (apagado)        |    258 | [ProjectDocs/05-FLUXOS.md](../ProjectDocs/05-FLUXOS.md)           |
| `docs/SETUP.md` (apagado)        |    404 | [ProjectDocs/03-SETUP.md](../ProjectDocs/03-SETUP.md)             |
| `docs/SECURITY.md` (apagado)     |    386 | [ProjectDocs/08-SEGURANCA.md](../ProjectDocs/08-SEGURANCA.md)     |

A regra **F2** pede um documento por assunto; o aviso no topo foi o passo 1. O passo 2 é
apagar — o git guarda o histórico, e um arquivo que ninguém pode corrigir só existe para
alguém ler a versão errada. Ao apagar, atualizar as 4 linhas riscadas em
[docs/README.md](../README.md) e a menção em [README.md](../../README.md).

> ✅ **Feito em 18/08/2026.** Os quatro foram apagados (1.159 linhas) e as menções redirecionadas
> no mesmo commit — em `README.md`, `docs/README.md`, `docs/SUPABASE-SETUP.md`,
> `docs/REVIEW-PROMPTS.md` e nos quatro de `docs/NextFeatures/`, que o item não listava.

---

## 5. Ferramental

### 5.1 · A suíte de testes está instável — `ALTO`

**Evidência.** Duas execuções seguidas de `npx vitest run`, sem alterar nada entre elas:

```
run 1:  Test Files  3 failed | 27 passed (30)    Tests  3 failed | 384 passed (387)
run 2:  Test Files  30 passed (30)               Tests  387 passed (387)
```

As três falhas foram `Error: Test timed out in 5000ms` — não asserção — em
`webhook-signature.test.js`, `payment-integrity.test.js` e `checkout-money.test.js`.
São exatamente as suítes do **caminho do dinheiro**.

> ### 📍 Canônico: **P0.3** de `PADRONIZACAO-CORRECOES.md`
>
> Aquele item chegou à mesma correção (`test.projects`) e a **uma causa a mais que esta
> revisão não pegou**: a suíte faz rede de verdade —
> [`lib/security-logger.js`](../../lib/security-logger.js) chama o Supabase durante o
> teste e a saída mostra `{"event":"insert_falhou","reason":"fetch failed"}`. O tempo do
> teste passa a depender de quanto o DNS demora para falhar, o que explica por que os
> arquivos que falham **mudam entre execuções** (aqui foi `payment-integrity`, lá foi
> `api-endpoints`; `checkout-money` e `webhook-signature` caíram nas duas).
>
> **Siga o P0.3.** O que esta seção acrescenta é só a medição de custo abaixo.

**O custo do ambiente único, medido.** [`vite.config.js:31`](../../vite.config.js#L31)
define `environment: 'jsdom'` **global**. O relatório do próprio vitest acusa:

```
Duration  33.94s (transform 5.44s, setup 48.15s, import 30.06s,
                  tests 23.93s, environment 372.99s)
```

**373 segundos agregados construindo ambiente DOM** para 24 segundos de teste. Dos 30
arquivos, apenas 4 tocam DOM de verdade (as 3 suítes de página em `src/pages/__tests__/`
e `src/utils/__tests__/attribution.test.js`, que lê `document.referrer`). Os 26 restantes
— todo `api/` e todo `lib/` — montam um jsdom completo para testar HMAC, aritmética de
centavos e parsing de webhook.

Duas notas de implementação para quem for aplicar o P0.3:

- ⚠️ **`environmentMatchGlobs` não existe mais no Vitest 4** — confirmei que não há
  nenhuma ocorrência em `node_modules/vitest/`. Quem lembrar dessa opção de projetos
  antigos vai perder tempo; `test.projects` é o mecanismo atual, como o P0.3 já mostra.
- ⚠️ **`coverage` fica na RAIZ**, fora de `projects`. Movê-lo para dentro de um projeto
  quebra os thresholds da regra D2, que hoje travam regressão.

**Por que importa.** Uma suíte que falha em 1 de 2 execuções ensina, em duas semanas,
que CI vermelho não significa nada. E o dano cai primeiro justamente nos testes que
protegem o dinheiro.

---

### 5.2 · `--max-warnings=19` com exatamente 19 avisos — `BAIXO`

> ### 📍 Canônico: **P3.3** de `PADRONIZACAO-CORRECOES.md`
>
> Mantido aqui só pelo ângulo de desempenho: a regra que gera os 19 avisos é sobre
> renders em cascata, então este é backlog de performance, não de estilo.

**Evidência.** [`package.json:20`](../../package.json#L20):
`eslint . --max-warnings=19`. Rodei `eslint .`: **19 problemas (0 erros, 19 avisos)** —
o teto está colado no medido. Todos são a mesma regra, `react-hooks/set-state-in-effect`:

| Arquivo                                                                                                                                                            | Ocorrências |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------: |
| [ProductWizard.jsx](../../src/components/ProductWizard.jsx)                                                                                                        |           2 |
| [CategoryWizard.jsx](../../src/components/CategoryWizard.jsx)                                                                                                      |           2 |
| [SegmentsTab.jsx](../../src/components/admin/tabs/SegmentsTab.jsx)                                                                                                 |           2 |
| [DownloadsPage.jsx](../../src/pages/DownloadsPage.jsx)                                                                                                             |           2 |
| CouponWizard, CrossSellSection, AnalysisTab, CouponsTab, DashboardTab, SecurityTab, useProductFilters, CheckoutPage, CustomerAuthPage, HomePage, SubscriptionPages |      1 cada |

**Por que importa.** A regra **D5** diz literalmente "zerar primeiro, depois rodar
`--max-warnings=0`", e a própria justificativa dela registra que esses avisos são
"backlog real de performance". O teto no valor exato do medido faz o oposto do que a
regra pede: ele **congela** o débito. Nenhum aviso novo entra — o que é bom — mas
nenhum sai, e o número nunca se move sozinho.

Vale contrastar com o que o projeto faz **certo** em
[`vite.config.js`](../../vite.config.js#L67): os thresholds de cobertura têm folga
deliberada de 2pp e um comentário explicando que sobem junto com as suítes. O
`--max-warnings` não tem nem folga nem plano.

**Correção.** Ratchet: cada PR que corrigir um aviso **baixa o número no mesmo commit**.
Um comentário no `package.json` ou na regra D5 dizendo "este número só desce" é o que
transforma um teto em rampa. Os casos são majoritariamente o mesmo padrão
(`setReduced(mq.matches)` em [HomePage.jsx:115](../../src/pages/HomePage.jsx#L115) é o
exemplar) e vários resolvem com `useSyncExternalStore` ou inicializador lazy do
`useState`.

---

## 6. Verificado-OK — o que checei e está certo

Registrado porque hipótese refutada economiza a próxima revisão:

| Hipótese                                        | Resultado                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulos órfãos em `src/`                        | 🔎 **Zero.** Resolvi o grafo de imports inteiro; os 13 "não importados" são entrypoints legítimos (funções Vercel em `api/auth/**`, `api/notfound.js`, e os 6 scripts de `scripts/`).                                                                                                 |
| Dependências não usadas no `package.json`       | 🔎 Nenhuma. Todas as 16 de produção e 24 de dev têm consumidor real.                                                                                                                                                                                                                  |
| N+1 nas queries dos endpoints admin             | 🔎 Bem resolvido. `Promise.all` está nos 11 lugares certos (`dashboard`, `orders`, `products`, `users`, `funnel`, `abc-products`, `home-sections`, `products`, `sitemap`, `sales-counts`, `customer-segmentation`). Os dois loops sequenciais que sobraram estão no §2.3.             |
| `console.*` espalhado no backend                | 🔎 Já unificado em [lib/logger.js](../../lib/logger.js) (regra F1). As 8 ocorrências restantes são o próprio logger e comentários.                                                                                                                                                    |
| Duplicação de formatação de dinheiro front/back | 🔎 **Não é duplicação.** [src/utils/currency.js](../../src/utils/currency.js) (3 formatos por destino: tela / CSV / JSON-LD) e [lib/money.js](../../lib/money.js) (aritmética em centavos) resolvem problemas diferentes. O comentário no topo do `currency.js` já documenta por quê. |
| Duplicação da Curva ABC front/back              | 🔎 Deliberada e **guardada por teste de paridade** ([abc-parity.test.js](../../src/utils/__tests__/abc-parity.test.js)). Mesma solução em [src/constants/error-codes.js](../../src/constants/error-codes.js). Correto — a restrição é o ADR 0001 (CJS no backend, ESM no front).      |
| Rate limiting em memória (regra E2)             | 🔎 Já resolvido: [lib/rate-limit.js](../../lib/rate-limit.js) usa contador atômico no Postgres, com fail-open e timeout próprio de 2,5s. Os limiters em memória de `server.js` são só o Express de dev, e isso está documentado.                                                      |
| Cache em `Map` de processo nos handlers admin   | 🔎 Já removido — substituído pelas políticas de `CACHE_POLICIES` (regra E4).                                                                                                                                                                                                          |
| `TODO` / `FIXME` / dívida marcada no código     | 🔎 Zero em `api/`, `lib/`, `src/`.                                                                                                                                                                                                                                                    |

---

## 7. Ordem sugerida de execução

Agrupada por commit, cada um verificável isoladamente:

| Commit | Itens                                  | Por que junto                                                                            | Verificação                                   |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1      | **P0.3** de lá (ambiente dos testes)   | Primeiro de tudo: sem suíte confiável, nenhum dos outros commits pode ser validado       | `npx vitest run` 3× seguidas, verde nas 3     |
| 2      | **1.1** + **1.2** (bundle)             | Mesma medição, mesmo `dist`, melhor relação esforço/ganho: −35% do caminho crítico       | `npm run build` + tabela de gzip antes/depois |
| 3      | **2.2** (pool SMTP)                    | Isolado, ~10 linhas, destrava o teto do cron                                             | Enviar lote de teste e medir tempo por e-mail |
| 4      | **2.1** (dashboard)                    | Maior, mexe em contrato de API e no `AdminPage`                                          | Comparar totais de faturamento antes/depois   |
| 5      | **3.1** + **3.2** + **3.3**            | O envelope e o `guardMethod` saem de graça dentro da factory; separar geraria retrabalho | Suíte de `api/__tests__` + smoke no painel    |
| 6      | **2.3** + **4** (lotes + código morto) | `upsertIntoTable` deixa de ser morto ao ganhar uso em 2.3.a                              | `download-single-use.test.js`                 |
| 7      | **1.3** + **1.4** + **5.2**            | Polimento; o 5.2 é contínuo, não um commit                                               | `npm run build`, Lighthouse                   |

**Os itens 2, 4 e 5 merecem entrada no `PENDENCIAS.md`**
se não forem executados na mesma janela — são os que degradam com crescimento, e o
custo de adiar não é constante.

> **Sobre a ordem combinada com o `PADRONIZACAO-CORRECOES.md`.**
> Aquele documento tem a própria ordem de execução, e os dois **compartilham o commit 1**
> (P0.3 / §5.1). Fora isso, os blocos não colidem: os P0/P1 de lá tratam de contrato e
> gates, os §1/§2 daqui tratam de bytes e tetos de escala — arquivos diferentes, exceto
> os cinco handlers CRUD, onde o §3.1 daqui e o P1.2 de lá **devem sair no mesmo commit**
> (o commit 5 desta tabela). Fazer os dois separado é reescrever os mesmos cinco arquivos
> duas vezes.
