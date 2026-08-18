# Correções de padronização — Ateliê da Escola

> Documento **companheiro operacional** do [CONTRIBUTING.md](../CONTRIBUTING.md).
> O CONTRIBUTING diz **qual é** o padrão e por que ele existe. Este aqui lista **o que ainda
> não obedece**, com arquivo e linha, e o que precisa ser verdade para o item ser dado por
> fechado.

Levantamento em **18/08/2026** sobre o commit `4b42fe8`, medido no código — não estimado.

O diagnóstico de 13/08/2026 foi _"o problema não é falta de padrão — é padrão não executado"_.
A rodada daquele dia construiu a infraestrutura: `lib/http.js`, `validation/`, `lib/logger.js`,
`src/constants/routes.js`, husky, catraca de lint. **Este documento é sobre a segunda metade do
mesmo problema: helper construído e não adotado, e gate declarado que não roda.**

---

## Como usar

- Cada correção tem um identificador (`P0.1`, `P1.3`…) e aponta a **regra do CONTRIBUTING** que
  ela serve. Cite o identificador no commit e no PR.
- **Não adicione regra nova aqui.** Regra vive no CONTRIBUTING; aqui só mora dívida contra regra
  que já existe. Se a medição mostrar que a regra está errada, o caminho é editar o CONTRIBUTING
  — não abrir exceção no código.
- Cada item traz **"Como provar que fechou"**. Item sem prova executável não fecha: foi
  exatamente assim que os gates da rodada anterior viraram documentação de algo que não
  acontecia.
