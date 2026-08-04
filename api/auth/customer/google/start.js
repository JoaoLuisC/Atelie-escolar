const { customerGoogleStart } = require('../../../../lib/customer-auth-handlers');

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  return customerGoogleStart(req, res);
};
