const { ensureAdminSession, setAdminCorsHeaders } = require('../../lib/admin-session');
const { logAdminAction } = require('../../lib/admin-audit');
const { ERROR_CODES, fail, methodNotAllowed, preflight } = require('../../lib/http');
const { createLogger } = require('../../lib/logger');

const log = createLogger('admin-coupons');
const {
  getSupabaseConfig,
  serviceRoleHelpers: { deleteFromTable, getTableRow, insertIntoTable, listTableRows, updateTable },
} = require('../../lib/supabase');

// ════════════════════════════════════════════════════════════════════
// CRUD de cupons pelo painel admin. Antes (pendência §3.4) os cupons só
// existiam via SQL bruto. A validação no checkout continua em
// /api/validate-coupon (service role); este endpoint é a gestão.
// applies_to (restrição por produto/categoria) é preservado mas ainda
// não editável pela UI — defaults para {} (vale para tudo).
// ════════════════════════════════════════════════════════════════════

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replaceAll(/\s+/g, '')
    .slice(0, 64);
}

function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseOptionalDate(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Data de validade inválida.');
  }
  return date.toISOString();
}

function toCouponPayload(body = {}, existing = {}) {
  const code = normalizeCode(body.code ?? existing.code);
  if (!code) {
    throw new Error('Código do cupom é obrigatório.');
  }
  if (code.length < 3) {
    throw new Error('Código deve ter ao menos 3 caracteres.');
  }
  if (!/^[A-Z0-9._-]+$/.test(code)) {
    throw new Error('Código só pode ter letras, números, ponto, hífen e underscore.');
  }

  const discountType = String(body.discountType ?? existing.discount_type ?? 'percent').trim();
  if (!['percent', 'fixed'].includes(discountType)) {
    throw new Error('Tipo de desconto deve ser percentual ou valor fixo.');
  }

  const discountValue = Number(body.discountValue ?? existing.discount_value ?? 0);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error('Valor do desconto deve ser maior que zero.');
  }
  if (discountType === 'percent' && discountValue > 100) {
    throw new Error('Desconto percentual não pode passar de 100%.');
  }

  const maxUses = Object.hasOwn(body, 'maxUses')
    ? parseOptionalNumber(body.maxUses)
    : (existing.max_uses ?? null);
  const minOrderAmount = Object.hasOwn(body, 'minOrderAmount')
    ? parseOptionalNumber(body.minOrderAmount)
    : (existing.min_order_amount ?? null);
  const validUntil = Object.hasOwn(body, 'validUntil')
    ? parseOptionalDate(body.validUntil)
    : (existing.valid_until ?? null);
  const validFrom = Object.hasOwn(body, 'validFrom')
    ? parseOptionalDate(body.validFrom)
    : (existing.valid_from ?? null);

  return {
    code,
    discount_type: discountType,
    discount_value: discountValue,
    valid_from: validFrom,
    valid_until: validUntil,
    max_uses: maxUses != null ? Math.max(0, Math.floor(maxUses)) : null,
    min_order_amount: minOrderAmount != null ? Math.max(0, minOrderAmount) : null,
    active: Object.hasOwn(body, 'active') ? Boolean(body.active) : existing.active !== false,
    applies_to: existing.applies_to ?? {},
  };
}

function toCouponView(row) {
  return {
    id: String(row.id),
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value || 0),
    validFrom: row.valid_from ?? null,
    validUntil: row.valid_until ?? null,
    maxUses: row.max_uses ?? null,
    usedCount: Number(row.used_count || 0),
    minOrderAmount: row.min_order_amount ?? null,
    appliesTo: row.applies_to || {},
    active: row.active !== false,
    createdAt: row.created_at,
  };
}

const SELECT_FIELDS =
  'id,code,discount_type,discount_value,valid_from,valid_until,max_uses,used_count,min_order_amount,applies_to,active,created_at';

async function listCoupons() {
  const rows = await listTableRows('coupons', {
    select: SELECT_FIELDS,
    orderBy: 'created_at',
    ascending: false,
  });
  return rows.map(toCouponView);
}

async function createCoupon(body) {
  let payload;
  try {
    payload = toCouponPayload(body);
  } catch (err) {
    return { status: 400, body: { success: false, error: err.message } };
  }

  const existing = await getTableRow('coupons', {
    select: 'id',
    filters: [{ column: 'code', value: payload.code }],
  });
  if (existing) {
    return { status: 409, body: { success: false, error: 'Já existe um cupom com esse código.' } };
  }

  const [created] = await insertIntoTable('coupons', payload);
  return { status: 201, body: { success: true, id: String(created.id) } };
}

async function updateCoupon(body) {
  const id = String(body.id || '').trim();
  if (!id) {
    return { status: 400, body: { success: false, error: 'id é obrigatório.' } };
  }

  const existing = await getTableRow('coupons', {
    select:
      'id,code,discount_type,discount_value,valid_from,valid_until,max_uses,min_order_amount,applies_to,active',
    filters: [{ column: 'id', value: id }],
  });
  if (!existing) {
    return { status: 404, body: { success: false, error: 'Cupom não encontrado.' } };
  }

  let payload;
  try {
    payload = toCouponPayload(body, existing);
  } catch (err) {
    return { status: 400, body: { success: false, error: err.message } };
  }

  if (payload.code !== existing.code) {
    const clash = await getTableRow('coupons', {
      select: 'id',
      filters: [{ column: 'code', value: payload.code }],
    });
    if (clash && String(clash.id) !== id) {
      return {
        status: 409,
        body: { success: false, error: 'Já existe um cupom com esse código.' },
      };
    }
  }

  await updateTable('coupons', { id: `eq.${id}` }, payload);
  return { status: 200, body: { success: true } };
}

async function deleteCoupon(id) {
  if (!id) {
    return { status: 400, body: { success: false, error: 'id é obrigatório.' } };
  }
  await deleteFromTable('coupons', { id: `eq.${id}` });
  return { status: 200, body: { success: true } };
}

module.exports = async function adminCouponsHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const handlers = {
      GET: async () => ({ status: 200, body: { success: true, coupons: await listCoupons() } }),
      POST: async () => createCoupon(req.body || {}),
      PUT: async () => updateCoupon(req.body || {}),
      DELETE: async () => deleteCoupon(String(req.query?.id || req.body?.id || '').trim()),
    };

    const handler = handlers[req.method];
    if (!handler) {
      return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
    }

    const result = await handler();

    // Auditoria de escrita (regra I1) — best-effort.
    if (result.status >= 200 && result.status < 300 && req.method !== 'GET') {
      const actionByMethod = { POST: 'create', PUT: 'update', PATCH: 'patch', DELETE: 'delete' };
      await logAdminAction({
        req,
        action: actionByMethod[req.method] || String(req.method).toLowerCase(),
        targetType: 'coupon',
        targetId:
          req.method === 'DELETE'
            ? String(req.query?.id || req.body?.id || '').trim()
            : (req.body?.id ?? result.body?.id ?? null),
        after: req.method === 'DELETE' ? null : req.body || null,
      });
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao processar cupons do admin.',
    });
  }
};
