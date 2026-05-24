const express = require('express');
const rateLimit = require('express-rate-limit');

const adminCategoriesHandler = require('../api/admin-categories');
const adminDashboardHandler = require('../api/admin-dashboard');
const adminLoginHandler = require('../api/admin-login');
const adminLogoutHandler = require('../api/admin-logout');
const adminOrdersHandler = require('../api/admin-orders');
const adminProductsHandler = require('../api/admin-products');
const adminSessionHandler = require('../api/admin-session');
const adminSettingsHandler = require('../api/admin-settings');
const adminUsersHandler = require('../api/admin-users');
const createPaymentHandler = require('../api/create-payment');
const customerOrdersHandler = require('../api/customer-orders');
const downloadHandler = require('../api/download');
const homeSectionsHandler = require('../api/home-sections');
const productDetailsHandler = require('../api/product-details');
const productsHandler = require('../api/products');
const sendConfirmationEmailHandler = require('../api/send-confirmation-email');
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

router.all('/admin-categories', wrapCompatHandler(adminCategoriesHandler));
router.all('/admin-dashboard', wrapCompatHandler(adminDashboardHandler));
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
router.all('/admin-users', wrapCompatHandler(adminUsersHandler));
router.all('/admin/users', wrapCompatHandler(adminUsersHandler));
router.all('/create-payment', wrapCompatHandler(createPaymentHandler));
router.all('/customer-orders', wrapCompatHandler(customerOrdersHandler));
router.all('/download', wrapCompatHandler(downloadHandler));
router.all('/home-sections', wrapCompatHandler(homeSectionsHandler));
router.all('/product-details', wrapCompatHandler(productDetailsHandler));
router.all('/products', wrapCompatHandler(productsHandler));
router.all('/send-confirmation-email', wrapCompatHandler(sendConfirmationEmailHandler));
router.all('/verify-payment', wrapCompatHandler(verifyPaymentHandler));
router.all('/webhook', wrapCompatHandler(webhookHandler));

module.exports = router;
