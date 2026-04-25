const { AppError } = require('../utils/app-error');

function notFoundHandler(req, _res, next) {
  next(new AppError(`Rota não encontrada: ${req.originalUrl}`, 404));
}

function errorHandler(error, _req, res, _next) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (statusCode >= 500) {
    console.error('[api:error]', error);
  }

  const response = {
    success: false,
    error: {
      message: statusCode >= 500 && isProduction ? 'Erro interno do servidor.' : error.message,
      code: error.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    },
  };

  if (error.details && !isProduction) {
    response.error.details = error.details;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
