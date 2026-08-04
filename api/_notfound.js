// Fallback para caminhos /api/* que não têm função na Vercel. Sem isto, o
// catch-all do vercel.json devolveria o index.html (HTML, HTTP 200) para uma
// rota de API inexistente, mascarando erros de roteamento. Aqui devolvemos um
// 404 JSON, alinhado ao notFoundHandler do Express (paridade).
module.exports = function handler(req, res) {
  return res.status(404).json({
    success: false,
    error: { message: 'Recurso não encontrado.', code: 'not_found' },
  });
};
