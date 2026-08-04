const express = require('express');

// Os aliases /api/payments/process e /api/payments/verify foram removidos:
// eram Express-only (quebravam na Vercel, que não tem função api/payments/*) e
// não eram usados pelo frontend, que chama os caminhos canônicos /api/create-payment
// e /api/verify-payment (montados em routes/api-compat.routes.js, este último com
// rate-limit dedicado). Manter dois caminhos para o mesmo efeito permitia burlar
// o verifyPaymentLimiter. Router mantido vazio para não alterar o mount no server.js.
const router = express.Router();

module.exports = router;
