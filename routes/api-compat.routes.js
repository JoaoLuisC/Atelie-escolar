const express = require('express');
const rateLimit = require('express-rate-limit');

const abandonedCartHandler = require('../api/abandoned-cart');
const adminAbcCustomersHandler = require('../api/admin-abc-customers');
const adminAbcProductsHandler = require('../api/admin-abc-products');
const adminCategoriesHandler = require('../api/admin-categories');
const adminCleanupEventsHandler = require('../api/admin-cleanup-events');
const adminCohortHandler = require('../api/admin-cohort');
const adminDashboardHandler = require('../api/admin-dashboard');
const adminFunnelHandler = require('../api/admin-funnel');
const adminKpisHandler = require('../api/admin-kpis');
const adminSegmentsHandler = require('../api/admin-segments');
const adminLoginHandler = require('../api/admin-login');
const confirmSubscriptionHandler = require('../api/confirm-subscription');
const cronEmailJobsHandler = require('../api/cron-email-jobs');
const subscribeHandler = require('../api/subscribe');
const unsubscribeHandler = require('../api/unsubscribe');
const adminLogoutHandler = require('../api/admin-logout');
const adminOrdersHandler = require('../api/admin-orders');
const adminProductsHandler = require('../api/admin-products');
const adminSessionHandler = require('../api/admin-session');
const adminSettingsHandler = require('../api/admin-settings');
const adminUploadUrlHandler = require('../api/admin-upload-url');
const adminUsersHandler = require('../api/admin-users');
const createPaymentHandler = require('../api/create-payment');
const crossSellHandler = require('../api/cross-sell');
const customerOrdersHandler = require('../api/customer-orders');
const downloadHandler = require('../api/download');
const homeSectionsHandler = require('../api/home-sections');
const productDetailsHandler = require('../api/product-details');
const productsHandler = require('../api/products');
const sendConfirmationEmailHandler = require('../api/send-confirmation-email');
const trackEventHandler = require('../api/track-event');
const validateCouponHandler = require('../api/validate-coupon');
const verifyPaymentHandler = require('../api/verify-payment');
const webhookHandler = require('../api/webhook');

const router = express.Router();

function wrapCompatHandler(handler) {
  return async function compatHandler(req, res, next) {
    const originalSetHeader = res.setHeader.bind(res);

    res.setHeader = function patchedSetHeader(name, value) {
      const headerName = String(name || '').toLowerCase();
      if (headerName.startsWith('access-control-allow-')) {
        return this;
      }
      return originalSetHeader(name, value);
    };

    try {
      return await handler(req, res);
    } catch (error) {
      return next(error);
    } finally {
      res.setHeader = originalSetHeader;
    }
  };
}

// Rate-limit dedicado em /abandoned-cart: chamado a cada keystroke
// debounced no checkout, então tolera mais que /track-event mas
// limita varredura/spam.
const abandonedCartLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
router.all('/abandoned-cart', abandonedCartLimiter, wrapCompatHandler(abandonedCartHandler));
router.all('/admin-abc-customers', wrapCompatHandler(adminAbcCustomersHandler));
router.all('/admin-abc-products', wrapCompatHandler(adminAbcProductsHandler));
router.all('/admin-categories', wrapCompatHandler(adminCategoriesHandler));
router.all('/admin-cleanup-events', wrapCompatHandler(adminCleanupEventsHandler));
router.all('/admin-cohort', wrapCompatHandler(adminCohortHandler));
router.all('/admin-dashboard', wrapCompatHandler(adminDashboardHandler));
router.all('/admin-funnel', wrapCompatHandler(adminFunnelHandler));
router.all('/admin-kpis', wrapCompatHandler(adminKpisHandler));
router.all('/admin-segments', wrapCompatHandler(adminSegmentsHandler));
const adminLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Muitas tentativas. Aguarde 10 minutos e tente novamente.' },
});
router.all('/admin-login', adminLoginLimiter, wrapCompatHandler(adminLoginHandler));
router.all('/admin-logout', wrapCompatHandler(adminLogoutHandler));
router.all('/admin-orders', wrapCompatHandler(adminOrdersHandler));
router.all('/admin-products', wrapCompatHandler(adminProductsHandler));
router.all('/admin-session', wrapCompatHandler(adminSessionHandler));
router.all('/admin-settings', wrapCompatHandler(adminSettingsHandler));
router.all('/admin-upload-url', wrapCompatHandler(adminUploadUrlHandler));
router.all('/admin-users', wrapCompatHandler(adminUsersHandler));
router.all('/admin/users', wrapCompatHandler(adminUsersHandler));
router.all('/confirm-subscription', wrapCompatHandler(confirmSubscriptionHandler));
router.all('/create-payment', wrapCompatHandler(createPaymentHandler));
// /cron-email-jobs autoriza por CRON_SECRET no header (não usa rate-limit
// porque é chamado uma vez por hora pela GitHub Actions / Vercel Cron).
router.all('/cron-email-jobs', wrapCompatHandler(cronEmailJobsHandler));
router.all('/cross-sell', wrapCompatHandler(crossSellHandler));
router.all('/customer-orders', wrapCompatHandler(customerOrdersHandler));
router.all('/download', wrapCompatHandler(downloadHandler));
router.all('/home-sections', wrapCompatHandler(homeSectionsHandler));
router.all('/product-details', wrapCompatHandler(productDetailsHandler));
router.all('/products', wrapCompatHandler(productsHandler));
router.all('/send-confirmation-email', wrapCompatHandler(sendConfirmationEmailHandler));
// Newsletter (Fase 3 / regra D1): rate-limit em /subscribe pra coibir
// enumeração ou submissão automatizada. /unsubscribe e /confirm são
// idempotentes (vide handlers) e respondem genérico — não precisam de
// limit agressivo, mas mantemos modesto.
const subscribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
router.all('/subscribe', subscribeLimiter, wrapCompatHandler(subscribeHandler));
const unsubscribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
router.all('/unsubscribe', unsubscribeLimiter, wrapCompatHandler(unsubscribeHandler));
const trackEventLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitos eventos por minuto.' },
});
router.all('/track-event', trackEventLimiter, wrapCompatHandler(trackEventHandler));
// /validate-coupon: rate-limit para prevenir enumeração de códigos
const validateCouponLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas tentativas. Aguarde 1 minuto.' },
});
router.all('/validate-coupon', validateCouponLimiter, wrapCompatHandler(validateCouponHandler));
// Rate-limit dedicado em /verify-payment: a resposta contém PII (nome,
// email, download tokens). Mesmo com email obrigatório + comparação
// timing-safe, limitamos a 60 req/min por IP para coibir varredura.
const verifyPaymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas verificações por minuto. Tente de novo em 1 minuto.' },
});
router.all('/verify-payment', verifyPaymentLimiter, wrapCompatHandler(verifyPaymentHandler));
router.all('/webhook', wrapCompatHandler(webhookHandler));

module.exports = router;
