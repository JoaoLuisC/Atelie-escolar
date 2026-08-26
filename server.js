const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const { createApiApp } = require('./lib/express-app');
const { errorHandler } = require('./middleware/error.middleware');
const { ERROR_CODES, fail } = require('./lib/http');

function loadEnvFiles() {
  const initialEnv = String(process.env.APP_ENV || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase();

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

const RUNTIME_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || 'development')
  .trim()
  .toLowerCase();
process.env.NODE_ENV = RUNTIME_ENV;

// Segredos exigidos no boot. A lista contém APENAS variáveis que algum código
// de `api/` ou `lib/` realmente lê — exigir um segredo que ninguém consome dá
// falsa sensação de proteção (o operador rotaciona algo inerte e acha que
// endureceu o sistema). `DOWNLOAD_TOKEN_SECRET` foi removido daqui por isso:
// os tokens de download são valores opacos gerados e conferidos no banco
// (`download_tokens`), sem HMAC — nenhum arquivo lê essa variável. Pior:
// ela vazou no histórico do git (.env.production), então mantê-la na lista
// sugeria que o segredo vazado protegia a entrega dos produtos. Não protegia.
// A mesma lista, para o runtime real (Vercel), vive em `scripts/check-env.js`.
const REQUIRED_PRODUCTION_SECRETS = [
  'ADMIN_SESSION_SECRET',
  'CUSTOMER_SESSION_SECRET',
  'WEBHOOK_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

if (RUNTIME_ENV === 'production') {
  const missing = REQUIRED_PRODUCTION_SECRETS.filter(
    (key) => !String(process.env[key] || '').trim(),
  );
  if (missing.length) {
    throw new Error(`Missing required production secrets: ${missing.join(', ')}`);
  }

  const appUrl = String(process.env.APP_URL || '').trim();
  if (!appUrl.startsWith('https://')) {
    throw new Error('APP_URL deve usar HTTPS em produção (configure APP_URL=https://...).');
  }
}

const PORT = 3000;

// ════════════════════════════════════════════════════════════════════
// LIMITADOR DE BORDA — genérico, e só isso (ADR 0007).
//
// Este é o ÚNICO `express-rate-limit` que sobrou, e ele é EXCLUSIVO do
// Express local: `createApiApp` não o inclui, então a função serverless de
// produção não o tem. Ele não é a política de rate limit do produto — a
// política é `enforceRateLimit` dentro de cada handler (regra E1), com
// contador no Postgres, e vale nos dois ambientes. Este aqui é rede contra
// loop acidental de script local.
//
// Manter isto fora do app compartilhado é deliberado: um limitador de
// processo não sobrevive a serverless (cada invocação pode ser instância
// nova, regra E2), então promovê-lo a produção só criaria a ilusão de
// proteção que o ADR 0007 existe para impedir.
// ════════════════════════════════════════════════════════════════════
const edgeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX || 250),
  standardHeaders: true,
  legacyHeaders: false,
  // Envelope da regra A1, com o código estável da A2. Sem isto o
  // express-rate-limit responde texto puro ("Too many requests…") e o cliente
  // recebe um formato que não existe em nenhum outro lugar da API.
  handler: (_req, res) =>
    fail(res, {
      status: 429,
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Muitas requisições. Aguarde um instante e tente novamente.',
    }),
});

const app = createApiApp({
  runtimeEnv: RUNTIME_ENV,
  beforeRoutes: (instance) => instance.use('/api', edgeLimiter),
});

// Rota só do Express local — não existe na Vercel, e o checklist de release
// registra isso para ninguém usar /health como smoke test de produção.
app.get('/health', (_req, res) => {
  return res.status(200).json({ ok: true, service: 'api', port: PORT });
});

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
