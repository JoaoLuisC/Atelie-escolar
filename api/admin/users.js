const { createAdminResourceHandler } = require('../../lib/admin-resource-handler');
const {
  serviceRoleHelpers: { deleteFromTable, getTableRow, listTableRows, updateTable },
} = require('../../lib/supabase');
const { ERROR_CODES } = require('../../lib/http');
const { parse } = require('../../validation');
const { userUpdateSchema, uuidId } = require('../../validation/admin.schemas');

const PRIVILEGED_ROLES = new Set(['admin', 'master']);

/** Erro de validação no formato que a factory despacha por `fail()`. */
function invalid(message) {
  return { error: { status: 400, code: ERROR_CODES.VALIDATION_FAILED, message } };
}

function userNotFound() {
  return {
    error: { status: 404, code: ERROR_CODES.NOT_FOUND, message: 'Usuário não encontrado.' },
  };
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isPrivileged(role) {
  return PRIVILEGED_ROLES.has(String(role || '').toLowerCase());
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
    .filter((user) => !isPrivileged(user.role));
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
  const parsed = parse(userUpdateSchema, body);
  if (!parsed.ok) return invalid(parsed.message);

  const { id, ...fields } = parsed.data;

  const existing = await getTableRow('profiles', {
    select: 'id,email,role',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) return userNotFound();

  if (isPrivileged(existing.role)) {
    return {
      error: {
        status: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'Não é permitido editar usuário admin por este endpoint.',
      },
    };
  }

  // O schema já rejeitou role fora de ASSIGNABLE_ROLES — promover a admin por
  // aqui seria escalada de privilégio, já que a autorização do painel é
  // decidida por `profiles.role`.
  const payload = {};
  if (fields.name !== undefined) payload.display_name = fields.name;
  if (fields.role !== undefined) payload.role = fields.role;
  if (fields.provider !== undefined) payload.provider = fields.provider;

  await updateTable('profiles', { id: `eq.${id}` }, payload);
  return { status: 200, body: {} };
}

async function deleteUser(rawId) {
  const parsed = parse(uuidId, rawId);
  if (!parsed.ok) return invalid('id é obrigatório.');

  const id = parsed.data;
  const existing = await getTableRow('profiles', {
    select: 'id,email,role',
    filters: [{ column: 'id', value: id }],
  });

  if (!existing) return userNotFound();

  if (isPrivileged(existing.role)) {
    return {
      error: {
        status: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'Não é permitido excluir usuário admin por este endpoint.',
      },
    };
  }

  await deleteFromTable('profiles', { id: `eq.${id}` });
  return { status: 200, body: {} };
}

module.exports = createAdminResourceHandler({
  targetType: 'user',
  errorMessage: 'Erro ao carregar usuários do admin.',
  loggerName: 'admin-users',
  handlerName: 'adminUsersHandler',
  operations: {
    GET: async () => ({ status: 200, body: { users: await listUsers() } }),
    PUT: (req) => updateUser(req.body || {}),
    DELETE: (req) => deleteUser(String(req.query?.id || req.body?.id || '').trim()),
  },
});
