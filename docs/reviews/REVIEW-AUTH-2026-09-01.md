# Fluxo de login — Relatório de Avaliação

> **Retrato datado — 01/09/2026.** Amarrado ao commit `660fe74` (estado avaliado).
> Este documento **não se atualiza**: quando o achado é corrigido, o commit é a prova.
> Estado atual: [08-SEGURANCA.md](../ProjectDocs/08-SEGURANCA.md) e
> [05-FLUXOS.md](../ProjectDocs/05-FLUXOS.md).

## Sumário executivo

Avaliação do fluxo de login de ponta a ponta: telas, provider de estado, serviços do front,
handlers, sessão, rate limit, 2FA, papéis e banco.

**O desenho é bom e, em vários pontos, melhor do que o típico neste porte** — sessão em cookie
HttpOnly com HMAC e comparação timing-safe, token do Supabase nunca exposto ao browser,
anti-enumeração consistente, zero SQL cru, RLS com trigger anti-escalação, expiração detectada por
código de erro e não por texto. Nada disso precisou mudar.

**O achado que importa não estava em nenhum handler: estava na montagem das rotas.** Os cinco
endpoints de autenticação de cliente rodavam em produção **sem rate limit** e o logout **sem a
checagem anti-CSRF** — com o código dessas guardas existindo, completo, e coberto por testes
verdes. A falha nasceu da composição de dois commits corretos isoladamente, e sobreviveu porque os
dois testes que deveriam pegá-la mediam a coisa errada: um lia o **texto do arquivo no disco**, o
outro comparava **strings de caminho**. Nenhum perguntava qual módulo o router de fato montou.

É a moral do relatório: **guarda escrita não é guarda executada**, e um teste que confirma a
escrita dá uma segurança que não existe.

---

## Achados

### CRÍTICO

| Campo          | Detalhe                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**         | AUTH-01                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Severidade** | CRÍTICO                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Confiança**  | Confirmada (reproduzida)                                                                                                                                                                                                                                                                                                                                                                                                |
| **Local**      | `routes/auth.routes.js:2-9,24-29`; `lib/express-app.js:115`; `handlers/auth/customer/**`                                                                                                                                                                                                                                                                                                                                |
| **Problema**   | `/api/auth/customer/{login,register,logout,google/start,google/callback}` rodavam sem `enforceRateLimit`, e o logout sem `isSameOriginRequest`. O router de produção importava a lógica crua de `lib/customer-auth-handlers` em vez dos módulos de `handlers/auth/customer/**`, que são os que carregam as guardas. Os seis arquivos de wrapper eram código morto — nenhum `require` no repositório apontava para eles. |
| **Impacto**    | Brute force e credential stuffing sem teto contra o Supabase Auth; criação de contas em massa; logout forçado por CSRF a partir de qualquer site.                                                                                                                                                                                                                                                                       |
| **Correção**   | `244226c` — o router passa a montar os wrappers, com `router.all` para que o `guardMethod` responda 405 no envelope em vez de cair no 404 do Express.                                                                                                                                                                                                                                                                   |

**Como abriu.** Dois commits, cada um correto quando foi escrito:

1. `f5b43da` (18/08) removeu o `express-rate-limit` de `routes/auth.routes.js`. Correto: naquele
   momento o arquivo **só rodava em dev**, e a guarda de produção vivia em
   `api/auth/customer/login.js`, publicado como função Vercel isolada. O próprio commit diz
   "nenhuma proteção real saiu".
2. `660fe74` (26/08) consolidou os 44 handlers em **uma** função serverless. A partir daí
   `api/index.js` → `lib/express-app.js` → `routes/auth.routes.js` virou o **caminho de produção** —
   e os wrappers, órfãos.

Nenhuma revisão de um dos dois commits isoladamente encontraria isto. É um defeito de composição:
o commit que removeu a guarda e o commit que promoveu o arquivo a produção estão a oito dias e
vários assuntos de distância um do outro.

**Por que os testes não pegaram** — e é a parte que valia mais corrigir do que o bug:

- `handlers/__tests__/rate-limit-coverage.test.js` fazia `readdirSync` em `handlers/` e checava
  `source.includes('enforceRateLimit')` no **texto do arquivo**. O texto estava lá — no arquivo
  morto. Mede se a guarda foi _escrita_, não se ela _roda_.
- `routes/__tests__/api-route-parity.test.js` comparava **strings de caminho**:
  `/auth/customer/login` existia no disco e no router, logo passava. Nunca perguntou qual **módulo**
  estava montado naquele caminho.

Ambos foram reescritos para partir da **identidade do módulo montado** (`lib/route-mount.js` guarda
a associação num `WeakMap`). Verificação feita: revertendo `routes/auth.routes.js` para a versão
defeituosa, o teste falha nomeando as seis rotas. Antes, passava.

---

### ALTO

