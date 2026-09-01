const express = require('express');

// ════════════════════════════════════════════════════════════════════
// MONTA OS MÓDULOS DE `handlers/auth/customer/**`, NÃO AS FUNÇÕES DE
// `lib/customer-auth-handlers`.
//
// A diferença entre os dois é a guarda. `lib/customer-auth-handlers` é a
// LÓGICA de cada endpoint (fala com o Supabase, emite o cookie); os módulos de
// `handlers/auth/customer/**` são a mesma lógica com `guardMethod`,
// `enforceRateLimit` e, no logout, a checagem anti-CSRF de origem.
//
// Este arquivo importava a lógica crua. Não era um bug enquanto produção
// publicava `api/auth/customer/*.js` como funções isoladas — este router só
// rodava no Express de dev, e a guarda estava no caminho que importava. O
// 660fe74 consolidou os 44 handlers em UMA função (`api/index.js` →
// `lib/express-app.js` → este router) e inverteu a situação: este virou o
// caminho de produção, e os módulos com guarda viraram código morto. O efeito
// foi login, cadastro e OAuth de cliente sem nenhum contador, e logout sem
// anti-CSRF, com os testes passando (eles liam o arquivo no disco, não o que
// estava montado).
//
// `routes/__tests__/api-route-parity.test.js` agora compara identidade de
// módulo, então trocar estes `require` de volta pela lógica crua quebra o
// teste em vez de sair em silêncio.
// ════════════════════════════════════════════════════════════════════
const customerLoginHandler = require('../handlers/auth/customer/login');
const customerRegisterHandler = require('../handlers/auth/customer/register');
const customerSessionHandler = require('../handlers/auth/customer/session');
const customerLogoutHandler = require('../handlers/auth/customer/logout');
const customerGoogleStartHandler = require('../handlers/auth/customer/google/start');
const customerGoogleCallbackHandler = require('../handlers/auth/customer/google/callback');

const { mountHandler } = require('../lib/route-mount');

const router = express.Router();

// GET /auth/me foi REMOVIDO. Ele era Express-only e autenticava por Bearer
// token do Supabase (middleware/auth.middleware.js), um modelo de segurança
// que este sistema NÃO usa: a identidade do cliente é o cookie HttpOnly
// `customer_session` (HMAC, lib/customer-session.js), verificado por
// /auth/customer/session. Manter os dois desenhava duas verdades sobre "quem
// é o usuário logado". Nenhum consumidor no frontend.
// Junto foram removidos middleware/auth.middleware.js (authenticate/checkRole)
// e middleware/validate.middleware.js, que só existiam para essas rotas mortas.

// `router.all` e não `router.post`/`router.get`: o método é conferido por
// `guardMethod` DENTRO de cada handler, que responde 405 no envelope. Com
// `router.post` um GET cairia no 404 do Express, o `guardMethod` viraria código
// inalcançável e o contrato divergiria do resto da API — `api-compat.routes.js`
// monta todas as suas rotas com `router.all` pelo mesmo motivo.
router.all('/auth/customer/login', mountHandler(customerLoginHandler));
router.all('/auth/customer/register', mountHandler(customerRegisterHandler));
router.all('/auth/customer/google/start', mountHandler(customerGoogleStartHandler));
router.all('/auth/customer/google/callback', mountHandler(customerGoogleCallbackHandler));
router.all('/auth/customer/session', mountHandler(customerSessionHandler));
router.all('/auth/customer/logout', mountHandler(customerLogoutHandler));

module.exports = router;
