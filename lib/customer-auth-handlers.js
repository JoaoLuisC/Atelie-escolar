// Handlers de autenticação de CLIENTE, agnósticos de runtime (Express e Vercel).
// A lógica antes vivia em routes/auth.routes.js (Express-only), o que quebrava a
// autenticação em produção na Vercel. Extraída para cá para dar PARIDADE: os
// arquivos api/auth/*.js (funções Vercel) e o routes/auth.routes.js montam
// exatamente estes mesmos handlers.
//
// Cada handler é `async (req, res)` e responde por conta própria (sem `next`),
// para funcionar tanto como função @vercel/node quanto sob Express.

const {
  clearCustomerSessionCookie,
  getCustomerSessionFromRequest,
  setCustomerSessionCookie,
} = require('./customer-session');
const { getProfileRoleByUserId } = require('../services/supabase-auth');
const { createLogger } = require('./logger');
const { ERROR_CODES, fail, ok } = require('./http');

const log = createLogger('customer-auth-handlers');

const INVALID_CREDENTIALS_MESSAGE = 'Credenciais inválidas.';

// Só caminho relativo same-site é aceito como destino de redirect pós-login.
// Rejeita URLs absolutas (`http://…`, `//evil.com`) e qualquer valor com
// esquema, caindo no fallback — defesa contra open redirect.
function sanitizeRelativeRedirect(value, fallback = '/') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) {
    return fallback;
  }
  return raw;
}

async function resolveProfileRole(userId) {
  try {
    const role = await getProfileRoleByUserId(userId);
    return String(role || '')
      .trim()
      .toLowerCase();
  } catch {
    return '';
  }
}

function getSupabaseAuthConfig() {
  const url = String(process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

async function supabaseAuthRequest(pathname, options = {}) {
  const config = getSupabaseAuthConfig();
  if (!config) {
    const error = new Error('Supabase auth config missing');
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(
    `${config.url}/auth/v1/${String(pathname || '').replace(/^\/+/, '')}`,
    {
      ...options,
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    },
  );

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { message: await response.text() };
  return { response, data };
}

function extractSupabaseUserName(user = {}) {
  const metadata = user?.user_metadata || {};
  return String(metadata.full_name || metadata.name || '').trim();
}

function extractOrigin(req) {
  const appUrl = String(process.env.APP_URL || '').trim();
  if (appUrl) {
    return appUrl.replace(/\/+$/, '');
  }
  const host = String(req.headers.host || '').trim();
  if (!host) {
    return 'http://localhost:5173';
  }
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  return `${protocol}://${host}`;
}

// Redirect agnóstico de runtime (res.redirect só existe no Express).
function redirectTo(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  return res.end();
}

function mapSupabaseAuthError(data, status) {
  const code = String(data?.error_code || data?.code || '').toLowerCase();
  const message = String(
    data?.msg || data?.message || data?.error_description || data?.error || '',
  ).toLowerCase();

  if (
    status === 422 ||
    code.includes('user_already_exists') ||
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    // Mensagem neutra: não confirmar se o e-mail já existe (anti-enumeração).
    return 'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.';
  }
  if (code.includes('weak_password') || message.includes('password')) {
    return 'Senha fraca. Use ao menos 8 caracteres, com letra maiúscula, minúscula e número.';
  }
  if (message.includes('invalid email') || message.includes('email address')) {
    return 'E-mail inválido. Verifique e tente novamente.';
  }
  if (message.includes('rate limit') || code.includes('over_email_send_rate_limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  return 'Não foi possível criar a conta. Verifique os dados e tente novamente.';
}

async function customerLogin(req, res) {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Informe e-mail e senha.',
      });
    }

    const { response, data } = await supabaseAuthRequest('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok || !data?.user?.id) {
      const code = String(data?.error_code || data?.code || '').toLowerCase();
      const msg = String(data?.msg || data?.message || data?.error_description || '').toLowerCase();
      // Padrão genérico para qualquer falha de credencial. A dica de "confirme
      // seu e-mail" só aparece quando o Supabase sinaliza email_not_confirmed,
      // o que ele só faz com a SENHA CORRETA — logo não vaza para quem chuta.
      let userError = 'E-mail ou senha incorretos.';
      if (code.includes('email_not_confirmed') || msg.includes('email not confirmed')) {
        userError = 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
      }
      return fail(res, {
        status: 401,
        code: ERROR_CODES.CREDENTIALS_INVALID,
        message: userError,
      });
    }

    const user = {
      uid: String(data.user.id || '').trim(),
      email: String(data.user.email || '').trim(),
      name: extractSupabaseUserName(data.user),
      role: await resolveProfileRole(data.user.id),
    };

    setCustomerSessionCookie(res, user);
    return ok(res, { user });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao autenticar.',
    });
  }
}

