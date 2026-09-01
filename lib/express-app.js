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

function isLocalRuntime(runtimeEnv) {
  const env = String(runtimeEnv || process.env.APP_ENV || process.env.NODE_ENV || '').trim();
  return env === 'development' || env === 'test';
}

/**
 * Config do middleware `cors`.
 *
 * DUAS REGRAS QUE ESTA FUNÇÃO EXISTE PARA MANTER
 *
 * 1. **Fora de dev/test, `CORS_ORIGINS` é obrigatório.** O default de dev
 *    libera qualquer porta de localhost COM credenciais; herdá-lo em produção
 *    porque alguém esqueceu a variável no painel da Vercel é uma allowlist
 *    aberta por omissão. Mesma disciplina fail-closed de `lib/env-secret.js`:
 *    ausência de configuração de segurança derruba o boot, não vira default
 *    permissivo silencioso.
 *
 * 2. **Origem recusada NÃO é erro.** Antes o default de dev chamava
 *    `callback(new Error(...))`, que o `errorHandler` transformava em 500 —
 *    enquanto em produção (`origin: [array]`) o mesmo pedido apenas não recebe
 *    os headers de CORS e SEGUE para o handler, onde `isSameOriginRequest`
 *    responde 403. Dev devolvia 500 onde produção devolve 403: divergência
 *    dev/prod, que é o que o ADR 0002 existe para impedir. `callback(null,
 *    false)` iguala os dois — e deixa a decisão com a guarda do handler, que é
 *    de quem ela é.
 *
 * CORS não é controle de acesso: o browser é quem o respeita, e um cliente que
 * não seja browser o ignora. Quem protege o endpoint é a guarda no handler.
 */
function buildCorsConfig({ runtimeEnv } = {}) {
  const allowedOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!allowedOrigins.length) {
    if (!isLocalRuntime(runtimeEnv)) {
      throw new Error(
        'CORS_ORIGINS não configurado. Fora de development/test ele é obrigatório: ' +
          'sem ele a allowlist cairia no default de dev, que aceita qualquer ' +
          'localhost COM credenciais. Defina as origens do site (ex.: ' +
          'https://ateliedaescola.com.br) nas variáveis de ambiente.',
      );
    }

    // Dev: o Vite sobe em 5173, 5174, 5175… conforme as portas ocupadas.
    return {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, LOCALHOST_ORIGIN_PATTERN.test(origin));
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

  app.use(cors(buildCorsConfig({ runtimeEnv })));
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
