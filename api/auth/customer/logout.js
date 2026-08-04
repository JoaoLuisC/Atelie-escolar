const { customerLogout } = require('../../../lib/customer-auth-handlers');
const { isSameOriginRequest } = require('../../../lib/admin-session');

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  // Defesa anti-CSRF: impede logout forçado por página maliciosa cross-site
  // (consistente com api/admin-logout.js).
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ success: false, error: 'Origem não permitida (possível CSRF).' });
  }

  return customerLogout(req, res);
};
