import { apiRequest, errorMessageOf } from '../utils/api';

/**
 * Inscrição na newsletter com double opt-in (regra C2).
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} [params.source]       de onde veio (home, rodapé, produto…)
 * @param {object} [params.attribution]  payload de atribuição já montado
 * @returns {Promise<{ok: boolean, alreadyConfirmed?: boolean, message?: string, code?: string|null}>}
 */
export async function subscribeToNewsletter({ email, source, attribution }) {
  const { data } = await apiRequest('/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email || '').trim(), source, attribution }),
  });

  if (!data.success) {
    return {
      ok: false,
      message: errorMessageOf(data) || 'Não foi possível inscrever agora.',
      code: data.error?.code || null,
    };
  }

  return { ok: true, alreadyConfirmed: data.alreadyConfirmed === true };
}
