// ════════════════════════════════════════════════════════════════════
// App Express compartilhado por DESENVOLVIMENTO e PRODUÇÃO.
//
// POR QUE ESTE ARQUIVO EXISTE
// O plano Hobby da Vercel publica no máximo 12 Serverless Functions por
// deployment, e este projeto tem 44 handlers. O modelo "um arquivo de `api/`
// = uma função" (ADR 0002) bateu nesse teto no primeiro deploy real. Em vez
// de pagar Pro ou espalhar os handlers, existe UMA função — `api/index.js` —
// que serve este app, e os handlers mudaram de `api/` para `handlers/`.
//
// O QUE **NÃO** MUDA (o ADR 0002 continua valendo por inteiro)
// Todo endpoint continua sendo o MESMO módulo nos dois ambientes: dev e
// produção carregam `handlers/<recurso>.js` pelo mesmo `routes/*.routes.js`.
// A divergência dev/prod que o ADR combate não volta — ao contrário, some o
// último resquício dela, porque agora é literalmente o mesmo processo.
//
// O QUE MUDA, E A REGRA QUE CONTINUA DE PÉ
// `app.use` passa a rodar em produção, o que o ADR 0002 listava como
// indisponível. Isso NÃO libera mover guarda de segurança para cá: rate limit
// continua sendo `enforceRateLimit` dentro do handler (regra E1, ADR 0007),
// auth continua no handler, validação continua no handler. O que mora aqui é
// só transporte — headers, CORS e parsing de corpo — que já era assim em dev.
// Guarda em middleware voltaria a ser guarda que só existe de um lado quando
// alguém chamar o handler direto num teste.
// ════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const { createSecurityMiddleware } = require('./security-headers');
const authRoutes = require('../routes/auth.routes');
const apiCompatRoutes = require('../routes/api-compat.routes');
const { notFoundHandler } = require('../middleware/error.middleware');
const sitemapHandler = require('../handlers/sitemap.xml');

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

/**
 * Monta o app até o 404 de `/api`. Quem chama acrescenta o que é seu
 * (o limitador de borda e o /health do Express local, por exemplo) e FECHA
 * com o errorHandler — que precisa ser o último `use` da pilha.
 *
 * @param {object}   options
 * @param {string}   options.runtimeEnv    'development' | 'production' | …
 * @param {Function} [options.beforeRoutes] recebe o app depois dos parsers e
 *                                          antes das rotas; é onde o Express
 *                                          local pendura o limitador de borda.
 */
function createApiApp({ runtimeEnv = 'production', beforeRoutes } = {}) {
  const app = express();

  // Atrás do load-balancer da Vercel (1 hop). Sem isto:
  //   • req.ip vira o IP do balancer, não do cliente real;
  //   • o contador de enforceRateLimit rateia o LB inteiro como um IP só;
  //   • o log do webhook (event=webhook_invalid_signature) registra
  //     o IP errado, inutilizando alertas por origem.
  app.set('trust proxy', 1);

  app.disable('x-powered-by');

  // Na Vercel o bloco `headers` do vercel.json já injeta estes mesmos headers
  // na borda, então a resposta de `/api/*` sai com CSP duplicado. É inerte:
  // CSP governa documento HTML e esta função só devolve JSON. Mantê-lo aqui
  // preserva o comportamento de dev e cobre a resposta caso a regra de borda
  // seja alterada por engano.
  app.use(createSecurityMiddleware({ runtimeEnv }));

  app.use(cors(buildCorsConfig()));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  if (typeof beforeRoutes === 'function') beforeRoutes(app);

  // SEO na raiz e sob /api: em produção o vercel.json reescreve /sitemap.xml
  // para esta função, e o caminho que chega aqui é /api/sitemap.xml.
  const sitemap = (req, res, next) => Promise.resolve(sitemapHandler(req, res)).catch(next);
  app.get('/sitemap.xml', sitemap);
  app.get('/api/sitemap.xml', sitemap);

  // Ordem importa: authRoutes expõe /auth/customer/* e apiCompatRoutes monta
  // o restante de handlers/*.js.
  app.use('/api', authRoutes);
  app.use('/api', apiCompatRoutes);
  app.use('/api', notFoundHandler);

  return app;
}

module.exports = { buildCorsConfig, createApiApp };
