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

const server = http.createServer((req, res) => {
  // Strip query string before building the file path
  const urlPath = req.url.split('?')[0];
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
