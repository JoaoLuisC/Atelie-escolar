const express = require('express');
const createPaymentHandler = require('../api/create-payment');
const verifyPaymentHandler = require('../api/verify-payment');
const { validateBody } = require('../middleware/validate.middleware');
const { processPaymentSchema } = require('../validation/payment.schemas');

const router = express.Router();

router.post('/payments/process', validateBody(processPaymentSchema), async (req, res, next) => {
  try {
    req.body = req.validatedBody;
    return await createPaymentHandler(req, res);
  } catch (error) {
    return next(error);
  }
});

router.get('/payments/verify', async (req, res, next) => {
  try {
    return await verifyPaymentHandler(req, res);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