| Campo          | Detalhe                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**         | AUTH-02                                                                                                                                                                                                                                                             |
| **Severidade** | ALTO                                                                                                                                                                                                                                                                |
| **Local**      | `handlers/admin/settings.js:85-86`; `handlers/admin/login.js:314-321`                                                                                                                                                                                               |
| **Problema**   | `totpSecret` e `fallbackPin` gravados **em texto puro** no JSON de `settings.adminConfig`. Um dump, um backup ou um `SELECT` com a service role levava o segundo fator inteiro — e com o `totpSecret` em mãos qualquer pessoa gera códigos válidos indefinidamente. |
| **Correção**   | `5949cc7` — `lib/admin-2fa.js`. `totpSecret` **cifrado** (AES-256-GCM, chave em `ADMIN_2FA_ENC_KEY`); `fallbackPin` **hasheado** (scrypt + sal).                                                                                                                    |

As duas correções são deliberadamente **diferentes**, e confundi-las quebraria o login:

- `totpSecret` **não pode ser hasheado** — o servidor precisa do segredo original para recalcular o
  HMAC-SHA1 de cada janela. Hash é irreversível por definição. O que cabe é cifra em repouso.
- `fallbackPin` **pode e deve** ser hasheado — só é comparado contra o que a pessoa digita, nunca
  precisa voltar ao claro. Hash é mais forte que cifra aqui: nem com a chave ele é recuperável.

Leitura aceita o formato antigo; qualquer salvamento no painel migra os herdados. Sem isso o deploy
trancaria a dona para fora do próprio painel.

| Campo          | Detalhe                                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**         | AUTH-03                                                                                                                                                                                                                                   |
| **Severidade** | ALTO                                                                                                                                                                                                                                      |
| **Local**      | `handlers/admin/login.js` (586 linhas)                                                                                                                                                                                                    |
| **Problema**   | O arquivo mais complexo de auth do repositório, **sem suíte própria**. A cobertura era indireta e não tocava o desenho que só existe ali: máquina de duas etapas, desafio assinado, consumo único, resposta ambígua para conta não-admin. |
| **Correção**   | `7a78c8e` — 41 casos.                                                                                                                                                                                                                     |

O agravante é o modo de falha: um anti-replay quebrado **continua deixando o login legítimo passar**.
Nada quebra visivelmente; a proteção simplesmente deixa de existir.

---

### MÉDIO

| ID      | Local                                                  | Problema                                                                                                                                                                                                                                                                                                                                    | Correção  |
| ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| AUTH-04 | `lib/rate-limit.js:703-742`                            | Fail-open universal. O argumento de que "a mesma queda derrubaria o endpoint adiante" **não vale para credencial**: `customerLogin`/`customerRegister` falam com o **GoTrue**, serviço distinto do PostgREST que serve o contador, e o anti-replay do TOTP é ele próprio uma chamada de `rate_limit_hit`. O alvo fica de pé sem o contador. | `5949cc7` |
| AUTH-05 | `lib/express-app.js:43-54`; `scripts/check-env.js:187` | Sem `CORS_ORIGINS`, aceitava **qualquer** `localhost` com `credentials: true`, inclusive em produção — e a variável era `advisory`, que nunca bloqueia deploy. Some do painel da Vercel e nada avisa.                                                                                                                                       | `244226c` |
| AUTH-06 | `lib/express-app.js` (default de dev)                  | Origem recusada gerava `callback(new Error(...))` → **500**, enquanto em produção (`origin: [array]`) o mesmo pedido seguia e o handler respondia **403**. Divergência dev/prod de status, no caminho de segurança.                                                                                                                         | `244226c` |
| AUTH-07 | `src/providers/AuthProvider.jsx:31-33`                 | Corrida entre os dois efeitos do provider: na volta do OAuth, `fetchCustomerSession()` resolve `null` antes de o callback trocar o token pelo cookie, e o bootstrap **apagava** a sessão recém-criada. Em produção o POST do callback costuma chegar depois, o que escondia o defeito — a ordem nunca foi garantida.                        | `cda6218` |

`CORS_ORIGINS` estava preenchida no `.env.production` local, então AUTH-05 provavelmente não estava
exposto no deploy corrente. O defeito é a **ausência de trava**, não o valor do dia.

---

### BAIXO — documentação que afirmava o que o código não fazia

| Local                                  | Afirmava                                                                   | Real                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `08-SEGURANCA.md` §2.3                 | challenge token com TTL de **5 min**                                       | **120s** (`FACTOR_CHALLENGE_TTL_SECONDS`)                                                                                          |
| `08-SEGURANCA.md` §2.2                 | `/auth/* 30 req/15min`, `/verify-payment 60/min`, `skipSuccessfulRequests` | Nada disso existe — é o desenho de `express-rate-limit`, removido em `f5b43da`. `/verify-payment` é 600/10min, escopado por pedido |
| `08-SEGURANCA.md` §2.2 (nota)          | "rate limit por endpoint em produção depende de KV, pendência API-03"      | Resolvido desde `80b5b3b`: contador atômico no Postgres                                                                            |
| `handlers/auth/customer/login.js:5-11` | "o limiter vive em routes/auth.routes.js, que só roda em dev"              | Invertido pelo `660fe74` — era o oposto                                                                                            |
| `.env.local.template`                  | —                                                                          | Divergente do `.env.example`: faltavam os dois segredos de sessão, SMTP e CORS                                                     |

