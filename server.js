require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // fallback to .env for any missing vars
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

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
  if (!fs.existsSync(handlerPath)) {
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

  let filePath = path.join(__dirname, 'public', urlPath === '/' ? 'index.html' : urlPath);
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Página não encontrada</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Erro no servidor: ' + error.code, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log('🚀 Servidor rodando em http://localhost:' + PORT);
  console.log('📱 Site principal: http://localhost:' + PORT + '/index.html');
  console.log('🔐 Login Admin: http://localhost:' + PORT + '/admin-login.html');
  console.log('');
  console.log('Pressione Ctrl+C para parar o servidor');
});

