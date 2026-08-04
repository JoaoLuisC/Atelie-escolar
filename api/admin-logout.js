const { clearSessionCookie, isSameOriginRequest, setAdminCorsHeaders } = require('../lib/admin-session');

module.exports = async function adminLogoutHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Defesa anti-CSRF: impede logout forçado por página maliciosa cross-site.
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ success: false, error: 'Origem nao permitida (possivel CSRF).' });
  }

  clearSessionCookie(res);
  return res.status(200).json({ success: true });
};
