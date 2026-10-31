const {
  getCustomerSessionFromRequest,
  setCustomerSessionCookie,
} = require('../lib/customer-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, updateTable },
} = require('../lib/supabase');
const { enforceRateLimit } = require('../lib/rate-limit');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');

const PROFILE_LIMIT = Object.freeze({
  bucket: 'me-profile',
  limit: 20,
  windowSeconds: 10 * 60,
  message: 'Muitas alterações de perfil. Aguarde alguns minutos.',
});

module.exports = async function meProfileHandler(req, res) {
  if (guardMethod(req, res, ['GET', 'PUT'])) return;
  const session = getCustomerSessionFromRequest(req);
  if (!session?.uid) {
    return fail(res, {
      status: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Entre na sua conta.',
    });
  }
  const gate = await enforceRateLimit(req, res, PROFILE_LIMIT);
  if (gate.blocked) return;
  if (!getSupabaseConfig()) {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Serviço indisponível.',
    });
  }

  try {
    if (req.method === 'GET') {
      const profile = await getTableRow('profiles', {
        select: 'display_name,email',
        filters: [{ column: 'id', value: session.uid }],
      });
      return ok(res, { user: { ...session, name: profile?.display_name || session.name } });
    }

    const name = String(req.body?.name || '')
      .replaceAll(/\s+/g, ' ')
      .trim();
    if (name.length < 2 || name.length > 120) {
      return fail(res, {
        status: 400,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Informe um nome entre 2 e 120 caracteres.',
      });
    }
    const updated = await updateTable(
      'profiles',
      { id: `eq.${session.uid}` },
      { display_name: name, updated_at: new Date().toISOString() },
    );
    // Sem linha atualizada, o nome iria só para o cookie e sumiria no próximo
    // login: melhor dizer que não salvou.
    if (Array.isArray(updated) && updated.length === 0) {
      return fail(res, {
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Não encontramos seu perfil. Saia e entre de novo na sua conta.',
      });
    }
    const user = { ...session, name };
    setCustomerSessionCookie(res, user);
    return ok(res, { user });
  } catch {
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível salvar seu perfil.',
    });
  }
};