Todas corrigidas. A tabela de rate limits foi reconstruída **a partir do código**, não do documento
anterior.

---

## O que a avaliação encontrou bem-feito

Registrado porque delimita o que **não** foi tocado, e porque é o que deve ser preservado:

- **Sessão** — cookie HttpOnly + SameSite=Strict + HMAC-SHA256 + `Secure` fora de dev, com
  `crypto.timingSafeEqual`. Dois sistemas separados (`customer_session`, `admin_session`) com
  segredos distintos.
- **O token do Supabase nunca chega ao browser.** O front ainda apaga a sessão local do SDK após o
  OAuth (`src/services/customer-auth.js:138`), reduzindo a superfície de exfiltração por XSS.
- **Anti-enumeração consistente** — mensagem genérica no login, no cadastro, e no gate de papel: uma
  conta não-admin com a senha correta recebe resposta **idêntica** à de senha errada, com o motivo
  real só no log. Isso agora tem teste que compara as duas respostas campo a campo.
- **Anti-open-redirect nos dois lados** (`src/constants/routes.js:84-93` e
  `lib/customer-auth-handlers.js:26-33`), com allowlist rígida no reset de senha.
- **Zero SQL cru** — PostgREST com `URLSearchParams` e RPC com parâmetros nomeados. Superfície de
  SQL injection praticamente nula.
- **Expiração por código de erro, nunca por texto** (`src/constants/error-codes.js:79-82`), com
  teste que trava a cadeia inteira do envelope até o re-login.
- **RLS + trigger `profiles_guard_privileged_cols`** impedindo escalação de privilégio no banco, não
  só na aplicação.
- **`lib/env-secret.js` fail-closed** — o fallback de segredo só existe em `development`/`test`;
  qualquer outro valor de `APP_ENV` lança.
- **2FA do admin** com desafio de TTL curto, binding de IP e e-mail, `nonce`, e consumo único tanto
  do desafio quanto do código TOTP — e o desafio é consumido **depois** do código, para que um
  dígito errado não queime a etapa.

---

## Pendências não fechadas nesta rodada

| Item                                                                                                                                                                                                                                                     | Por que ficou de fora                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sessão sem revogação** — logout apaga o cookie, mas o token HMAC continua válido por até 8h se tiver sido capturado. Não há `jti` nem lista de revogação.                                                                                              | Corrigir exige tabela de revogação ou `tokenVersion` em `profiles` com leitura por requisição. É mudança de desenho com custo por request, e merece ADR próprio.            |
| **Segredos legados no histórico do git** — `1eab297` e `f0856aa` adicionaram e removeram `.env` com `MERCADOPAGO_ACCESS_TOKEN`, `WEBHOOK_SECRET` e `DOWNLOAD_TOKEN_SECRET` da stack Firebase antiga; e os PATs do Supabase de `08-SEGURANCA.md` §11.2.1. | Tarefa **operacional**, não de código: revogar primeiro, expurgar depois. Os segredos de sessão atuais não estão nesses commits.                                            |
| **Sem CAPTCHA e sem lockout de conta.**                                                                                                                                                                                                                  | Com os dois baldes do `customerLogin` (por conta e por conexão) religados, o ganho marginal é pequeno para o porte. Reavaliar se aparecer abuso real nos `security_events`. |
| **Política de senha no servidor é só `length >= 8`.** O front exige maiúscula, minúscula e dígito; o servidor não.                                                                                                                                       | O Supabase Auth aplica a própria política, então não é ausência total — mas a regra do front é contornável por quem chama a API direto.                                     |
| **Reset de senha é 100% client-side** contra o GoTrue, sem endpoint próprio.                                                                                                                                                                             | Funciona e tem allowlist rígida de redirect. Fica anotado porque é o único trecho do fluxo de login que não passa pelo BFF, e portanto o único sem rate limit próprio.      |

---

## Ação necessária do operador antes do deploy

1. **Gerar e configurar `ADMIN_2FA_ENC_KEY`** na Vercel (32 bytes hex).
   Trocar essa chave depois torna o `totpSecret` já gravado ilegível — nesse caso, recadastre o
   segundo fator no painel.
2. **Confirmar `CORS_ORIGINS`** nas variáveis do projeto: agora o boot falha sem ela fora de
   dev/test, e `npm run check:env` bloqueia o build.
3. Depois do deploy, **entrar no painel e salvar as configurações uma vez** para migrar
   `totpSecret`/`fallbackPin` do texto puro para o formato protegido.

## Verificação executada

- `npm run lint` — 0 erros; `npx vitest run` — **823 testes, 65 arquivos, todos verdes** (eram 720 no
  início da avaliação).
- Teste de regressão do AUTH-01 confirmado nos dois sentidos: falha com o router defeituoso, passa
  com o corrigido.
- `routes/__tests__/auth-guards-integration.test.js` sobe o app de `createApiApp` e fala com ele por
  HTTP: 429 no balde estourado, 403 no logout cross-origin, 405 no método errado, e a asserção de
  que uma requisição bloqueada **não chega** ao Supabase Auth.
