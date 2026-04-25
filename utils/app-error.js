class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = options.details;
    this.code = options.code;
  }
}

module.exports = {
  AppError,
};
