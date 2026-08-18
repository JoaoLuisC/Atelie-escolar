const express = require('express');

// ════════════════════════════════════════════════════════════════════
// SEM `express-rate-limit` AQUI — ADR 0007.
//
// Este arquivo tinha NOVE limitadores por rota. Nenhum deles roda em
// produção: na Vercel cada handler de `api/` é uma função isolada e
// `server.js` não está no caminho. O resultado era duas políticas de limite
// para os mesmos endpoints, e o desenvolvedor testava contra um comportamento
// que a cliente nunca encontra — inclusive nos de login, onde limite é
// controle de segurança e não de custo.
//
// A política real é `enforceRateLimit` DENTRO do handler (regra E1 e ADR
// 0002), que vale nos dois ambientes e cujo contador vive no Postgres. Todas
// as rotas que os nove limitadores cobriam já têm perfil em `RATE_LIMITS`.
//
// Sobra o limitador de borda GENÉRICO de `server.js` (`/api`, 250/15min), que
// não finge ser a política: é rede contra loop acidental de script local.
// ════════════════════════════════════════════════════════════════════

const abandonedCartHandler = require('../api/abandoned-cart');
const adminAbcCustomersHandler = require('../api/admin/abc-customers');
const adminAbcProductsHandler = require('../api/admin/abc-products');
const adminCategoriesHandler = require('../api/admin/categories');
const adminCleanupEventsHandler = require('../api/admin/cleanup-events');
const adminCohortHandler = require('../api/admin/cohort');
const adminCouponsHandler = require('../api/admin/coupons');
const adminDashboardHandler = require('../api/admin/dashboard');
const adminFunnelHandler = require('../api/admin/funnel');
const adminKpisHandler = require('../api/admin/kpis');
const adminSegmentsHandler = require('../api/admin/segments');
const adminLoginHandler = require('../api/admin/login');
const confirmSubscriptionHandler = require('../api/confirm-subscription');
const cronEmailJobsHandler = require('../api/cron-email-jobs');
const subscribeHandler = require('../api/subscribe');
const unsubscribeHandler = require('../api/unsubscribe');
const adminLogoutHandler = require('../api/admin/logout');
const adminOrdersHandler = require('../api/admin/orders');
const adminProductsHandler = require('../api/admin/products');
const adminSessionHandler = require('../api/admin/session');
const adminSettingsHandler = require('../api/admin/settings');
const adminUploadUrlHandler = require('../api/admin/upload-url');
const adminUsersHandler = require('../api/admin/users');
const createPaymentHandler = require('../api/create-payment');
const crossSellHandler = require('../api/cross-sell');
const customerOrdersHandler = require('../api/customer-orders');
const downloadHandler = require('../api/download');
const meDeleteAccountHandler = require('../api/me-delete-account');
const apiNotFoundHandler = require('../api/notfound');
const homeSectionsHandler = require('../api/home-sections');
const productDetailsHandler = require('../api/product-details');
const productsHandler = require('../api/products');
const sendConfirmationEmailHandler = require('../api/send-confirmation-email');
const sitemapXmlHandler = require('../api/sitemap.xml');
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

router.all('/abandoned-cart', wrapCompatHandler(abandonedCartHandler));
router.all('/admin/abc-customers', wrapCompatHandler(adminAbcCustomersHandler));
router.all('/admin/abc-products', wrapCompatHandler(adminAbcProductsHandler));
router.all('/admin/categories', wrapCompatHandler(adminCategoriesHandler));
router.all('/admin/cleanup-events', wrapCompatHandler(adminCleanupEventsHandler));
router.all('/admin/cohort', wrapCompatHandler(adminCohortHandler));
router.all('/admin/coupons', wrapCompatHandler(adminCouponsHandler));
router.all('/admin/dashboard', wrapCompatHandler(adminDashboardHandler));
router.all('/admin/funnel', wrapCompatHandler(adminFunnelHandler));
router.all('/admin/kpis', wrapCompatHandler(adminKpisHandler));
router.all('/admin/segments', wrapCompatHandler(adminSegmentsHandler));
router.all('/admin/login', wrapCompatHandler(adminLoginHandler));
router.all('/admin/logout', wrapCompatHandler(adminLogoutHandler));
router.all('/admin/orders', wrapCompatHandler(adminOrdersHandler));
router.all('/admin/products', wrapCompatHandler(adminProductsHandler));
router.all('/admin/session', wrapCompatHandler(adminSessionHandler));
router.all('/admin/settings', wrapCompatHandler(adminSettingsHandler));
router.all('/admin/upload-url', wrapCompatHandler(adminUploadUrlHandler));
router.all('/admin/users', wrapCompatHandler(adminUsersHandler));
router.all('/confirm-subscription', wrapCompatHandler(confirmSubscriptionHandler));
router.all('/create-payment', wrapCompatHandler(createPaymentHandler));
// /cron-email-jobs autoriza por CRON_SECRET no header e é chamado uma vez por
// hora pelo agendador — a dispensa está registrada em
// api/__tests__/rate-limit-coverage.test.js.
router.all('/cron-email-jobs', wrapCompatHandler(cronEmailJobsHandler));
router.all('/cross-sell', wrapCompatHandler(crossSellHandler));
router.all('/customer-orders', wrapCompatHandler(customerOrdersHandler));
// LGPD self-service (§3.8): exclusão de conta com confirmação por e-mail.
router.all('/me-delete-account', wrapCompatHandler(meDeleteAccountHandler));
router.all('/download', wrapCompatHandler(downloadHandler));
router.all('/home-sections', wrapCompatHandler(homeSectionsHandler));
router.all('/product-details', wrapCompatHandler(productDetailsHandler));
router.all('/products', wrapCompatHandler(productsHandler));
router.all('/send-confirmation-email', wrapCompatHandler(sendConfirmationEmailHandler));
router.all('/subscribe', wrapCompatHandler(subscribeHandler));
router.all('/unsubscribe', wrapCompatHandler(unsubscribeHandler));
router.all('/track-event', wrapCompatHandler(trackEventHandler));
router.all('/validate-coupon', wrapCompatHandler(validateCouponHandler));
router.all('/verify-payment', wrapCompatHandler(verifyPaymentHandler));
router.all('/webhook', wrapCompatHandler(webhookHandler));

// ── Os dois que faltavam (item P0.4) ────────────────────────────────
// Em produção a Vercel deriva as rotas do sistema de arquivos de `api/`; aqui
// a lista é escrita à mão, e nada comparava as duas até
// `routes/__tests__/api-route-parity.test.js` existir.
//
// `/api/sitemap.xml`: o `vercel.json` roteia `/sitemap.xml` para
// `/api/sitemap.xml`, então o endpoint existe nos DOIS caminhos em produção.
// O `server.js` já servia o caminho da raiz; o de `/api` não existia, e era o
// único que o teste de paridade consegue enxergar.
//
// `/api/notfound`: em produção é um endpoint público de verdade — o
// `vercel.json` manda para lá toda rota `/api/*` sem função, para que ela não
// caia no catch-all do SPA e devolva HTML com status 200. No Express o
// `notFoundHandler` de `middleware/error.middleware.js` cobre o catch-all, mas
// o caminho nomeado não resolvia para o MESMO módulo — que é a paridade que
// o ADR 0002 promete.
router.all('/sitemap.xml', wrapCompatHandler(sitemapXmlHandler));
router.all('/notfound', wrapCompatHandler(apiNotFoundHandler));

module.exports = router;
