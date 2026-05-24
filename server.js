const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const { createSecurityMiddleware } = require('./lib/security-headers');
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

const REQUIRED_PRODUCTION_SECRETS = [
  'ADMIN_SESSION_SECRET',
  'CUSTOMER_SESSION_SECRET',
  'WEBHOOK_SECRET',
  'DOWNLOAD_TOKEN_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

if (RUNTIME_ENV === 'production') {
  const missing = REQUIRED_PRODUCTION_SECRETS.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) {
    throw new Error(`Missing required production secrets: ${missing.join(', ')}`);
  }

  const appUrl = String(process.env.APP_URL || '').trim();
  if (!appUrl.startsWith('https://')) {
    throw new Error('APP_URL deve usar HTTPS em produção (configure APP_URL=https://...).');
  }
}

const PORT = 3000;
const app = express();

// Atrás do load-balancer da Vercel (1 hop). Sem isto:
//   • req.ip vira o IP do balancer, não do cliente real;
//   • express-rate-limit rateia o LB inteiro como um único IP;
//   • o log do webhook (event=webhook_invalid_signature) registra
//     o IP errado, inutilizando alertas por origem.
// Em dev (sem proxy), trust proxy=1 é seguro: o LOCALHOST_ORIGIN_PATTERN
// abaixo já restringe a origem e não há X-Forwarded-For real para falsear.
app.set('trust proxy', 1);

const LOCALHOST_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function buildCorsConfig() {
  const allowedOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Default (sem CORS_ORIGINS): libera QUALQUER porta de localhost/127.0.0.1.
  // Vite pode subir em 5173, 5174, 5175... dependendo de portas ocupadas.
  if (!allowedOrigins.length) {
    return {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (LOCALHOST_ORIGIN_PATTERN.test(origin)) return callback(null, true);
        return callback(new Error(`CORS: origem ${origin} não permitida em dev.`));
      },
      credentials: true,
    };
  }

  // Wildcard + credentials é incompatível com browsers e expõe a API.
  // Quando '*' está configurado, refletimos a origem sem credentials.
  if (allowedOrigins.includes('*')) {
    return {
      origin: true,
      credentials: false,
    };
  }

  return {
    origin: allowedOrigins,
    credentials: true,
  };
}

app.disable('x-powered-by');
app.use(createSecurityMiddleware({ runtimeEnv: RUNTIME_ENV }));
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

// SEO endpoints servidos na raiz (espelho da rota /api/sitemap.xml na Vercel)
const sitemapHandler = require('./api/sitemap.xml');
app.get('/sitemap.xml', (req, res, next) => Promise.resolve(sitemapHandler(req, res)).catch(next));

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

