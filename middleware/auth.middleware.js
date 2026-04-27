const { AppError } = require('../utils/app-error');
const { getAnonClient, getProfileRoleByUserId } = require('../services/supabase-auth');

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

function roleMatchesExpected(currentRole, expectedRole) {
  const normalizedCurrent = normalizeRole(currentRole);
  const normalizedExpected = normalizeRole(expectedRole);

  if (!normalizedCurrent || !normalizedExpected) {
    return false;
  }

  const aliases = {
    ADMIN: ['ADMIN', 'MASTER'],
    MASTER: ['MASTER', 'ADMIN'],
    SELLER: ['SELLER', 'VENDEDOR'],
    VENDEDOR: ['VENDEDOR', 'SELLER'],
    CUSTOMER: ['CUSTOMER', 'CLIENTE'],
    CLIENTE: ['CLIENTE', 'CUSTOMER'],
  };

  const expectedSet = aliases[normalizedExpected] || [normalizedExpected];
  return expectedSet.includes(normalizedCurrent);
}

function extractBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }

  const [scheme, token] = headerValue.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

async function authenticate(req, _res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return next(new AppError('Token de autenticação ausente.', 401));
    }

    const supabase = getAnonClient();
    if (!supabase) {
      return next(new AppError('Configuração de autenticação indisponível.', 500));
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return next(new AppError('Token inválido ou expirado.', 401));
    }

    req.auth = {
      token,
      user: data.user,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function checkRole(expectedRole) {
  return async function checkRoleMiddleware(req, _res, next) {
    try {
      if (!req.auth?.user?.id) {
        return next(new AppError('Usuário não autenticado.', 401));
      }

      const profileRole = await getProfileRoleByUserId(req.auth.user.id);
      if (!profileRole) {
        return next(new AppError('Perfil de acesso não encontrado.', 403));
      }

      req.auth.role = normalizeRole(profileRole);

      if (!roleMatchesExpected(profileRole, expectedRole)) {
        return next(new AppError('Acesso negado para este recurso.', 403));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  authenticate,
  checkRole,
};
