const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth.middleware');
const { getProfileRoleByUserId } = require('../services/supabase-auth');
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

// /auth/me continua Express-only (usa Bearer token + middleware authenticate).
// O frontend não consome este endpoint (usa /auth/customer/session).
router.get('/auth/me', authenticate, async (req, res, next) => {
  try {
    const role = await getProfileRoleByUserId(req.auth.user.id);
    return res.status(200).json({
      success: true,
      user: {
        id: req.auth.user.id,
        email: req.auth.user.email,
        role: role || null,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Handlers compartilhados com as funções Vercel (api/auth/*.js) — paridade.
router.post('/auth/customer/login', customerLoginLimiter, customerLogin);
router.post('/auth/customer/register', customerRegister);
router.get('/auth/customer/google/start', customerGoogleStart);
router.post('/auth/customer/google/callback', customerGoogleCallback);
router.get('/auth/customer/session', customerSession);
router.post('/auth/customer/logout', customerLogout);

module.exports = router;
