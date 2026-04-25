const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { AppError } = require('../utils/app-error');

const router = express.Router();
const apiFolderPath = path.join(__dirname, '..', 'api');

router.all('/:handler', async (req, res, next) => {
  try {
    const handlerName = String(req.params.handler || '').trim();
    if (!handlerName) {
      throw new AppError('Handler inválido.', 400);
    }

    const handlerPath = path.join(apiFolderPath, `${handlerName}.js`);
    if (!fs.existsSync(handlerPath)) {
      throw new AppError(`Endpoint não encontrado: /api/${handlerName}`, 404);
    }

    delete require.cache[require.resolve(handlerPath)];
    const handler = require(handlerPath);

    return await handler(req, res);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
