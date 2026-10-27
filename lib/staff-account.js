// ════════════════════════════════════════════════════════════════════
// TROCA DE SENHA E DE E-MAIL pela aba "Minha conta" (handlers/teacher/account.js).
//
// As duas pedem a SENHA ATUAL: a sessão do painel dura 8h, e quem achar o
// computador aberto não pode trocar a senha nem levar a conta para outro
// e-mail. A conferência é um login de verdade no Supabase Auth.
//
//   • senha — troca na hora (Admin API, depois da conferência);
//   • e-mail — pedida em nome da própria pessoa (`updateUser` com a sessão
//     do login de conferência): o Supabase manda o link de confirmação e o
//     e-mail só muda depois do clique. Um endereço digitado errado não tranca
//     ninguém fora. O perfil acompanha pelo trigger on_auth_user_email_changed.
//
// Cada conferência usa um cliente Supabase NOVO: o cliente anônimo
// compartilhado guardaria em memória a sessão de quem acabou de entrar.
// ════════════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');
const { getAdminClient } = require('../services/supabase-auth');

const PASSWORD_RULE_MESSAGE =
  'A senha nova precisa ter ao menos 8 caracteres, com letra maiúscula, minúscula e número.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function accountError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isStrongPassword(password) {
  const value = String(password || '');
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

function freshClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** E-mail e forma de login atuais, direto do Supabase Auth. */
async function loadAuthUser(userId) {
  const admin = getAdminClient();
  if (!admin) throw accountError('Configuração do Supabase indisponível.', 500);
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw accountError('Conta não encontrada.', 404);
  const providers = data.user.app_metadata?.providers || [data.user.app_metadata?.provider];
  return { user: data.user, hasPassword: providers.includes('email') };
}

/** Confere a senha atual com um login de verdade. Devolve o cliente já logado. */
async function verifyCurrentPassword(email, currentPassword) {
  if (!currentPassword) throw accountError('Digite a sua senha atual.');
  const client = freshClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: String(currentPassword),
  });
  if (error || !data?.session) {
    // 400, não 401: 401 o painel lê como "sessão expirada" e manda para o login.
    const wrong = accountError('A senha atual não confere.');
    wrong.reauthFailed = true;
    throw wrong;
  }
  return client;
}

async function changePassword(userId, { currentPassword, newPassword }) {
  if (!isStrongPassword(newPassword)) throw accountError(PASSWORD_RULE_MESSAGE);
  if (String(newPassword) === String(currentPassword)) {
    throw accountError('A senha nova precisa ser diferente da atual.');
  }
  const { user, hasPassword } = await loadAuthUser(userId);
  if (!hasPassword) {
    throw accountError(
      'Sua conta entra pelo Google e ainda não tem senha. Use "Enviar link para criar senha".',
    );
  }
  const client = await verifyCurrentPassword(user.email, currentPassword);
  await client.auth.signOut({ scope: 'local' }).catch(() => {});

  const { error } = await getAdminClient().auth.admin.updateUserById(userId, {
    password: String(newPassword),
  });
  if (error) throw accountError('Não foi possível trocar a senha agora. Tente de novo.', 502);
}

async function changeEmail(userId, { currentPassword, newEmail }, { redirectTo } = {}) {
  const email = String(newEmail || '')
    .trim()
    .toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw accountError('Digite um e-mail válido.');
  }
  const { user, hasPassword } = await loadAuthUser(userId);
  if (email === String(user.email || '').toLowerCase()) {
    throw accountError('Esse já é o e-mail da sua conta.');
  }
  if (!hasPassword) {
    throw accountError('Sua conta entra pelo Google: o e-mail é o da sua conta Google.');
  }

  const client = await verifyCurrentPassword(user.email, currentPassword);
  const { error } = await client.auth.updateUser(
    { email },
    redirectTo ? { emailRedirectTo: redirectTo } : {},
  );
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
  if (error) {
    const taken = /already|registered|exists/i.test(error.message || '');
    throw accountError(
      taken
        ? 'Esse e-mail já é usado por outra conta.'
        : 'Não foi possível pedir a troca de e-mail agora.',
      taken ? 409 : 502,
    );
  }
  return { pendingEmail: email };
}

module.exports = { PASSWORD_RULE_MESSAGE, changeEmail, changePassword, isStrongPassword };
