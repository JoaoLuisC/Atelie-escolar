const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { getSupabaseConfig, supabaseRequest } = require('./supabase');
const { createLogger } = require('./logger');

const log = createLogger('customer-account-provisioning');

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

/**
 * Encontra o usuário pelo e-mail — por CONSULTA INDEXADA, não por varredura.
 *
 * ── O QUE ESTAVA ERRADO (§2.3.b) ────────────────────────────────────
 * Isto paginava a Admin API: `listUsers({ page, perPage: 200 })` num
 * `while (page <= 10)`, filtrando em memória. Até DEZ chamadas sequenciais
 * para achar um endereço — e isto roda DENTRO do webhook de pagamento, no
 * caminho de provisionar a conta de quem acabou de comprar.
 *
 * Pior que a latência, havia um TETO: passando de 2.000 usuários a função
 * devolvia `null` para quem existe, e o chamador seguia para criar a conta
 * duplicada. Falha por crescimento, em silêncio, exatamente quando a loja dá
 * certo.
 *
 * Agora: uma chamada à função `find_profile_id_by_email`, apoiada no índice
 * `profiles(lower(email))` (migration 20260818000000). A função existe em vez
 * de um filtro do PostgREST por duas razões escritas na própria migration —
 * `email=eq.<valor>` não usaria o índice funcional, e `ilike` traria de volta
 * o problema de metacaractere (`_` e `%` de um e-mail viram curinga) que a
 * rodada de hardening já pagou uma vez.
 *
 * ⚠️ FALLBACK DELIBERADAMENTE AUSENTE. Se a conta existe em `auth.users` mas
 * não tem linha em `profiles` (falha do trigger `handle_new_user`), esta
 * função devolve `null` e o chamador tenta criar — e recebe erro do Supabase,
 * porque o e-mail já existe. É o comportamento correto: falhar visível é
 * melhor do que voltar à varredura de 2.000 linhas para cobrir um caso raro. O
 * `log.warn` abaixo é o que torna esse caso diagnosticável.
 */
async function findUserByEmail(admin, email) {
  let profileId = null;

  try {
    profileId = await supabaseRequest('rpc/find_profile_id_by_email', {
      method: 'POST',
      useServiceRole: true,
      body: JSON.stringify({ p_email: email }),
    });
  } catch (error) {
    // Falha de consulta NÃO pode virar "não existe": isso criaria conta
    // duplicada. Propaga — o chamador está dentro de um try/catch que registra
    // e segue sem provisionar.
    log.error('busca_de_perfil_falhou', { reason: error?.message || String(error) });
    throw error;
  }

  if (!profileId) {
    return null;
  }

  const { data, error } = await admin.auth.admin.getUserById(String(profileId));
  if (error) {
    throw error;
  }

  if (!data?.user) {
    // Perfil sem usuário correspondente: linha órfã em `profiles`. Raro, e o
    // caminho seguinte (criar conta) vai falhar com "e-mail já existe" — logar
    // é o que permite descobrir por quê.
    log.warn('perfil_sem_usuario_correspondente', { profile_id: String(profileId) });
    return null;
  }

  return data.user;
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
