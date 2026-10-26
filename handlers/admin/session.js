const { getStaffSession } = require('../../lib/admin-session');
const { guardMethod, ok, setAdminCorsHeaders, setCachePolicy } = require('../../lib/http');

module.exports = async function adminSessionHandler(req, res) {
  setAdminCorsHeaders(req, res);
  // Nenhuma resposta admin vai para o cache do navegador (ADM-01/ADM-41).
  setCachePolicy(res, 'adminReport');

  if (guardMethod(req, res, ['GET'])) return;

  const session = getStaffSession(req);
  const authenticated = Boolean(session);
  return ok(res, {
    success: true,
    authenticated,
    // E-mail da conta logada, para o rodapé do painel dizer QUAL conta está
    // ativa (ADM-19). Só existe com sessão válida — o cookie é do próprio admin.
    ...(authenticated ? { email: session.email, role: session.role, userId: session.userId } : {}),
  });
};