- Ao fechar um item, marque-o na [tabela de acompanhamento](#acompanhamento) no mesmo commit.

---

## Índice

| Bloco                                      | Assunto                         | Itens         |
| ------------------------------------------ | ------------------------------- | ------------- |
| [P0](#p0--o-que-está-quebrado-ou-mentindo) | O que está quebrado ou mentindo | `P0.1`–`P0.4` |
| [P1](#p1--fechar-o-contrato-http-a1a2)     | Fechar o contrato HTTP (A1/A2)  | `P1.1`–`P1.5` |
| [P2](#p2--adotar-o-que-já-foi-construído)  | Adotar o que já foi construído  | `P2.1`–`P2.3` |
| [P3](#p3--folgas-de-segurança-e-runtime)   | Folgas de segurança e runtime   | `P3.1`–`P3.4` |
| [P4](#p4--cobertura-de-teste)              | Cobertura de teste              | `P4.1`–`P4.2` |
| [P5](#p5--frontend)                        | Frontend                        | `P5.1`–`P5.4` |
| [P6](#p6--documentação)                    | Documentação                    | `P6.1`–`P6.3` |

---

## Resumo da medição

| Medida                                                            | Alvo    |                  Hoje |
| ----------------------------------------------------------------- | ------- | --------------------: |
| Sites que devolvem `error` como string (regra A1)                 | 0       | **58** em 12 arquivos |
| Códigos de erro fora de SCREAMING_SNAKE (regra A2)                | 0       |                 **3** |
| Códigos no espelho do front que o backend nunca emite             | 0       |                 **3** |
| Handlers usando `guardMethod` (existe desde 13/08)                | 44      |                 **0** |
| Endpoints usando `validation/` + zod (regra B1)                   | —       |           **3** de 44 |
| Endpoints públicos sem rate limit (regra E1)                      | 0       |                 **5** |
| Handlers em `api/` não montados em `routes/`                      | 0       |                 **2** |
| Módulos de `lib/` sem suíte (regra D3)                            | 0       |          **10** de 24 |
| Testes falhando em execução paralela                              | 0       |                 **3** |
| Gate de cobertura executado no CI                                 | sim     |               **não** |
| Arquivos de `src/{components,services,hooks,providers}` com teste | —       |           **0** de 63 |
| Componentes sem `propTypes` (regra C6)                            | 0       |                **14** |
| Formatação inline em JSX (regra C3)                               | 0       |                **15** |
| Arquivos `.md` que reprovam `prettier --check` (regra D1)         | 0       |          **56** de 62 |
| Handlers sem CORS (regra A3)                                      | decidir |          **26** de 44 |

---

## P0 · O que está quebrado ou mentindo

Este bloco vem primeiro por um motivo estrutural: enquanto os gates não valerem nada, toda
correção dos blocos seguintes entra sem rede de segurança e pode ser desfeita sem ninguém ver.

### P0.1 · O re-login do admin não dispara — `regra A2` · **bug em produção**

`lib/admin-session.js` é o portão dos 18 endpoints administrativos e é o único lugar do
repositório que nunca migrou para `fail()`:

```js
// lib/admin-session.js:202
res.status(401).json({ success: false, error: 'Sessão admin inválida ou expirada.' });
```

Sem `code`. O cliente então cai no fallback por texto de `src/components/admin/utils/format.js`,
que procura `'sessao admin'` **sem acento** dentro de uma mensagem que tem `'Sessão'`:

```js
'Sessão admin inválida ou expirada.'.toLowerCase().includes('sessao admin'); // → false
```

Consequência: quando a sessão do admin expira, `isSessionError()` devolve `false`,
`onAuthExpired()` em `src/pages/AdminPage.jsx:165` **nunca dispara**, e a dona da loja vê um erro
genérico em vez de voltar para o login.

`ADMIN_SESSION_INVALID` existe no catálogo de `lib/http.js`, existe no espelho de
`src/constants/error-codes.js`, e `src/constants/__tests__/error-codes.test.js` garante que os
dois estão em sincronia — **mas nenhum handler emite o código**. O `if` que a regra A2 foi
escrita para criar está morto desde que foi escrito.

É a demonstração exata do que a regra A2 previa: comparar texto em português quebra em silêncio,
e aqui quebrou por um acento.

**Correção.** Trocar as duas respostas de `ensureAdminSession` por `fail()`:

```js
// lib/admin-session.js:202
return fail(res, {
  status: 401,
  code: ERROR_CODES.ADMIN_SESSION_INVALID,
  message: 'Sessão admin inválida ou expirada.',
});

// lib/admin-session.js:210
return fail(res, {
  status: 403,
  code: ERROR_CODES.FORBIDDEN,
  message: 'Origem não permitida (possível CSRF).',
});
```

Fazer o mesmo em `lib/customer-session.js` para `CUSTOMER_SESSION_INVALID`, que está no espelho
do front pela mesma razão e também nunca é emitido.

**Como provar que fechou.** Um teste em `lib/__tests__/admin-session.test.js` que chame
`ensureAdminSession` sem cookie e afirme `body.error.code === 'ADMIN_SESSION_INVALID'`; e um em
`src/pages/__tests__/` que afirme que `onAuthExpired` é chamado diante desse envelope. O segundo é
o que importa — é o elo que quebrou.

> **Ao fechar, o fallback por texto sai.** As três últimas linhas de `isSessionError` existem só
> para resposta antiga em cache de navegador. Com o `code` emitido e testado, elas viram ruído — e
> ruído que casa por acidente com qualquer mensagem contendo aquele trecho.

### P0.2 · O gate de cobertura está configurado e nunca executa — `regra D2`

`vite.config.js` tem `thresholds` (statements 25, branches 19, functions 21, lines 25), e o
CONTRIBUTING anuncia _"27,3% statements (piso no CI)"_. Mas:

```jsonc
// package.json
"test":  "vitest run",                      // ← sem --coverage
"check": "... && npm run test && ...",      // ← chama o de cima
```

```yaml
# .github/workflows/test.yml
- name: Testes
  run: npm test # ← idem
```

O threshold **nunca rodou em CI**. Apagar toda a suíte de `lib/` não derrubaria o build.

**Correção.** Um passo dedicado no workflow, depois de `npm test`:

```yaml
- name: Cobertura (piso da regra D2)
  run: npm run test:coverage
```

E incluir `test:coverage` no `npm run check`, para que o gate local e o do CI continuem sendo a
mesma coisa — que é a propriedade que o `check` existe para ter.

**Como provar que fechou.** Baixar um threshold de propósito num commit descartável e ver o CI
ficar vermelho. Medido hoje: `27,65 / 21,34 / 23,55 / 28,12` — há folga real sobre o piso, o gate
liga sem exigir nenhum teste novo.

### P0.3 · Três testes falham em execução paralela — `regra D2`

Estado atual de `npm test`:

```
Test Files  3 failed | 27 passed (30)
     Tests  3 failed | 384 passed (387)
```

Falham `api/__tests__/api-endpoints.test.js`, `api/__tests__/checkout-money.test.js` e
`api/__tests__/webhook-signature.test.js`, sempre no **primeiro teste do arquivo**, sempre por
`Test timed out in 5000ms`. Rodando cada arquivo isolado, todos passam. Com
`--testTimeout=30000`, os 387 passam.

Não é acaso — são duas causas somadas, e as duas são de padronização:

1. **Ambiente único para dois runtimes.** `vite.config.js` declara `environment: 'jsdom'` para os
   **30** arquivos, incluindo os de `api/` e `lib/`, que são Node puro e não tocam DOM. A execução
   completa gasta `environment 256s` só construindo jsdom.
2. **A suíte faz rede de verdade.** `lib/security-logger.js` chama o Supabase durante o teste; a
   saída mostra `{"event":"insert_falhou","reason":"fetch failed"}` em cada asserção. O tempo do
   teste passa a depender de quanto o DNS demora para falhar.

Um CI que fica vermelho por sorteio ensina o time a reapertar "re-run" sem ler — que é a forma
mais rápida de perder todos os gates de uma vez.

**Correção.** Separar por runtime com `test.projects` e cortar a rede na raiz:

```js
// vite.config.js
test: {
  projects: [
    { test: { name: 'node', environment: 'node',
              include: ['api/**/*.test.js', 'lib/**/*.test.js'] } },
    { test: { name: 'browser', environment: 'jsdom', globals: true,
              setupFiles: ['./src/test/setupTests.js'],
              include: ['src/**/*.test.{js,jsx}'] } },
  ],
}
```

E um setup do projeto `node` que faça `vi.stubGlobal('fetch', …)` por padrão — teste que precisar
de rede declara isso explicitamente. Aumentar o `testTimeout` mascara o sintoma e mantém a causa.

**Como provar que fechou.** `npm test` verde em três execuções seguidas, com `environment` abaixo
de 30s no relatório e sem nenhum `insert_falhou` na saída.

### P0.4 · Espelho de rotas mantido à mão, e já divergiu — `ADR 0002`

Em produção a Vercel deriva as rotas do sistema de arquivos de `api/`. Em desenvolvimento,
`routes/api-compat.routes.js` **lista os 44 handlers um por um**, à mão. Nada compara as duas
listas.

Já divergiu:

| Handler              | Vercel (prod) | Express (dev)   |
| -------------------- | ------------- | --------------- |
| `api/sitemap.xml.js` | servido       | **não montado** |
| `api/notfound.js`    | servido       | **não montado** |

Ou seja: o sitemap funciona em produção e não funciona em `npm run dev:api`. Não é hipotético — é
o modo de falha que essa duplicação produz sempre que alguém adiciona um endpoint e esquece do
segundo arquivo.

**Correção.** Um teste que leia `api/**/*.js` do disco e afirme que cada arquivo tem rota montada
no router (e vice-versa). É barato, e é o único jeito de a lista manual parar de divergir sem
depender de disciplina.

**Como provar que fechou.** Criar um `api/exemplo-temporario.js` vazio e ver o novo teste falhar.

---

## P1 · Fechar o contrato HTTP (A1/A2)

`lib/http.js` foi escrito para ser a porta única do envelope. Trinta e dois handlers passaram por
ela; **doze arquivos ficaram para trás**, e o CONTRIBUTING os registra como aplicados. São 58
sites.

### P1.1 · Auth do cliente inteira no formato antigo — `regra A1` · 14 sites

`lib/customer-auth-handlers.js` é o BFF de login, cadastro e Google OAuth do cliente. Nenhuma
chamada de `ok()` ou `fail()` — todas as 14 respostas de erro usam
`res.status(n).json({ success: false, error: 'texto' })`.

É por isso que os **seis** arquivos de `api/auth/customer/**` aparecem com zero adoção de
`lib/http.js` na medição: eles só delegam.

|              Linha | Condição                                    | Código a emitir                 |
| -----------------: | ------------------------------------------- | ------------------------------- |
|                141 | e-mail/senha ausentes                       | `VALIDATION_FAILED`             |
|                159 | erro do provedor                            | conforme `mapSupabaseAuthError` |
|                173 | falha ao autenticar                         | `INTERNAL_ERROR`                |
| 184, 187, 190, 195 | nome / e-mail / senha inválidos no cadastro | `VALIDATION_FAILED`             |
|                210 | erro do Supabase no cadastro                | conforme mapeamento             |
|                228 | falha ao criar conta                        | `INTERNAL_ERROR`                |
|                236 | auth provider indisponível                  | `SERVICE_UNAVAILABLE`           |
|           251, 282 | falha no fluxo Google                       | `INTERNAL_ERROR`                |
|           259, 268 | credenciais inválidas                       | `CREDENTIALS_INVALID`           |

`CREDENTIALS_INVALID`, `SECOND_FACTOR_REQUIRED` e `SERVICE_UNAVAILABLE` já existem no catálogo de
`lib/http.js` esperando por isso.

### P1.2 · Handlers admin de escrita — `regra A1` · 31 sites

Os handlers admin montam um objeto `{ status, body }` internamente e o despacham com
`res.status(result.status).json(result.body)`. O despacho é o que escapa de `fail()`.

| Arquivo                   | Sites | Linhas                              |
| ------------------------- | ----: | ----------------------------------- |
| `api/admin/users.js`      |     8 | 76, 85, 91, 111, 125, 135, 144, 150 |
| `api/admin/orders.js`     |     6 | 74, 83, 99, 111, 121, 130           |
| `api/admin/products.js`   |     6 | 196, 208, 218, 233, 241, 250        |
| `api/admin/coupons.js`    |     5 | 138, 148, 157, 175, 186             |
| `api/admin/categories.js` |     4 | 88, 98, 107, 123                    |
| `api/admin/settings.js`   |     1 | 408                                 |

**`api/admin/products.js` é o pior caso**: os seis sites devolvem `{ error: '...' }` **sem
`success: false`**. É literalmente o formato nº 2 da tabela de A1, aquele que o CONTRIBUTING dá
por eliminado ("9 handlers → 0").

> Os `{ error }` internos de `api/admin/settings.js:156,168,187` **não** são violação: são o tipo
> de retorno `{ value | error }` das funções de coerção, que nunca vira corpo HTTP. Só a linha 408
> escapa.

**Correção sugerida.** Em vez de reescrever 31 sites um a um, trocar o tipo interno de
`{ status, body }` para `{ status, code, message }` e ter um único ponto de despacho por handler
que chame `ok()` ou `fail()`. Menos churn, e fecha a porta para o próximo `body` inventado.

### P1.3 · Caminho do dinheiro e sessão — `regra A1` · 8 sites

| Arquivo                    | Sites | Observação                                            |
| -------------------------- | ----: | ----------------------------------------------------- |
| `api/me-delete-account.js` |     5 | 221, 240, 272, 291, 350                               |
| `lib/admin-session.js`     |     2 | ver `P0.1`                                            |
| `api/create-payment.js`    |     1 | linha 389 — **sem `success`**, no caminho do dinheiro |

`api/create-payment.js:389` merece atenção separada: é o `catch` do endpoint que cria o pagamento.
É o erro que o cliente vê quando o checkout falha, e é o único do arquivo que não passa por
`fail()` — os outros três passam.

### P1.4 · Rate limit do Express responde fora do envelope — `regra A1` · 6 sites

`routes/api-compat.routes.js` linhas 91, 115, 146, 155, 166 configuram o `message` do
`express-rate-limit` no formato antigo; a 166 sem `success`. Mesma coisa em
`routes/auth.routes.js:24`.

Consequência concreta: `RATE_LIMITED` está no espelho de `src/constants/error-codes.js`, o cliente
tem um `if` para ele — e **o backend nunca emite esse código**, nem aqui nem em
`lib/rate-limit.js` (que emite `rate_limited` minúsculo, ver `P1.5`).

### P1.5 · Três códigos fora de SCREAMING_SNAKE — `regra A2`

| Arquivo                 | Linha | Hoje                     | Deve ser                                                     |
| ----------------------- | ----: | ------------------------ | ------------------------------------------------------------ |
| `lib/rate-limit.js`     |   566 | `rate_limited`           | `RATE_LIMITED`                                               |
| `api/admin/settings.js` |   459 | `second_factor_required` | `SECOND_FACTOR_REQUIRED`                                     |
| `api/unsubscribe.js`    |   213 | `confirmation_required`  | _(sem equivalente — decidir o nome e registrar no catálogo)_ |

Os dois primeiros já têm a constante pronta em `lib/http.js`. Trocar é substituição direta.

### Fim do bloco P1: apagar o shim

O CONTRIBUTING elegeu um marco verificável para esta migração:

> _"Quando A1 estiver aplicada, esse shim sai — é a prova de que a migração terminou."_

O shim é o achatamento de `error` em `src/utils/api.js:29-32`. **Ele ainda está lá**, e continua
necessário porque 58 sites devolvem string. Fechados `P1.1`–`P1.5`, a última tarefa do bloco é
migrar os consumidores de `data.error` para `data.error.message` e remover o shim.

**Como provar que P1 fechou.** `grep -rn "error: '" api lib routes --include='*.js'` sem resultado
fora de comentário, e `src/utils/api.js` sem o ramo de achatamento.

---

## P2 · Adotar o que já foi construído

Três abstrações foram escritas, testadas e documentadas em 13/08/2026. Duas quase não têm usuário.
Abstração sem adoção é pior que abstração ausente: ela ocupa o nome do padrão sem exercer o
padrão, e o próximo desenvolvedor copia o handler vizinho — que não a usa.

### P2.1 · `guardMethod` tem zero adoções em 44 handlers — `regra A3`

`lib/http.js` expõe `guardMethod(req, res, ['GET'])`, documentado como _"o topo do handler em uma
linha, na ordem que a regra A3 fixa"_. Adoção medida: **0**.

O que existe no lugar, repetido 40 vezes:

```js
if (req.method === 'OPTIONS') {
  return preflight(res);
}
if (req.method !== 'GET') {
  return methodNotAllowed(res, ['GET', 'OPTIONS']);
}
```

Contra o que o helper oferece:

```js
if (guardMethod(req, res, ['GET'])) return;
```

40 handlers têm o bloco `OPTIONS` manual; 42 chamam `methodNotAllowed` manualmente. A substituição
é mecânica e reduz o topo de cada handler a uma linha — que é o que torna "esqueceram o rate
limit" visível, o objetivo declarado da regra A3.

**Como provar que fechou.** `grep -rn "req.method === 'OPTIONS'" api/` sem resultado.

### P2.2 · `validation/` cobre 3 de 44 endpoints — `regra B1`

Usam schema: `api/create-payment.js`, `api/validate-coupon.js`, `api/verify-payment.js`.

A regra B1 é declaradamente _"dali para frente"_, e essa decisão continua certa — migrar 41
endpoints de uma vez não é proporcional. Mas há um recorte que vale antes dos outros: **os
handlers admin de escrita** (`categories`, `coupons`, `orders`, `products`, `users`) são
exatamente os que mais improvisam coerção manual, e são os mesmos 31 sites do item `P1.2`. Migrar
envelope e validação no mesmo passe custa quase o mesmo que migrar só o envelope.

`validation/common.schemas.js` já tem os primitivos (`id`, `slug`, `money`) de que esses cinco
precisam.

### P2.3 · Dois mecanismos de rate limit, com comportamentos diferentes — `regra E1`

| Mecanismo                                | Onde                  | Vale em        |
| ---------------------------------------- | --------------------- | -------------- |
| `enforceRateLimit` (`lib/rate-limit.js`) | 18 handlers de `api/` | dev **e** prod |
| `express-rate-limit`                     | 11 rotas de `routes/` | **só dev**     |

Em produção a Vercel não executa `server.js`, então os 11 limitadores do Express não existem. Dev
e prod limitam de forma diferente, e o desenvolvedor testa contra um comportamento que o cliente
nunca encontra — inclusive nos endpoints de login, onde o limite é controle de segurança e não de
custo.

**Correção.** Escolher `enforceRateLimit` como o mecanismo (é o que roda nos dois ambientes) e
remover os limitadores do Express, ou reduzi-los a um único limitador de borda genérico que não
finja ser a política real. Documentar a escolha como ADR, porque atravessa arquivos (regra F3).

---

## P3 · Folgas de segurança e runtime

### P3.1 · Cinco endpoints públicos sem rate limit — `regra E1` · `P0` na escala do CONTRIBUTING

A regra E1 é _"rate limit em todo endpoint público, sem exceção"_, e o CONTRIBUTING registra
"5 → 0". A medição de hoje encontra cinco de novo — outros cinco:

| Endpoint                               | Guarda      | Risco de não ter limite                                                                           |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `api/send-confirmation-email.js`       | **nenhuma** | Dispara e-mail. Sem limite é vetor de spam pela sua infra e queima da cota de 3.000/mês do Resend |
| `api/auth/customer/register.js`        | nenhuma     | Criação de conta em massa                                                                         |
| `api/auth/customer/google/start.js`    | nenhuma     | Geração de state/PKCE sem teto                                                                    |
| `api/auth/customer/google/callback.js` | nenhuma     | Troca de código sem teto                                                                          |
| `api/confirm-subscription.js`          | token       | Enumeração de token de confirmação                                                                |

`api/send-confirmation-email.js` é o mais urgente dos cinco: é o único que **gasta dinheiro e
reputação de domínio** por requisição.

Notas de escopo, para não inflar o número: `api/webhook.js` não tem `enforceRateLimit` mas tem
verificação de assinatura HMAC; `api/customer-orders.js` e `api/auth/customer/session.js` estão
atrás de sessão. Os três merecem um teto de borda, mas não são a mesma urgência.

`RATE_LIMITS` em `lib/rate-limit.js` já tem os perfis; falta aplicar.

### P3.2 · Decidir CORS e escrever a decisão — `regra A3`

A regra A3 fixa a ordem começando por CORS. Medição: **26 de 44 handlers não tocam em CORS**. Os
18 que tocam são os admin, via `setAdminCorsHeaders` — que mora em `lib/admin-session.js`, um
módulo de sessão, e não em `lib/http.js`, onde vivem os outros helpers de resposta.

Isso não é um bug: em produção o front e a API são same-origin na Vercel, e em desenvolvimento o
`cors` do Express resolve. É uma **regra que descreve algo que o código não faz** — e regra que
ninguém segue e nada quebra é a que ensina que as outras 24 também são opcionais.

Duas saídas legítimas, e é preciso escolher uma:

- **Reescrever A3** para "CORS quando o endpoint é cross-origin", registrando que em produção é
  same-origin, e mover `setAdminCorsHeaders` para `lib/http.js`; ou
- **Criar `setPublicCorsHeaders`** em `lib/http.js` e aplicar nos 26.

A primeira parece a certa pela evidência, mas é decisão de quem opera o deploy. Qualquer que seja,
vira ADR (regra F3), porque atravessa 44 arquivos.

### P3.3 · Comentário do CI diverge do `package.json` — `regra D5`

`.github/workflows/test.yml` documenta `--max-warnings=21`; `package.json` traz `19`; a medição de
hoje confirma exatamente 19 avisos. O comentário ficou para trás quando a catraca desceu.

Corrigir o comentário e, no mesmo commit, anotar nele a regra de operação que já está no
CONTRIBUTING: **ao corrigir um aviso, baixe o teto no mesmo commit.**

### P3.4 · Markdown está fora do gate de formatação — `regra D1`

`npm run format:check` cobre `{src,api,lib,routes,middleware,services,utils,validation,scripts}/**/*.{js,jsx,css}`,
`*.config.js` e `server.js`. **Markdown não entra.** Mas o `lint-staged` do `package.json` cobre
`*.{css,json,md}` com `prettier --write`.

O resultado dessa assimetria é que **56 dos 62 arquivos `.md` do repositório reprovam
`prettier --check`** — incluindo o `CONTRIBUTING.md` e o `docs/README.md`. Ninguém percebe porque
o CI não olha, e o husky só normaliza o arquivo que alguém já estava editando.

O efeito prático é o pior possível para revisão: uma mudança de uma linha em qualquer `.md`
grande chega ao PR como centenas de linhas reformatadas pelo hook, e o revisor perde a mudança
real no meio da normalização. Foi exatamente o que aconteceu ao inserir o ponteiro para este
documento no `CONTRIBUTING.md`: 10 linhas de conteúdo, ~175 de reformatação.

**Correção.** Normalizar os 56 arquivos num commit isolado — que não muda uma palavra de
conteúdo e por isso entra no `.git-blame-ignore-revs`, mecanismo que este repositório já usa —
e então estender o `format`/`format:check` para `**/*.{md,json}`. A ordem importa: estender o
gate antes de normalizar deixa o CI vermelho por 56 arquivos que ninguém tocou.

**Como provar que fechou.** `npx prettier --check "**/*.md" --ignore-path .gitignore` sem
resultado, e `npm run check` reprovando se um `.md` for salvo fora do padrão.

---

## P4 · Cobertura de teste

### P4.1 · Dez módulos de `lib/` sem suíte — `regra D3`

A regra D3 diz _"todo módulo de `lib/` tem suíte"_ e o CONTRIBUTING a marca como aplicada. São 24
módulos e 14 suítes (13 em `lib/__tests__/` mais `payment-integrity`, testado em `api/__tests__/`).

Sem teste direto, em ordem de risco:

| Módulo                             | Por que importa                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `security-logger.js`               | Registra evento de segurança **e** é a origem do `fetch` que instabiliza a suíte (`P0.3`) |
| `customer-account-provisioning.js` | Cria conta de cliente a partir do checkout — roda dentro do webhook                       |
| `email-sender.js`                  | Envio real; falha silenciosa aqui é pedido pago sem entrega                               |
| `email-templates.js`               | Conteúdo do e-mail transacional                                                           |
| `mercadopago-config.js`            | Verificação de assinatura do webhook mora aqui                                            |
| `sales-counts.js`                  | Alimenta "mais vendidos" na vitrine                                                       |
| `customer-segmentation.js`         | Base dos e-mails automáticos de reativação                                                |
| `admin-audit.js`                   | Trilha de auditoria de escrita admin                                                      |
| `attribution-sanitize.js`          | Sanitização de dado vindo do browser                                                      |
| `supabase.js`                      | Cliente compartilhado por todos os handlers                                               |

Os três primeiros são os que eu escreveria antes de qualquer outro: os dois primeiros rodam dentro
do caminho do dinheiro sem cobertura própria, e o terceiro fecha `P0.3` de quebra.

### P4.2 · Camadas inteiras do frontend sem nenhum teste — `regra D3`, e é o que trava `D5`

| Pasta            | Arquivos | Testes |
| ---------------- | -------: | -----: |
| `src/components` |       48 |  **0** |
| `src/services`   |        8 |  **0** |
| `src/hooks`      |        4 |  **0** |
| `src/providers`  |        3 |  **0** |
| `routes`         |        2 |  **0** |
| `middleware`     |        1 |  **0** |

Isto não é só dívida de cobertura: é **a razão pela qual `D5` está parado**. Os 19 avisos restantes
de lint são `setState` dentro de efeito em 13 componentes, e o CONTRIBUTING é explícito sobre por
que ninguém os corrigiu — _"refatorar renderização, com só 3 testes de componente no repositório
para segurar"_.

A ordem certa é a inversa da intuitiva: **escrever teste para os 13 componentes primeiro**, depois
queimar os avisos. `src/services/` é o alvo mais barato para começar (8 arquivos, sem JSX, e é a
fronteira que o item `P5.1` vai alargar).

---

## P5 · Frontend

### P5.1 · Três páginas falam com a API sem passar por `src/services/` — `regra C2`

| Página                              | O que faz                              |
| ----------------------------------- | -------------------------------------- |
| `src/pages/CheckoutPage.jsx:11`     | importa `apiRequest` direto            |
| `src/pages/DownloadsPage.jsx:9`     | importa `apiRequest` e `getApiBaseUrl` |
| `src/pages/SubscriptionPages.jsx:5` | importa `apiRequest` direto            |

Faltam `src/services/checkout.js`, `src/services/downloads.js` e `src/services/subscription.js`.
Não é organização pela organização: são justamente as três telas do caminho do dinheiro e da
entrega, e são as que hoje não têm onde um teste de serviço as pegue sem montar a página inteira
(ver `P4.2`).

`src/components/ErrorBoundary.jsx:26` usa `fetch` cru, mas para telemetria de erro — não passa pelo
cliente HTTP de propósito. Fica de fora do item; vale um comentário no código dizendo isso, para
não virar precedente.

### P5.2 · Quinze formatações inline em JSX — `regra C3`

A regra C3 foi aplicada em 13/08 **só para dinheiro**. Número e percentual continuam soltos, em 5
abas do admin:

`AnalysisTab.jsx:455` · `ComparisonTab.jsx:9,17` · `DashboardTab.jsx:683` ·
`FunnelTab.jsx:28,90,179,187,195` · `SegmentsTab.jsx:91,99,107,115,142,152`

São dois padrões repetidos: `toFixed(1)` para percentual e `toLocaleString('pt-BR')` para
contagem. Duas funções em `src/utils/` (`formatPercent`, `formatCount`) absorvem os 15 — e uma
delas, `AnalysisTab.jsx:455`, já reimplementa o `.replace('.', ',')` que `src/utils/currency.js`
faz.

### P5.3 · Duas casas de utilitário, e uma com nome errado — `regra C4`

`src/utils/` e `src/components/admin/utils/` coexistem. Pior: o `format.js` de lá exporta **uma
única função, `isSessionError`**, que não formata nada — classifica erro.

Duas correções, ambas pequenas:

- mover `isSessionError` para onde ele pertence (junto de `src/constants/error-codes.js`, que é de
  onde vem o dado em que ele ramifica) e apagar o `format.js`;
- decidir se `derive.js` e `tabs.js` ficam onde estão. Argumento para ficarem: são específicos do
  painel e não têm consumidor fora dele. Se ficarem, **escrever isso no CONTRIBUTING como exceção
  nomeada de C4** — exceção documentada é padrão; exceção tácita é divergência.

### P5.4 · Quatorze componentes sem `propTypes` — `regra C6`

`CouponsTab.jsx` · `SegmentsTab.jsx` · `ConsentBanner.jsx` · `AdminLoginPage.jsx` ·
`AdminPage.jsx` · `CheckoutPage.jsx` · `CustomerAuthPage.jsx` · `DownloadsPage.jsx` ·
`HomePage.jsx` · `NotFoundPage.jsx` · `ProductDetailsPage.jsx` · `ProductsPage.jsx` ·
`ResetPasswordPage.jsx` · `SubscriptionPages.jsx`

Onze não recebem prop nenhuma — para esses, `propTypes` seria cerimônia vazia. **Três recebem**:
`HomePage`, `ProductsPage` e `SubscriptionPages`. Só esses três são dívida real.

Vale ajustar a redação de C6 no CONTRIBUTING para "componente **que recebe props** declara
`propTypes`". Do jeito que está, a regra é reprovada por 11 arquivos em que obedecê-la não melhora
nada — e regra assim treina o time a ignorar a lista de violações.

---

## P6 · Documentação

### P6.1 · Relatório de review afirma o contrário do que o CI faz — `regra F2`

`docs/REVIEW-AREA-9-TESTES.md` abre com:

> _"**nenhum workflow de CI executa `npm test`** — os únicos gates de PR são Lighthouse
> (a11y/SEO/performance) e um cron de email"_

Falso desde o commit `4892de9`. O documento é um retrato de 12/08 e continua sendo lido como estado
atual — ele está no índice de `docs/README.md` sem nenhuma marca de data.

Mesma condição em `docs/REVIEW-RESULTS.md` e nos dois de `docs/reviews/`.

**Correção.** Um cabeçalho em cada relatório pré-padronização, no formato que os quatro documentos
"em retirada" já usam — o mecanismo existe e funciona:

```markdown
> ## 📅 Retrato histórico — 12/08/2026
>
> Levantamento anterior à rodada de padronização de 13/08. **Vários achados foram corrigidos.**
> Estado atual: [CONTRIBUTING.md](../CONTRIBUTING.md) e
> [PADRONIZACAO-CORRECOES.md](./PADRONIZACAO-CORRECOES.md).
```

### P6.2 · Duas casas e duas convenções para relatório de review — `regra F2`

```
docs/REVIEW-AREA-9-TESTES.md          ← raiz de docs/, "AREA-9"
docs/REVIEW-RESULTS.md                ← raiz de docs/
docs/REVIEW-PROMPTS.md                ← raiz de docs/
docs/reviews/AREA-08-...              ← subpasta,  "AREA-08"
docs/reviews/REVIEW-GERAL-2026-...    ← subpasta
```

Duas localizações e dois jeitos de numerar área (`AREA-9` × `AREA-08`). Mover tudo para
`docs/reviews/` com zero à esquerda, e deixar em `docs/` apenas o `REVIEW-PROMPTS.md`, que é
ferramenta e não relatório.

### P6.3 · Sincronizar o CONTRIBUTING com a medição de hoje — `regra F2`

A seção "Estado da padronização" afirma que as 25 regras estão aplicadas. Este documento mostra que
`A1`, `A2`, `A3`, `C2`, `C3`, `C4`, `C6`, `D2`, `D3` e `E1` têm dívida aberta.

Não é preciso reescrever as regras — elas continuam certas. É preciso trocar _"as 25 regras estão
aplicadas"_ por um ponteiro honesto para cá, e atualizar a tabela de medidas com os números de
18/08. **A tabela dizer "0" onde a medição diz "58" é o mesmo problema do item `P0.2`**:
documentação que descreve um estado que ninguém verifica.

---

## Ordem de execução sugerida

**Primeira leva — os gates voltam a valer** · `P0.1` `P0.2` `P0.3` `P0.4`

Um bug em produção e três gates que não existem. Nada abaixo tem rede de segurança enquanto esta
leva não fechar, e `P0.1` é o item de maior retorno do documento inteiro: uma linha de código, e
conserta o re-login da única pessoa que usa o painel.

**Segunda leva — fechar o contrato** · `P1.1`–`P1.5`, `P2.1`, e então apagar o shim

Mecânica, com prova de término inequívoca (`grep` vazio e shim removido). Fazer `P2.1` junto,
porque toca os mesmos arquivos. Considerar `P2.2` no mesmo passe para os cinco handlers admin.

**Terceira leva — as folgas** · `P3.1` primeiro (`send-confirmation-email` antes dos outros
quatro), depois `P3.2` `P3.3` `P3.4` `P2.3`

`P3.2` e `P2.3` são decisões, não digitação: rendem um ADR cada.

**Quarta leva — sustentação** · `P4.1` `P4.2` `P5.1`–`P5.4` `P6.1`–`P6.3`

`P4.2` desbloqueia a queima dos 19 avisos de lint. `P6.3` fecha o ciclo: o CONTRIBUTING volta a
descrever o repositório que existe.

---

## Acompanhamento

| Item                                    | Regra    | Prioridade | Estado     |
| --------------------------------------- | -------- | ---------- | ---------- |
| `P0.1` re-login do admin                | A2       | **bug**    | ✅ fechado |
| `P0.2` gate de cobertura no CI          | D2       | P0         | ✅ fechado |
| `P0.3` suíte instável                   | D2       | P0         | ✅ fechado |
| `P0.4` espelho de rotas                 | ADR 0002 | P0         | ✅ fechado |
| `P1.1` auth do cliente                  | A1       | P1         | ✅ fechado |
| `P1.2` handlers admin de escrita        | A1       | P1         | ✅ fechado |
| `P1.3` dinheiro e sessão                | A1       | P1         | ✅ fechado |
| `P1.4` rate limit do Express            | A1       | P1         | ✅ fechado |
| `P1.5` códigos minúsculos               | A2       | P1         | ✅ fechado |
| `P1.x` apagar o shim de `parseJson`     | A1       | P1         | ✅ fechado |
| `P2.1` adotar `guardMethod`             | A3       | P2         | ✅ fechado |
| `P2.2` `validation/` nos handlers admin | B1       | P2         | ✅ fechado |
| `P2.3` unificar rate limit              | E1       | P2         | ✅ fechado |
| `P3.1` rate limit nos 5 públicos        | E1       | **P0**     | ✅ fechado |
| `P3.2` decidir CORS                     | A3       | P2         | ✅ fechado |
| `P3.3` comentário do CI                 | D5       | P2         | ✅ fechado |
| `P3.4` markdown fora do gate            | D1       | P2         | ✅ fechado |
| `P4.1` suítes de `lib/`                 | D3       | P1         | ✅ fechado |
| `P4.2` teste de componente e serviço    | D3 / D5  | P1         | ⬜ aberto  |
| `P5.1` serviços que faltam              | C2       | P1         | ⬜ aberto  |
| `P5.2` formatação inline                | C3       | P1         | ⬜ aberto  |
| `P5.3` casas de utilitário              | C4       | P2         | ⬜ aberto  |
| `P5.4` `propTypes`                      | C6       | P2         | ⬜ aberto  |
| `P6.1` marcar reviews históricos        | F2       | P1         | ⬜ aberto  |
| `P6.2` unificar `docs/reviews/`         | F2       | P2         | ⬜ aberto  |
| `P6.3` sincronizar CONTRIBUTING         | F2       | P1         | ⬜ aberto  |

---

## Metodologia

Toda medição deste documento veio de `grep`, `find` e execução real dos scripts do `package.json`
no commit `4b42fe8`, em 18/08/2026. Onde o número diverge do CONTRIBUTING, o número daqui é o do
código.

Os comandos de contagem estão embutidos nos itens ("Como provar que fechou") de propósito: um
levantamento que não pode ser repetido pela próxima pessoa vira crença em poucas semanas — que é
exatamente o que aconteceu com a tabela de "Estado da padronização" entre 13/08 e hoje.
