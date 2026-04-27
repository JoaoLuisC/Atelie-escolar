const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const { deleteFromTable, getSupabaseConfig, getTableRow, listTableRows, updateTable } = require('../lib/supabase');

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
    .filter((user) => !['admin', 'master'].includes(String(user.role || '').toLowerCase()));
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

async function updateUser(body) {
  const id = String(body.id || '').trim();
  if (!id) {
    return { status: 400, body: { success: false, error: 'id é obrigatório.' } };
  }

  const existing = await getTableRow('profiles', {
    select: 'id,email,role',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) {
    return { status: 404, body: { success: false, error: 'Usuário não encontrado.' } };
  }

  if (['admin', 'master'].includes(String(existing.role || '').toLowerCase())) {
    return { status: 403, body: { success: false, error: 'Não é permitido editar usuário admin por este endpoint.' } };
  }

  const payload = {};
  if (body.name !== undefined) payload.display_name = String(body.name || '').trim();
  if (body.role !== undefined) payload.role = String(body.role || '').trim().toLowerCase();
  if (body.provider !== undefined) payload.provider = String(body.provider || '').trim().toLowerCase();

  if (Object.keys(payload).length === 0) {
    return { status: 400, body: { success: false, error: 'Nenhum campo válido para atualização.' } };
  }

  await updateTable('profiles', { id: `eq.${id}` }, payload);
  return { status: 200, body: { success: true } };
}

async function deleteUser(id) {
  if (!id) {
    return { status: 400, body: { success: false, error: 'id é obrigatório.' } };
  }

  const existing = await getTableRow('profiles', {
    select: 'id,email,role',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) {
    return { status: 404, body: { success: false, error: 'Usuário não encontrado.' } };
  }

  if (['admin', 'master'].includes(String(existing.role || '').toLowerCase())) {
    return { status: 403, body: { success: false, error: 'Não é permitido excluir usuário admin por este endpoint.' } };
  }

  await deleteFromTable('profiles', { id: `eq.${id}` });
  return { status: 200, body: { success: true } };
}

module.exports = async function adminUsersHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const handlers = {
      GET: async () => ({ status: 200, body: { success: true, users: await listUsers() } }),
      PUT: async () => updateUser(req.body || {}),
      DELETE: async () => deleteUser(String(req.query?.id || req.body?.id || '').trim()),
    };

    const handler = handlers[req.method];
    if (!handler) {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const result = await handler();
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Admin users error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao carregar usuários do admin.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
