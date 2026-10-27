# Padrões de código — Ateliê da Escola

Convenções de engenharia deste repositório: **29 regras** em 6 áreas.

Cada regra existe porque uma divergência foi **medida no código**, não por preferência estética. A
seção "O que motivou" de cada uma guarda essa divergência, no estado em que o repositório estava
antes da regra — é a justificativa, não uma lista de pendências, e é o que permite discordar da
regra com dados na mão.

> **Em review**: cite o identificador da regra (`A1`, `E3`…) no comentário do PR. O código também
> cita as regras pelo identificador ("regra E1"), então eles não mudam de sentido.
> Se a regra estiver errada, o caminho é editar este arquivo — não abrir exceção no código.

---

## O que segura as regras

As 29 regras estão aplicadas. O que impede regressão é gate executável, não disciplina: todo número
que já tinha sido declarado "0" e voltou a subir era contagem, não teste.

| Gate                                             | Regra  | O que barra                                                                   |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| `npm run format:check`                           | D1     | Arquivo fora do Prettier                                                      |
| `npm run lint` (`--max-warnings=12`)             | D5     | Aviso de lint novo (catraca)                                                  |
| Thresholds de cobertura em `vite.config.js`      | D2     | Cobertura abaixo do piso (statements 48, branches 39, functions 41, lines 50) |
| `handlers/__tests__/envelope-contract.test.js`   | A1, A2 | `error` como string, erro sem `code`                                          |
| `handlers/__tests__/rate-limit-coverage.test.js` | E1     | Rota montada sem contador, guarda de sessão ou dispensa nomeada               |
| `routes/__tests__/api-route-parity.test.js`      | A6, E1 | Rota que não resolve para o módulo de `handlers/` esperado                    |
| `scripts/__tests__/icon-subset.test.js`          | —      | Subconjunto de ícones desatualizado                                           |
| `.husky/pre-commit` → `lint-staged`              | D1, D7 | `eslint --fix` e `prettier --write` só no que está em stage                   |

`npm run check` roda, nesta ordem, `check:env`, `format:check`, `lint`, `test`, `test:coverage` e
`build` — a mesma lista do `.github/workflows/test.yml`, que acrescenta `npm audit`.

**`D5` está em catraca, não em zero.** Sobram 12 avisos, todos do React Compiler: 11 de `setState`
dentro de efeito (exigem repensar o carregamento de dados componente a componente) e 1 de
biblioteca incompatível em `CheckoutPage.jsx` (o `react-hook-form`, sem conserto do nosso lado).
Ao corrigir um aviso, **baixe o teto no `package.json` no mesmo commit**.

### Quando a medição contradiz a regra, quem muda é a regra

Cinco regras foram corrigidas ao serem aplicadas (A1, A3, C3, C6, E3), e cada uma traz a correção
em bloco de citação. É o mecanismo, não a exceção: abrir exceção no código deixaria este documento
descrevendo um repositório que não existe.

Exceções permanentes escritas: `A6` mantém uma rota de compatibilidade, `B1` vale dali para frente
(endpoint novo entra com schema), `C1` admite `fetch` cru na telemetria e `C4` mantém
`src/components/admin/utils/`. **Exceção escrita é padrão; exceção tácita é divergência.**

---

## Índice

