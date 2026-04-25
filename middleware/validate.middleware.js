const { AppError } = require('../utils/app-error');

function validateBody(schema) {
  return function validateBodyMiddleware(req, _res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      return next(new AppError('Payload inválido.', 400, { details: errors }));
    }

    req.validatedBody = result.data;
    return next();
  };
}

module.exports = {
  validateBody,
};
