require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // fallback to .env for any missing vars
const http = require('node:http');
const path = require('node:path');

const RUNTIME_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase();
process.env.NODE_ENV = RUNTIME_ENV;

const PORT = 3000;

// Adapts plain Node.js req/res to Express-like interface expected by API handlers
function adaptResponse(res) {
  let statusCode = 200;
  const adapted = {
    setHeader: (k, v) => res.setHeader(k, v),
    status(code) { statusCode = code; return adapted; },
    json(data) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    end(data) {
      res.writeHead(statusCode);
      res.end(data || '');
    },
    redirect(url) {
      res.writeHead(302, { Location: url });
      res.end();
    },
  };
  return adapted;
}

async function handleApiRequest(reqPath, req, res) {
  const handlerPath = path.join(__dirname, 'api', reqPath.replace(/^\/api\//, '') + '.js');
  try {
    require.resolve(handlerPath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'API route not found' }));
  }

  // Parse query string
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  req.query = Object.fromEntries(urlObj.searchParams.entries());
  let body = {};
  await new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      resolve();
    });
  });

  req.body = body;
  const adapted = adaptResponse(res);
  try {
    const handler = require(handlerPath);
    await handler(req, adapted);
  } catch (err) {
    console.error('API error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // Route API requests
  if (urlPath.startsWith('/api/')) {
    return handleApiRequest(urlPath, req, res);
  }

  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'api', port: PORT }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({
    error: 'Frontend legado removido. Use o app React em http://localhost:5173.',
  }));
});

server.listen(PORT, () => {
  console.log('🚀 API server rodando em http://localhost:' + PORT);
  console.log('🩺 Healthcheck: http://localhost:' + PORT + '/health');
  console.log('⚛️ Frontend React (Vite): http://localhost:5173');
  console.log('');
  console.log('Pressione Ctrl+C para parar o servidor');
});

