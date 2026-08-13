const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  customerLogin,
  customerRegister,
  customerGoogleStart,
  customerGoogleCallback,
  customerSession,
  customerLogout,
} = require('../lib/customer-auth-handlers');

const router = express.Router();

// Rate-limit de login (apenas no Express/dev). Em produção (Vercel serverless)
// o mesmo handler roda via api/auth/customer/login.js; o rate-limit de login
// serverless depende de um store compartilhado (KV) — ver pendência API-03.
const customerLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Credenciais invalidas.',
  },
});

// GET /auth/me foi REMOVIDO. Ele era Express-only e autenticava por Bearer
// token do Supabase (middleware/auth.middleware.js), um modelo de segurança
// que este sistema NÃO usa: a identidade do cliente é o cookie HttpOnly
// `customer_session` (HMAC, lib/customer-session.js), verificado por
// /auth/customer/session. Manter os dois desenhava duas verdades sobre "quem
// é o usuário logado" — e só a de cookie roda em produção, já que a Vercel
// publica api/auth/*.js e nunca este router. Nenhum consumidor no frontend.
// Junto foram removidos middleware/auth.middleware.js (authenticate/checkRole)
// e middleware/validate.middleware.js, que só existiam para essas rotas mortas.

// Handlers compartilhados com as funções Vercel (api/auth/*.js) — paridade.
router.post('/auth/customer/login', customerLoginLimiter, customerLogin);
router.post('/auth/customer/register', customerRegister);
router.get('/auth/customer/google/start', customerGoogleStart);
router.post('/auth/customer/google/callback', customerGoogleCallback);
router.get('/auth/customer/session', customerSession);
router.post('/auth/customer/logout', customerLogout);

module.exports = router;