async function customerRegister(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!name) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Informe seu nome completo.',
      });
    }
    if (!email) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Informe um e-mail válido.',
      });
    }
    if (!password) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Informe uma senha.',
      });
    }
    if (password.length < 8) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'A senha precisa ter ao menos 8 caracteres.',
      });
    }

    const { response, data } = await supabaseAuthRequest('signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        data: { full_name: name, name },
      }),
    });

    if (!response.ok) {
      // O código vem do MAPEAMENTO, não do status: o Supabase devolve 400 tanto
      // para "e-mail já cadastrado" quanto para "senha fraca", e o cliente
      // precisa distinguir os dois sem ler português.
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: mapSupabaseAuthError(data, response.status),
      });
    }

    if (!data?.access_token || !data?.user?.id) {
      return ok(res, { verificationRequired: true });
    }

    const user = {
      uid: String(data.user.id || '').trim(),
      email: String(data.user.email || '').trim(),
      name: extractSupabaseUserName(data.user) || name,
      role: await resolveProfileRole(data.user.id),
    };

    setCustomerSessionCookie(res, user);
    return ok(res, { user });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao criar conta.',
    });
  }
}

async function customerGoogleStart(req, res) {
  try {
    const config = getSupabaseAuthConfig();
    if (!config) {
      return fail(res, {
        status: 503,
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Auth provider indisponível.',
      });
    }

    const redirect = sanitizeRelativeRedirect(req.query?.redirect, '/checkout');
    const callback = new URL('/login', extractOrigin(req));
    callback.searchParams.set('oauth', 'google');
    callback.searchParams.set('redirect', redirect);

    const authorizeUrl = new URL(`${config.url}/auth/v1/authorize`);
    authorizeUrl.searchParams.set('provider', 'google');
    authorizeUrl.searchParams.set('redirect_to', callback.toString());

    return redirectTo(res, authorizeUrl.toString());
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao iniciar login com Google.',
    });
  }
}

async function customerGoogleCallback(req, res) {
  try {
    const accessToken = String(req.body?.accessToken || '').trim();
    if (!accessToken) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.CREDENTIALS_INVALID,
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    }

    const { response, data } = await supabaseAuthRequest('user', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok || !data?.id) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.CREDENTIALS_INVALID,
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    }

    const user = {
      uid: String(data.id || '').trim(),
      email: String(data.email || '').trim(),
      name: extractSupabaseUserName(data),
      role: await resolveProfileRole(data.id),
    };

    setCustomerSessionCookie(res, user);
    return ok(res, { user });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao concluir login com Google.',
    });
  }
}

async function customerSession(req, res) {
  const user = getCustomerSessionFromRequest(req);
  return ok(res, { authenticated: Boolean(user?.uid), user: user || null });
}

async function customerLogout(_req, res) {
  clearCustomerSessionCookie(res);
  return ok(res);
}

module.exports = {
  customerLogin,
  customerRegister,
  customerGoogleStart,
  customerGoogleCallback,
  customerSession,
  customerLogout,
};
