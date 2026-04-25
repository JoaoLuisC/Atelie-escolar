const { hasValidAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');

module.exports = async function adminSessionHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authenticated = hasValidAdminSession(req);
  return res.status(200).json({
    success: true,
    authenticated,
  });
};
