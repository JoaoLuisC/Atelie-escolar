const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const { getSupabaseConfig, listTableRows } = require('../lib/supabase');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function formatUsers(usersRows, statsByEmail) {
  return usersRows
    .map((row) => {
      const email = normalizeEmail(row.email);
      const stats = statsByEmail[email] || { purchases: 0, totalSpent: 0, lastPurchase: null };
      return {
        id: String(row.id),
        email: row.email,
        name: row.display_name || '',
        role: row.role || 'customer',
        provider: row.provider || 'email',
        purchases: stats.purchases,
        totalSpent: stats.totalSpent,
        lastPurchase: stats.lastPurchase,
        createdAt: row.created_at,
      };
    })
    .filter((user) => user.role !== 'admin');
}

async function listUsers() {
  const [profilesRows, ordersRows] = await Promise.all([
    listTableRows('profiles', {
      select: 'id,email,display_name,role,provider,created_at',
      orderBy: 'created_at',
      ascending: false,
    }),
    listTableRows('orders', {
      select: 'customer_email,total_amount,payment_status,completed_at,created_at',
      orderBy: 'created_at',
      ascending: false,
    }),
  ]);

  const statsByEmail = {};
  for (const row of ordersRows) {
    if (String(row.payment_status || '') !== 'approved') continue;
    const email = normalizeEmail(row.customer_email);
    if (!email) continue;
    if (!statsByEmail[email]) {
      statsByEmail[email] = { purchases: 0, totalSpent: 0, lastPurchase: null };
    }
    statsByEmail[email].purchases += 1;
    statsByEmail[email].totalSpent += Number(row.total_amount || 0);
    const dt = new Date(row.completed_at || row.created_at || 0);
    if (!statsByEmail[email].lastPurchase || dt > statsByEmail[email].lastPurchase) {
      statsByEmail[email].lastPurchase = dt;
    }
  }

  return formatUsers(profilesRows, statsByEmail).filter((user) => user.email !== 'admin@profamarciarcardoso.com');
}

module.exports = async function adminUsersHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const users = await listUsers();
    return res.status(200).json({ success: true, users });
  } catch (error) {
    console.error('Admin users error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao carregar usuários do admin.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
