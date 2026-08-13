const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { getSupabaseConfig } = require('./supabase');

function createSupabaseAdminClient() {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildProvisionRedirectUrl() {
  const explicit = String(process.env.CUSTOMER_PASSWORD_SETUP_REDIRECT || '').trim();
  if (explicit) {
    return explicit;
  }

  const appUrl = String(process.env.APP_URL || 'http://localhost:5173')
    .trim()
    .replace(/\/+$/, '');
  return `${appUrl}/login?mode=login`;
}

function generateHighEntropyPassword(length = 32) {
  const bytes = crypto.randomBytes(length);
  const base = bytes.toString('base64url');

  // Ensure mixed classes for strong policy compatibility.
  const suffix = 'Aa1!';
  return `${base}${suffix}`;
}

async function findUserByEmail(admin, email) {
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find(
      (user) => String(user.email || '').toLowerCase() === email.toLowerCase(),
    );
    if (found) {
      return found;
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

async function createUserWithRandomPassword(admin, { email, name }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: generateHighEntropyPassword(),
    email_confirm: true,
    user_metadata: {
      full_name: String(name || '').trim(),
      name: String(name || '').trim(),
    },
  });

  if (error) {
    throw error;
  }

  return data?.user || null;
}

async function sendPasswordSetupEmail(admin, email) {
  const redirectTo = buildProvisionRedirectUrl();

  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw error;
  }
}

async function ensureCustomerAccountFromCheckout({ email, name }) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalizedEmail) {
    return { skipped: true, reason: 'missing-email' };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error('Supabase admin config missing');
  }

  const existingUser = await findUserByEmail(admin, normalizedEmail);
  if (existingUser) {
    return {
      created: false,
      emailDispatched: false,
      userId: existingUser.id,
    };
  }

  const createdUser = await createUserWithRandomPassword(admin, {
    email: normalizedEmail,
    name,
  });

  await sendPasswordSetupEmail(admin, normalizedEmail);

  return {
    created: true,
    emailDispatched: true,
    userId: createdUser?.id || null,
  };
}

module.exports = {
  ensureCustomerAccountFromCheckout,
};
