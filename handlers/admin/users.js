const { createAdminResourceHandler } = require('../../lib/admin-resource-handler');
const {
  serviceRoleHelpers: { deleteFromTable, getTableRow, listTableRows, updateTable },
} = require('../../lib/supabase');
const { ERROR_CODES } = require('../../lib/http');
const { getAdminClient } = require('../../services/supabase-auth');
const { parse } = require('../../validation');
const { userUpdateSchema, uuidId } = require('../../validation/admin.schemas');

const PRIVILEGED_ROLES = new Set(['admin', 'master']);

// ~100 anos: o GoTrue não tem ban "permanente", só duração.
const REVOKE_BAN_DURATION = '876000h';

/** Erro de validação no formato que a factory despacha por `fail()`. */
function invalid(message) {
  return { error: { status: 400, code: ERROR_CODES.VALIDATION_FAILED, message } };
}

function userNotFound() {
  return {
    error: { status: 404, code: ERROR_CODES.NOT_FOUND, message: 'Usuário não encontrado.' },
  };
}

// O banco grava papéis em MAIÚSCULAS ('CUSTOMER', ver supabase/schema.sql) e a
// constraint `check_valid_role` de produção recusa a forma minúscula: o schema
// normaliza para minúsculas (e aceita sinônimos em português), e era esse valor
// cru que ia para o UPDATE — todo "trocar papel" dava 500 (ACH-02 de 05/10).
// Quem LÊ o papel compara sem caixa (isPrivileged, admin/login.js), então só a
// escrita precisa da forma canônica.
const DB_ROLE_BY_ASSIGNABLE = Object.freeze({
  customer: 'CUSTOMER',
  cliente: 'CUSTOMER',
  seller: 'SELLER',
  vendedor: 'SELLER',
});

// 23514 = check_violation. Se o banco recusar o papel (constraint de produção
// sem SELLER, por exemplo), é um 400 com o motivo, não um 500 genérico.
function isCheckViolation(error) {
  return error?.details?.code === '23514';
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
  if (fields.role !== undefined) payload.role = DB_ROLE_BY_ASSIGNABLE[fields.role];
  if (fields.provider !== undefined) payload.provider = fields.provider;

  try {
    await updateTable('profiles', { id: `eq.${id}` }, payload);
  } catch (error) {
    if (isCheckViolation(error)) {
      return invalid('O banco recusou este papel para o usuário. Nada foi alterado.');
    }
    throw error;
  }
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

  // REVOGAR = impedir o login, não só sumir da lista (ACH-07 de 05/10). Apagar
  // só `profiles` deixava a conta de auth.users intacta: a pessoa continuava
  // entrando (sem papel), e o próximo checkout com o mesmo e-mail falhava ao
  // provisionar ("e-mail já existe"). O ban vem ANTES e falha fechado — sem ele,
  // nada é apagado. Não usamos deleteUser: ele é irreversível e cascateia
  // (user_products, orders.customer_id), e os pedidos da pessoa precisam ficar.
  // Sessões já abertas (cookie de 8h, lib/customer-session.js) expiram sozinhas.
  const admin = getAdminClient();
  if (!admin) {
    throw new Error('Supabase Admin API não configurada');
  }
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: REVOKE_BAN_DURATION,
  });
  // Perfil órfão (sem usuário em auth) não tem login a bloquear: segue.
  if (banError && !/not\s*found/i.test(String(banError.message || ''))) {
    throw banError;
  }

  await deleteFromTable('profiles', { id: `eq.${id}` });
  return { status: 200, body: {} };
}

module.exports = createAdminResourceHandler({
  targetType: 'user',
  errorMessage: {
    GET: 'Erro ao carregar usuários do admin.',
    PUT: 'Erro ao salvar o usuário.',
    DELETE: 'Erro ao revogar o acesso do usuário.',
    default: 'Erro ao processar usuários do admin.',
  },
  loggerName: 'admin-users',
  handlerName: 'adminUsersHandler',
  operations: {
    GET: async () => ({ status: 200, body: { users: await listUsers() } }),
    PUT: (req) => updateUser(req.body || {}),
    DELETE: (req) => deleteUser(String(req.query?.id || req.body?.id || '').trim()),
  },
});
