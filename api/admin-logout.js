const { clearSessionCookie, setAdminCorsHeaders } = require('../lib/admin-session');

module.exports = async function adminLogoutHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  clearSessionCookie(res);
  return res.status(200).json({ success: true });
};
