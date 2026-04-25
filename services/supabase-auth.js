const { createClient } = require('@supabase/supabase-js');

let cachedAnonClient = null;
let cachedAdminClient = null;

function getSupabaseUrl() {
  return process.env.SUPABASE_URL;
}

function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY;
}

function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function buildClient(key) {
  return createClient(getSupabaseUrl(), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getAnonClient() {
  if (!cachedAnonClient) {
    const url = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    if (!url || !anonKey) {
      return null;
    }
    cachedAnonClient = buildClient(anonKey);
  }
  return cachedAnonClient;
}

function getAdminClient() {
  if (!cachedAdminClient) {
    const url = getSupabaseUrl();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!url || !serviceRoleKey) {
      return null;
    }
    cachedAdminClient = buildClient(serviceRoleKey);
  }
  return cachedAdminClient;
}

async function getProfileRoleByUserId(userId) {
  const admin = getAdminClient();
  if (!admin) {
    return null;
  }

  const primaryResult = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!primaryResult.error && primaryResult.data?.role) {
    return primaryResult.data.role;
  }

  const secondaryResult = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (!secondaryResult.error && secondaryResult.data?.role) {
    return secondaryResult.data.role;
  }

  return null;
}

module.exports = {
  getAnonClient,
  getAdminClient,
  getProfileRoleByUserId,
};
