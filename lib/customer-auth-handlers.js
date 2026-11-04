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
const { getProfileByUserId, getProfileRoleByUserId } = require('../services/supabase-auth');
const { createLogger } = require('./logger');
const { ERROR_CODES, fail, ok } = require('./http');
const { PASSWORD_RULE_MESSAGE, isStrongPassword } = require('./password-policy');

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

async function resolveCustomerIdentity(user) {
  const uid = String(user.id || '').trim();
  const email = String(user.email || '').trim();
  try {
    const profile = await getProfileByUserId(user.id);
    // Perfil existente com `role` vazio é resposta completa (cliente comum):
    // reler o papel seria uma segunda ida ao banco para a mesma linha. Só sem
    // perfil é que vale a consulta direta ao papel.
    const role = profile ? String(profile.role ?? '') : await resolveProfileRole(user.id);
    return {
      uid,
      email,
      name: String(profile?.display_name || extractSupabaseUserName(user)).trim(),
      role: role.trim().toLowerCase(),
    };
  } catch {
    return {
      uid,
      email,
      name: extractSupabaseUserName(user),
      role: await resolveProfileRole(user.id),
    };
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

/**
 * Traduz a recusa do Supabase no cadastro para `{ status, code, message }`.
 *
 * ── POR QUE DEVOLVE STATUS, E NÃO SÓ O TEXTO (LOJA-37) ──────────────
 * Tudo virava 400 "Verifique os dados", inclusive o 500 do Supabase quando o
 * ENVIO do e-mail de confirmação falha (SMTP com credencial inválida: "Error
 * sending confirmation email"). A pessoa revisava dados que estavam certos e
 * tentava de novo, sem chance de dar certo. Falha do lado de lá agora é 503
 * com texto honesto, e excesso de envio é 429 — o cliente distingue os três
 * casos pelo `code`, sem ler português (regra A2).
 */
function mapSupabaseAuthError(data, status) {
  const code = String(data?.error_code || data?.code || '').toLowerCase();
  const message = String(
    data?.msg || data?.message || data?.error_description || data?.error || '',
  ).toLowerCase();
  const invalid = (text) => ({ status: 400, code: ERROR_CODES.VALIDATION_FAILED, message: text });

  if (
    status === 422 ||
    code.includes('user_already_exists') ||
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    // Mensagem neutra: não confirmar se o e-mail já existe (anti-enumeração).
    return invalid('Não foi possível concluir o cadastro. Verifique os dados e tente novamente.');
  }
  if (
    status === 429 ||
    message.includes('rate limit') ||
    code.includes('over_email_send_rate_limit')
  ) {
    return {
      status: 429,
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    };
  }
  // Antes dos ramos de texto: "Error sending confirmation email" contém
  // "email" e cairia em "E-mail inválido" se viesse depois.
  if (status >= 500 || message.includes('error sending') || code.includes('unexpected_failure')) {
    return {
      status: 503,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message:
        'Não foi possível enviar o e-mail de confirmação agora. Seus dados estão certos — tente novamente mais tarde.',
    };
  }
  if (code.includes('weak_password') || message.includes('password')) {
    return invalid(PASSWORD_RULE_MESSAGE);
  }
  if (message.includes('invalid email') || message.includes('email address')) {
    return invalid('E-mail inválido. Verifique e tente novamente.');
  }
  return invalid('Não foi possível criar a conta. Verifique os dados e tente novamente.');
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

    const user = await resolveCustomerIdentity(data.user);

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

/**
 * Conta criada NO CHECKOUT entra logada na hora, mesmo com a confirmação de
 * e-mail ligada no Supabase — mas SEM confirmar o e-mail: `source` é um campo
 * do corpo, qualquer um manda, e confirmar sem prova de posse da caixa deixava
 * um estranho "adotar" os pedidos de convidado daquele e-mail
 * (handlers/customer-orders.js) e preparar o takeover de quem entrasse depois
 * com o Google. Em vez disso abre uma sessão PROVISÓRIA (`pending`, 1 h): dá
 * para pagar e baixar o que acabou de comprar; o e-mail de confirmação que o
 * Supabase manda no cadastro continua valendo para os próximos logins.
 *
 * O Supabase devolve um usuário "ofuscado" (sem `identities`) quando o e-mail
 * já tem conta: esse não ganha sessão nenhuma.
 */
function checkoutSignupUser(data) {
  const user = data?.user;
  if (!user?.id || !Array.isArray(user.identities) || user.identities.length === 0) return null;
  return user;
}

async function customerRegister(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const fromCheckout = String(req.body?.source || '') === 'checkout';

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
    if (!isStrongPassword(password)) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: PASSWORD_RULE_MESSAGE,
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
      // para "e-mail já cadastrado" quanto para "senha fraca", e 500 quando o
      // que falhou foi o envio do e-mail — o cliente precisa distinguir os
      // casos sem ler português.
      const mapped = mapSupabaseAuthError(data, response.status);
      if (mapped.status >= 500) {
        log.error('signup_supabase_falhou', {
          status: response.status,
          reason: String(data?.msg || data?.message || data?.code || ''),
        });
      }
      return fail(res, mapped);
    }

    let authUser = data?.access_token && data?.user?.id ? data.user : null;
    let pending = false;
    if (!authUser && fromCheckout) {
      authUser = checkoutSignupUser(data);
      pending = Boolean(authUser);
    }
    if (!authUser) {
      return ok(res, { verificationRequired: true });
    }

    const user = {
      uid: String(authUser.id || '').trim(),
      email: String(authUser.email || '').trim(),
      name: extractSupabaseUserName(authUser) || name,
      role: await resolveProfileRole(authUser.id),
      ...(pending ? { pending: true } : {}),
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

    // Padrão: Meus produtos. Quem veio do checkout manda `?redirect=/checkout`.
    const redirect = sanitizeRelativeRedirect(req.query?.redirect, '/downloads');
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

    const user = await resolveCustomerIdentity(data);

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
