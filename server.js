const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/products.routes');
const paymentRoutes = require('./routes/payment.routes');
const apiCompatRoutes = require('./routes/api-compat.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

function loadEnvFiles() {
  const initialEnv = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase();

  const candidates = [
    `.env.${initialEnv}.local`,
    ...(initialEnv === 'test' ? [] : ['.env.local']),
    `.env.${initialEnv}`,
    '.env',
  ];

  for (const envFile of candidates) {
    const envPath = path.join(process.cwd(), envFile);
    if (!fs.existsSync(envPath)) {
      continue;
    }

    dotenv.config({ path: envPath, override: false });
  }
}

loadEnvFiles();

const RUNTIME_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase();
process.env.NODE_ENV = RUNTIME_ENV;

const PORT = 3000;
const app = express();

function buildCorsConfig() {
  const allowedOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!allowedOrigins.length) {
    return {
      origin: [
        'http://localhost:5173',
        'http://localhost:3000',
      ],
      credentials: true,
    };
  }

  if (allowedOrigins.includes('*')) {
    return {
      origin: true,
      credentials: true,
    };
  }

  return {
    origin: allowedOrigins,
    credentials: true,
  };
}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors(buildCorsConfig()));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX || 250),
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', globalLimiter);
app.use('/api/auth', authLimiter);

app.get('/health', (_req, res) => {
  return res.status(200).json({ ok: true, service: 'api', port: PORT });
});

app.use('/api', authRoutes);
app.use('/api', productRoutes);
app.use('/api', paymentRoutes);
app.use('/api', apiCompatRoutes);
app.use('/api', notFoundHandler);

app.use((_req, res) => {
  return res.status(404).json({
    error: 'Frontend legado removido. Use o app React em http://localhost:5173.',
  });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log('API server rodando em http://localhost:' + PORT);
  console.log('Healthcheck: http://localhost:' + PORT + '/health');
  console.log('Frontend React (Vite): http://localhost:5173');
  console.log('Pressione Ctrl+C para parar o servidor');
});

