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

const { mountHandler } = require('../lib/route-mount');

const abandonedCartHandler = require('../handlers/abandoned-cart');
const adminAbcCustomersHandler = require('../handlers/admin/abc-customers');
const adminAbcProductsHandler = require('../handlers/admin/abc-products');
const adminCategoriesHandler = require('../handlers/admin/categories');
const adminCleanupEventsHandler = require('../handlers/admin/cleanup-events');
const adminCohortHandler = require('../handlers/admin/cohort');
const adminCouponsHandler = require('../handlers/admin/coupons');
const adminDashboardHandler = require('../handlers/admin/dashboard');
const adminFunnelHandler = require('../handlers/admin/funnel');
const adminKpisHandler = require('../handlers/admin/kpis');
const adminSegmentsHandler = require('../handlers/admin/segments');
const adminLoginHandler = require('../handlers/admin/login');
const confirmSubscriptionHandler = require('../handlers/confirm-subscription');
const cronEmailJobsHandler = require('../handlers/cron-email-jobs');
const subscribeHandler = require('../handlers/subscribe');
const unsubscribeHandler = require('../handlers/unsubscribe');
const adminLogoutHandler = require('../handlers/admin/logout');
const adminOrdersHandler = require('../handlers/admin/orders');
const adminProductsHandler = require('../handlers/admin/products');
const adminSessionHandler = require('../handlers/admin/session');
const adminSettingsHandler = require('../handlers/admin/settings');
const adminUploadUrlHandler = require('../handlers/admin/upload-url');
const adminUsersHandler = require('../handlers/admin/users');
const createPaymentHandler = require('../handlers/create-payment');
const crossSellHandler = require('../handlers/cross-sell');
const customerOrdersHandler = require('../handlers/customer-orders');
const downloadHandler = require('../handlers/download');
const meDeleteAccountHandler = require('../handlers/me-delete-account');
const apiNotFoundHandler = require('../handlers/notfound');
const homeSectionsHandler = require('../handlers/home-sections');
const productDetailsHandler = require('../handlers/product-details');
const productsHandler = require('../handlers/products');
const sendConfirmationEmailHandler = require('../handlers/send-confirmation-email');
const sitemapXmlHandler = require('../handlers/sitemap.xml');
const trackEventHandler = require('../handlers/track-event');
const validateCouponHandler = require('../handlers/validate-coupon');
const verifyPaymentHandler = require('../handlers/verify-payment');
const webhookHandler = require('../handlers/webhook');

const router = express.Router();

// `wrapCompatHandler` virou `mountHandler` em `lib/route-mount.js`, comum aos
// dois routers. Ele guarda qual módulo de `handlers/` está por trás de cada
// middleware montado — o que permite ao teste de paridade comparar identidade
// de módulo, não string de caminho. O alias local mantém as 40 chamadas abaixo
// legíveis e o diff desta mudança pequeno.
const wrapCompatHandler = mountHandler;

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
// handlers/__tests__/rate-limit-coverage.test.js.
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
