const { ensureAdminSession, setAdminCorsHeaders } = require('../../lib/admin-session');
const { logAdminAction } = require('../../lib/admin-audit');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { deleteFromTable, getTableRow, listTableRows, updateTable },
} = require('../../lib/supabase');
const { ERROR_CODES, fail, methodNotAllowed, preflight } = require('../../lib/http');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-users');

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
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

  return formatUsers(profilesRows, statsByEmail).filter(
    (user) => user.email !== 'admin@profamarciarcardoso.com',
  );
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
    return {
      status: 403,
      body: { success: false, error: 'Não é permitido editar usuário admin por este endpoint.' },
    };
  }

  // Roles que este endpoint pode ATRIBUIR. 'admin'/'master' são deliberadamente
  // omitidos: promover a admin por aqui seria escalada de privilégio (a
  // autorização do painel é decidida por profiles.role).
  const ASSIGNABLE_ROLES = ['customer', 'cliente', 'seller', 'vendedor'];

  const payload = {};
  if (body.name !== undefined) payload.display_name = String(body.name || '').trim();
  if (body.role !== undefined) {
    const requestedRole = String(body.role || '')
      .trim()
      .toLowerCase();
    if (!ASSIGNABLE_ROLES.includes(requestedRole)) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Role inválida. Não é permitido atribuir admin/master por este endpoint.',
        },
      };
    }
    payload.role = requestedRole;
  }
  if (body.provider !== undefined)
    payload.provider = String(body.provider || '')
      .trim()
      .toLowerCase();

  if (Object.keys(payload).length === 0) {
    return {
      status: 400,
      body: { success: false, error: 'Nenhum campo válido para atualização.' },
    };
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
    return {
      status: 403,
      body: { success: false, error: 'Não é permitido excluir usuário admin por este endpoint.' },
    };
  }

  await deleteFromTable('profiles', { id: `eq.${id}` });
  return { status: 200, body: { success: true } };
}

module.exports = async function adminUsersHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const handlers = {
      GET: async () => ({ status: 200, body: { success: true, users: await listUsers() } }),
      PUT: async () => updateUser(req.body || {}),
      DELETE: async () => deleteUser(String(req.query?.id || req.body?.id || '').trim()),
    };

    const handler = handlers[req.method];
    if (!handler) {
      return methodNotAllowed(res, ['GET', 'PUT', 'DELETE', 'OPTIONS']);
    }

    const result = await handler();

    // Auditoria de escrita (regra I1) — best-effort.
    if (result.status >= 200 && result.status < 300 && req.method !== 'GET') {
      const actionByMethod = { POST: 'create', PUT: 'update', PATCH: 'patch', DELETE: 'delete' };
      await logAdminAction({
        req,
        action: actionByMethod[req.method] || String(req.method).toLowerCase(),
        targetType: 'user',
        targetId:
          req.method === 'DELETE'
            ? String(req.query?.id || req.body?.id || '').trim()
            : (req.body?.id ?? result.body?.id ?? null),
        after: req.method === 'DELETE' ? null : req.body || null,
      });
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao carregar usuários do admin.',
    });
  }
};