| Área                           | Assunto               | Regras |
| ------------------------------ | --------------------- | ------ |
| [A](#a--contrato-http)         | Contrato HTTP         | A1–A6  |
| [B](#b--validação-e-erros)     | Validação e erros     | B1–B3  |
| [C](#c--frontend)              | Frontend              | C1–C6  |
| [D](#d--qualidade-e-automação) | Qualidade e automação | D1–D7  |
| [E](#e--dinheiro-e-runtime)    | Dinheiro e runtime    | E1–E4  |
| [F](#f--log-e-documentação)    | Log e documentação    | F1–F3  |

Prioridades: **P0** risco aberto · **P1** dívida que cresce · **P2** consistência.

---

## A · Contrato HTTP

Os handlers foram escritos em momentos diferentes e cada um tinha inventado o próprio contrato.
Quem pagava a conta era o frontend, que carregava código só para reconciliar as diferenças. A
referência de cada endpoint está em [docs/09-API.md](./docs/09-API.md).

### A1 · Um envelope de resposta só, para toda a API — `P0`

**Regra.** Toda resposta JSON carrega `success`. O erro é **sempre** um objeto:

```js
// sucesso — payload plano ao lado do flag
{ success: true, products: [...], total: 12 }

// erro — objeto, sempre com code
{ success: false, error: { code: 'COUPON_NOT_FOUND', message: 'Cupom inválido.' } }
```

Sem variante "só neste endpoint". Ficam de fora só as respostas sem corpo JSON: `sitemap.xml`
(XML), `download` (302), `track-event` e `abandoned-cart` (204). Responda com `ok()` e `fail()` de
`lib/http.js`.

> **Correção da regra.** A primeira redação aninhava o sucesso sob `data`. Foi trocada por payload
> plano: o ganho de `{ success, data }` sobre `{ success, ...payload }` é pequeno, e o custo era
> reescrever todo consumidor do frontend e ~100 asserções de teste no caminho do checkout. A dor
> real estava no **erro**, e é lá que a padronização foi aplicada por inteiro.

**O que motivou.** Três formatos conviviam: `{ success: false, error: 'texto' }` em 32 handlers,
`{ error: 'texto' }` em 9 e `{ success: false, error: { message, code } }` no middleware de erro. O
`parseJson` de `src/utils/api.js` tinha um _shim_ que achatava `error` objeto para string, só para
o cliente sobreviver aos dois formatos.

### A2 · Todo erro carrega um `code` estável em SCREAMING_SNAKE — `P1`

**Regra.** A mensagem é para humano e pode mudar de redação. O `code` (catálogo `ERROR_CODES` em
`lib/http.js`) é o contrato de máquina: é nele que o frontend ramifica.

**O que motivou.** Só `validate-coupon` devolvia `code`, e em minúsculo. O painel decidia se a
sessão tinha expirado com `message.toLowerCase().includes('sessao admin')` — trocar uma palavra da
mensagem quebrava o re-login em silêncio.

### A3 · Ordem fixa no topo de todo handler — `P1`

**Regra.** CORS **quando cross-origin** → `OPTIONS` → método → rate limit → autenticação →
validação de schema → `try`.

Ordem fixa transforma "esqueceram o rate limit" num bloco visivelmente ausente, em vez de um
detalhe enterrado no meio do arquivo. `handlers/admin/kpis.js` é o modelo a copiar.

> **Correção da regra.** A primeira redação abria com "CORS", sem qualificação, e a medição achou
> 26 de 44 handlers sem CORS. A regra estava errada, não o código: front e API são **same-origin**
> na Vercel, e em dev o `cors` do Express resolve. Só os do painel emitem CORS
> (`setAdminCorsHeaders`, em `lib/http.js`), por causa do `credentials: 'include'`. Ver ADR 0006
> em [docs/02-ARQUITETURA.md](./docs/02-ARQUITETURA.md).

### A4 · Preflight `OPTIONS` sempre responde 204 — `P2`

**Regra.** 204 é a resposta correta para um preflight: não há corpo a devolver.

**O que motivou.** 23 handlers respondiam `204` e 17 respondiam `200`.

### A5 · Nome do handler = nome do arquivo em camelCase + `Handler` — `P2`

**Regra.** Com os handlers em subpastas, o nome inclui a pasta: `handlers/admin/kpis.js` exporta
`adminKpisHandler`, `handlers/teacher/account.js` exporta `teacherAccountHandler`.

O nome da função é o que aparece no stack trace. `handler` genérico transforma oito arquivos em
oito frames indistinguíveis.

**O que motivou.** 8 arquivos exportavam `handler` puro (o de upload, o de 404 e os seis de
autenticação de cliente).

> **Pendente.** Os seis de `handlers/auth/customer/` exportam só o nome do arquivo
> (`loginHandler`, `sessionHandler`…), sem o prefixo da pasta.

### A6 · Uma convenção de URL, não duas — `P2`

**Regra.** Recurso aninhado: `/api/admin/orders`, `/api/auth/customer/login`, `/api/teacher/account`.
Mudança de URL é _breaking_: fazer via rota de compatibilidade, sem pressa.

**O que motivou.** 18 endpoints do painel eram planos (`/api/admin-orders`) enquanto os de
autenticação de cliente eram aninhados — o mesmo produto expondo dois estilos de API.

> **Exceção.** O `vercel.json` ainda reescreve `/api/admin-(.*)` para `/api/admin/$1`. Existia só
> para a janela de deploy (um painel aberto continuava chamando a URL antiga); sem consumidor
> externo, pode sair.

---

## B · Validação e erros

### B1 · Toda entrada passa por um schema declarativo na borda — `P0`

**Regra.** `body`, `query` e `params` são validados por um schema `zod` de `validation/` antes da
primeira linha de lógica (`parse`/`parseOrFail` de `validation/index.js`). Endpoint novo entra com
schema; os antigos que ainda validam à mão migram quando forem tocados. Dinheiro primeiro.

**O que motivou.** O `zod` era dependência de produção com zero imports, e a pasta `validation/`
tinha sido apagada mas continuava referenciada em três configurações. `create-payment` registrava
o buraco: os `max()` do schema antigo nunca valeram naquele caminho.

### B2 · Coerção defensiva não é validação — `P1`

**Regra.** Depois do schema (B1), o handler confia no tipo. `Number(x || 0)` no meio da lógica
transforma entrada inválida em zero silencioso.

**O que motivou.** `Number(row.total_amount || 0)` aparecia em 17 pontos. O comentário de
`lib/payment-integrity.js` registra a consequência:

> `Number('')` e `Number(null)` são 0, não NaN, e foi exatamente esse coerce que transformava
> total ausente em "pedido de R$ 0,00, qualquer coisa paga".

### B3 · Ou o `AppError` vira o mecanismo real, ou sai do repositório — `P1`

**Regra.** Abstração instalada e não usada é pior que ausente: quem lê o código acredita numa
política central de erro que não existe.

**Decisão.** O `AppError` (`utils/app-error.js`) ficou **delimitado** ao middleware do Express
(`middleware/error.middleware.js`): carrega o status do 404 de `/api/*` e é a rede que impede um
`throw` não tratado de virar stack trace em HTML. Handler não lança `AppError`; responde com
`fail()` de `lib/http.js`, sempre.

**O que motivou.** `AppError` e o middleware estavam montados, mas nenhum handler lançava
`AppError`. O tratamento real era o `try/catch` de cada arquivo.

---

## C · Frontend

### C1 · Um cliente HTTP: `apiRequest`. `fetch` cru não passa em review — `P1`

**Regra.** `apiRequest` (`src/utils/api.js`) aplica timeout de 15 s via `AbortController` e
normaliza a resposta. Quem chama `fetch` direto abre mão das duas coisas.

> **Exceção nomeada.** `src/components/ErrorBoundary.jsx` e `src/utils/analytics.js` usam `fetch`
> cru como fallback do `sendBeacon`, com `keepalive`: o envio precisa sobreviver ao
> descarregamento da página, e o timeout do `apiRequest` o cancelaria. Não há resposta a ler.

**O que motivou.** 6 arquivos usavam `fetch` cru sem timeout — numa rede ruim, a tela ficava
carregando para sempre.

### C2 · Componente não fala com a API; `src/services/` fala — `P1`

**Regra.** O componente chama uma função de serviço nomeada pelo domínio. É isso que torna uma
troca de contrato (A1) edição em um arquivo, e não caçada por JSX.

**O que motivou.** `CouponField`, `CrossSellSection` e `NewsletterSignup` montavam URL e chamavam a
API de dentro do componente.

### C3 · Todo valor formatado sai de uma função nomeada — `P1`

**Regra.** Três destinos, três funções em `src/utils/currency.js`. Qual usar é decidido pelo
**destino**, não pelo gosto:

| Destino                         | Função               | Saída         |
| ------------------------------- | -------------------- | ------------- |
| Tela (pessoa lê)                | `formatPrice`        | `R$ 1.234,56` |
| CSV para Excel pt-BR            | `formatCsvNumber`    | `1234,56`     |
| Dado estruturado (JSON-LD, API) | `formatMachinePrice` | `1234.56`     |

> **Correção da regra.** A primeira redação dizia "dinheiro só através de `formatPrice`" e
> apontava 7 violações. Nenhuma era tela: seis eram colunas de CSV (onde `R$ 1.234,56` quebra a
> leitura numérica do Excel) e uma era o `price` do JSON-LD, que o `schema.org/Offer` exige com
> ponto. O problema real era que só o formato de tela tinha nome; agora os três têm, e a diferença
> está escrita.

### C4 · Uma casa por tipo de utilitário — `P2`

**Regra.** `src/utils/` para o browser, `lib/` para o servidor. Utilitário de um componente
específico mora junto do componente; utilitário genérico não.

> **Exceção nomeada.** `src/components/admin/utils/` existe e isso **é** a regra sendo cumprida:
> todos os arquivos têm consumidor só dentro do painel.
>
> | Arquivo             | Por que fica                                                                      |
> | ------------------- | --------------------------------------------------------------------------------- |
> | `derive.js`         | Derivações do painel (curva ABC, séries de faturamento, coorte)                   |
> | `tabs.js`           | Rótulos e `TABS_NEEDING_DASHBOARD`; descreve a navegação do painel                |
> | `category-label.js` | Rótulo seguro de categoria (esconde as categorias-fantasma com nome = UUID)       |
> | `errors.js`         | `friendlyAdminError`: traduz erro de rede ("Failed to fetch") para a dona da loja |
>
> Esta linha existe para que a próxima varredura não "corrija" o que está certo.

**O que motivou.** Três casas de utilitário, com coisa genérica (`formatDateTime`, hoje em
`src/utils/date.js`) morando na do painel.

### C5 · Rota vem de `src/constants/routes.js` — `P2`

**Regra.** Caminho literal em JSX é uma rota que ninguém consegue renomear com segurança. O caso
que dói: o caminho obscurecido do painel (`ADMIN_LOGIN_PATH`) só é seguro enquanto for único e
centralizado.

**O que motivou.** 50 rotas literais em `to="/…"` e `navigate('/…')`.

### C6 · Import nomeado do React, export nomeado do componente, `propTypes` em quem recebe props — `P2`

**Regra.** `import { useState } from 'react'`, `export function Componente`, e `propTypes` em todo
componente que recebe props. Exceções legítimas: `ErrorBoundary` (classe) e `main.jsx` (raiz)
importam `React`; `App.jsx` é o único export default.

> **Correção da regra.** A redação era "`propTypes` **sempre**". Mas páginas montadas por rota não
> recebem prop nenhuma, e `propTypes = {}` nelas não verifica nada — é cerimônia que ensina a
> tratar `propTypes` como ritual em vez de contrato.

---

## D · Qualidade e automação

Padrão que ninguém executa é sugestão: o CI exige o que a configuração descreve.

### D1 · Formatação é automática e bloqueante — `P0`

**Regra.** O Prettier (`.prettierrc.json`, `printWidth: 100`) decide o estilo; ninguém discute
formatação em review. `npm run format:check` está no `npm run check` e no CI. Commits só de
formatação entram em `.git-blame-ignore-revs`.

**O que motivou.** 189 arquivos reprovavam `prettier --check`, e nada executava os scripts
`format`/`format:check`.

### D2 · Cobertura precisa rodar antes de virar meta — `P1`

**Regra.** Thresholds no valor medido menos uma folga (~2 pp), em `vite.config.js`. O piso trava
regressão; não é meta de salto. Ao subir a cobertura, suba o piso.

**O que motivou.** `npm run test:coverage` quebrava por falta do `@vitest/coverage-v8`, e os
thresholds estavam comentados esperando essa instalação.

### D3 · Todo módulo de `lib/` tem suíte — `P1`

**Regra.** `lib/` é onde mora a regra de negócio compartilhada — o melhor retorno por teste
escrito, porque um bug ali aparece em vários endpoints. A suíte mora em `lib/__tests__/` ou, quando
o módulo é exercitado pelo caminho do handler, em `handlers/__tests__/`.

**O que motivou.** 8 de 21 módulos tinham suíte; `coupons.js`, `mercadopago-config.js` e
`email-sender.js`, entre outros, não.

### D4 · Config não referencia caminho que não existe — `P2`

**Regra.** Referência morta em configuração é armadilha: sugere cobertura que não acontece e esconde
a real. `rate-limit-coverage.test.js` aplica isso às dispensas de rate limit.

**O que motivou.** `validation/**` aparecia em `package.json`, `eslint.config.js` e
`vite.config.js` apontando para uma pasta apagada.

### D5 · Zerar os avisos de lint e proibir novos — `P2`

**Regra.** Aviso que sobrevive a um deploy ensina o time a ignorar a saída inteira do lint. O alvo
é `--max-warnings=0`; até lá, catraca (ver o topo).

**O que motivou.** 30 avisos, nove deles `eslint-disable` inúteis.

### D6 · Arquivo é UTF-8 sem BOM, sempre — `P2`

**Regra.** `.gitattributes` fixa `eol=lf`; `scripts/check-utf8.js` e `scripts/fix-utf8.js`
verificam e corrigem encoding.

**O que motivou.** Histórico de corrupção de acento e um arquivo de `src/services/` com BOM.

### D7 · Hook de pré-commit roda lint e format no que mudou — `P2`

**Regra.** `husky` + `lint-staged`: `eslint --fix` e `prettier --write` nos arquivos em stage. O
custo é de milissegundos e o erro não chega ao CI. Precisar de `--no-verify` com frequência é sinal
de que o hook está errado — mude a regra aqui.

**O que motivou.** Não havia hook nenhum.

---

## E · Dinheiro e runtime

Aqui as regras têm consequência direta em receita, entrega de produto pago ou conta de
infraestrutura.

### E1 · Rate limit em todo endpoint público, sem exceção — `P0`

**Regra.** `enforceRateLimit` (`lib/rate-limit.js`) **no handler** — nunca só no Express. Perfil
compartilhado vai em `RATE_LIMITS`; balde de uso único pode ser declarado no próprio handler.
Endpoint que não precisa (sessão, assinatura, segredo) entra na lista de dispensas nomeadas de
`rate-limit-coverage.test.js`, com o motivo. Ver ADR 0007 em
[docs/02-ARQUITETURA.md](./docs/02-ARQUITETURA.md).

**O que motivou.** Cinco endpoints públicos sem contador em produção — entre eles `download`, que
entrega o arquivo pago. O limitador de cupom "só existia no Express de desenvolvimento": a
divergência dev/prod era a causa raiz.

### E2 · Nada de estado em memória dentro de função serverless — `P1`

**Regra.** Cache de leitura vai para `Cache-Control` com CDN, ou para tabela. O que a instância
guarda na RAM morre com ela.

**O que motivou.** Três relatórios do painel mantinham `const cache = new Map()` com TTL de 1 hora
e respondiam `X-Cache: HIT` — um header que afirmava algo que o runtime não garante.

### E3 · Aritmética de dinheiro em centavos inteiros — `P1`

**Regra.** Toda soma, rateio e comparação de valor passa por `lib/money.js`, em centavos inteiros.
Float só na fronteira: banco, Mercado Pago e tela. Corolário: **o total do pedido é derivado da
soma efetivamente cobrada**, nunca calculado em paralelo.

```
subtotal − desconto === total === soma(unit_price × quantity) da preference
```

O rateio é por unidade, pelo método de maior resto (`allocateDiscountCents`), e
`handlers/__tests__/checkout-money.test.js` trava o invariante sem folga. A tolerância de 1 centavo
de `lib/payment-integrity.js` continua de propósito: zerá-la trocaria um risco irrelevante
(entregar por 1 centavo a menos) por um caro (recusar quem pagou certo).

> **Correção da regra.** A redação original mandava migrar também as colunas do banco. Elas já são
> `numeric(12,2)`, decimal exato no Postgres; o drift é todo do lado JavaScript. Nenhuma migration
> foi escrita.

**O que motivou.** `create-payment` calculava o total de um lado e rateava o desconto por um fator
fracionário do outro; os dois batiam por aproximação.

### E4 · Política de cache declarada por classe de endpoint — `P2`

**Regra.** Endpoint novo escolhe uma classe de `CACHE_POLICIES` (`lib/http.js`, via
`setCachePolicy`):

| Classe                                   | `Cache-Control`                                                  |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `catalog` — catálogo público             | `public, max-age=300, s-maxage=300, stale-while-revalidate=3600` |
| `adminReport` — painel (dado de cliente) | `private, no-store, max-age=0`                                   |
| `sensitive` — entrega de arquivo, token  | `no-store, max-age=0`                                            |

**O que motivou.** As políticas existiam e eram coerentes onde aplicadas, mas não estavam escritas
e vários endpoints não mandavam `Cache-Control` nenhum. É o cache de CDN que substitui o `Map` em
memória (E2).

---

## F · Log e documentação

### F1 · Um formato de log: JSON estruturado com nível e contexto — `P1`

**Regra.** `createLogger` de `lib/logger.js` emitindo `{ level, event, ...contexto }`; nenhum
`console` solto no backend fora dele. Evento de segurança vai por `lib/security-logger.js`.

**O que motivou.** 79 chamadas de `console.*` no backend, em dois formatos — e só um deles era
filtrável nos logs da Vercel.

### F2 · Um documento por assunto — `P1`

**Regra.** Cada tema tem exatamente um arquivo canônico; o que sobrar vira link para ele, ou é
apagado. A documentação viva é plana:

- `README.md` (raiz) — porta de entrada;
- `CONTRIBUTING.md` (raiz) — estas regras;
- `docs/01-VISAO-GERAL.md` a `docs/10-ROADMAP.md` — um assunto por arquivo.

Documento novo só entra se não couber em nenhum desses. Doc descreve o estado atual: histórico,
datas de rodada e retratos de review ficam no `git log`, não em arquivo.

**O que motivou.** Quatro pares de documentos sobrepostos (arquitetura, setup, fluxos, segurança),
versão curta e longa, divergindo sem ninguém notar. Documento de setup desatualizado custa uma
tarde de quem chega.

### F3 · Decisão que atravessa arquivos vira ADR; o resto fica no código — `P2`

**Regra.** Decisão estrutural vira um ADR na seção de ADRs de
[docs/02-ARQUITETURA.md](./docs/02-ARQUITETURA.md), numerado em sequência ("ADR 0001", "ADR
0002"…), com contexto, decisão e consequências. O código cita o ADR pelo número. Decisão local
fica no comentário junto do código.

**O que motivou.** As decisões estruturais (CommonJS no backend, handlers iguais em dev e produção,
reconciliação de pagamento num módulo só) estavam em comentários longos de `eslint.config.js`,
`lib/payment-integrity.js` e `server.js` — conteúdo certo, lugar errado, porque quem chega não
sabe abrir esses arquivos primeiro.

---

## Reproduzindo

```bash
npm run check          # env + format + lint + testes + cobertura + build, na ordem do CI
npm run test:coverage  # cobertura contra o piso de vite.config.js
npx eslint .           # 0 erros; avisos no máximo o teto de package.json
```
