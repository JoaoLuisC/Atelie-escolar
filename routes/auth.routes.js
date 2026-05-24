const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth.middleware');
const { getProfileRoleByUserId } = require('../services/supabase-auth');

async function resolveProfileRole(userId) {
  try {
    const role = await getProfileRoleByUserId(userId);
    return String(role || '').trim().toLowerCase();
  } catch {
    return '';
  }
}
const {
  clearCustomerSessionCookie,
  getCustomerSessionFromRequest,
  setCustomerSessionCookie,
} = require('../lib/customer-session');

const router = express.Router();

const invalidCredentialsMessage = 'Credenciais invalidas.';

const customerLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: invalidCredentialsMessage,
  },
});

function getSupabaseAuthConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
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

  const response = await fetch(`${config.url}/auth/v1/${String(pathname || '').replace(/^\/+/, '')}`, {
    ...options,
    headers: {
      apikey: config.anonKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : { message: await response.text() };

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

router.get('/auth/me', authenticate, async (req, res, next) => {
  try {
    const role = await getProfileRoleByUserId(req.auth.user.id);
    return res.status(200).json({
      success: true,
      user: {
        id: req.auth.user.id,
        email: req.auth.user.email,
        role: role || null,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/customer/login', customerLoginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(401).json({ success: false, error: 'Informe e-mail e senha.' });
    }

    const { response, data } = await supabaseAuthRequest('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok || !data?.user?.id) {
      const code = String(data?.error_code || data?.code || '').toLowerCase();
      const msg = String(data?.msg || data?.message || data?.error_description || '').toLowerCase();
      let userError = invalidCredentialsMessage;
      if (code.includes('email_not_confirmed') || msg.includes('email not confirmed')) {
        userError = 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
      } else if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
        userError = 'E-mail ou senha incorretos.';
      }
      return res.status(401).json({ success: false, error: userError });
    }

    const user = {
      uid: String(data.user.id || '').trim(),
      email: String(data.user.email || '').trim(),
      name: extractSupabaseUserName(data.user),
      role: await resolveProfileRole(data.user.id),
    };

    setCustomerSessionCookie(res, user);
    return res.status(200).json({ success: true, user });
  } catch (error) {
    return next(error);
  }
});

function mapSupabaseAuthError(data, status) {
  const code = String(data?.error_code || data?.code || '').toLowerCase();
  const message = String(data?.msg || data?.message || data?.error_description || data?.error || '').toLowerCase();

  if (status === 422 || code.includes('user_already_exists') || message.includes('already registered') || message.includes('already been registered')) {
    return 'Este e-mail já está cadastrado. Tente fazer login.';
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

router.post('/auth/customer/register', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!name) {
      return res.status(400).json({ success: false, error: 'Informe seu nome completo.' });
    }
    if (!email) {
      return res.status(400).json({ success: false, error: 'Informe um e-mail válido.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Informe uma senha.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'A senha precisa ter ao menos 8 caracteres.' });
    }

    const { response, data } = await supabaseAuthRequest('signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        data: {
          full_name: name,
          name,
        },
      }),
    });

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        error: mapSupabaseAuthError(data, response.status),
      });
    }

    if (!data?.access_token || !data?.user?.id) {
      return res.status(200).json({
        success: true,
        verificationRequired: true,
      });
    }

    const user = {
      uid: String(data.user.id || '').trim(),
      email: String(data.user.email || '').trim(),
      name: extractSupabaseUserName(data.user) || name,
      role: await resolveProfileRole(data.user.id),
    };

    setCustomerSessionCookie(res, user);
    return res.status(200).json({ success: true, user });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/customer/google/start', async (req, res, next) => {
  try {
    const config = getSupabaseAuthConfig();
    if (!config) {
      return res.status(500).json({ success: false, error: 'Auth provider indisponivel.' });
    }

    const redirect = String(req.query?.redirect || '/checkout').trim() || '/checkout';
    const callback = new URL('/login', extractOrigin(req));
    callback.searchParams.set('oauth', 'google');
    callback.searchParams.set('redirect', redirect);

    const authorizeUrl = new URL(`${config.url}/auth/v1/authorize`);
    authorizeUrl.searchParams.set('provider', 'google');
    authorizeUrl.searchParams.set('redirect_to', callback.toString());

    return res.redirect(authorizeUrl.toString());
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/customer/google/callback', async (req, res, next) => {
  try {
    const accessToken = String(req.body?.accessToken || '').trim();
    if (!accessToken) {
      return res.status(401).json({ success: false, error: invalidCredentialsMessage });
    }

    const { response, data } = await supabaseAuthRequest('user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok || !data?.id) {
      return res.status(401).json({ success: false, error: invalidCredentialsMessage });
    }

    const user = {
      uid: String(data.id || '').trim(),
      email: String(data.email || '').trim(),
      name: extractSupabaseUserName(data),
      role: await resolveProfileRole(data.id),
    };

    setCustomerSessionCookie(res, user);
    return res.status(200).json({ success: true, user });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/customer/session', async (req, res) => {
  const user = getCustomerSessionFromRequest(req);
  return res.status(200).json({
    success: true,
    authenticated: Boolean(user?.uid),
    user: user || null,
  });
});

router.post('/auth/customer/logout', async (_req, res) => {
  clearCustomerSessionCookie(res);
  return res.status(200).json({ success: true });
});

module.exports = router;
