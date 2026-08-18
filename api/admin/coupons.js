// ════════════════════════════════════════════════════════════════════
// CRUD de cupons pelo painel admin. Antes (pendência §3.4) os cupons só
// existiam via SQL bruto. A validação no checkout continua em
// /api/validate-coupon (service role); este endpoint é a gestão.
// applies_to (restrição por produto/categoria) é preservado mas ainda
// não editável pela UI — defaults para {} (vale para tudo).
// ════════════════════════════════════════════════════════════════════

const { createAdminResourceHandler } = require('../../lib/admin-resource-handler');
const {
  serviceRoleHelpers: { deleteFromTable, getTableRow, insertIntoTable, listTableRows, updateTable },
} = require('../../lib/supabase');
const { ERROR_CODES } = require('../../lib/http');
const { parse } = require('../../validation');
const { bigintId, couponCreateSchema } = require('../../validation/admin.schemas');

const SELECT_FIELDS =
  'id,code,discount_type,discount_value,valid_from,valid_until,max_uses,used_count,min_order_amount,applies_to,active,created_at';

const EDITABLE_FIELDS =
  'id,code,discount_type,discount_value,valid_from,valid_until,max_uses,min_order_amount,applies_to,active';

/** Erro de validação no formato que a factory despacha por `fail()`. */
function invalid(message) {
  return { error: { status: 400, code: ERROR_CODES.VALIDATION_FAILED, message } };
}

function codeConflict() {
  return {
    error: {
      status: 409,
      code: ERROR_CODES.CONFLICT,
      message: 'Já existe um cupom com esse código.',
    },
  };
}

/**
 * Funde o corpo recebido com a linha existente ANTES de validar.
 *
 * A ordem importa e é a mesma de antes: num PUT parcial, o que não veio no
 * corpo é herdado do cupom gravado, e só então o conjunto inteiro passa pelo
 * schema. Validar o corpo isolado rejeitaria uma edição só de `active` por
 * "código obrigatório".
 */
function mergeCouponInput(body = {}, existing = {}) {
  const pick = (key, fromBody, fromExisting) =>
    Object.hasOwn(body, key) ? fromBody : fromExisting;

  return {
    code: body.code ?? existing.code,
    discountType: body.discountType ?? existing.discount_type ?? 'percent',
    discountValue: body.discountValue ?? existing.discount_value ?? 0,
    validFrom: pick('validFrom', body.validFrom, existing.valid_from ?? null),
    validUntil: pick('validUntil', body.validUntil, existing.valid_until ?? null),
    maxUses: pick('maxUses', body.maxUses, existing.max_uses ?? null),
    minOrderAmount: pick('minOrderAmount', body.minOrderAmount, existing.min_order_amount ?? null),
    active: Object.hasOwn(body, 'active') ? Boolean(body.active) : existing.active !== false,
  };
}

/** Linha a persistir, a partir do payload já validado pelo schema. */
function toCouponRow(data, existing = {}) {
  return {
    code: data.code,
    discount_type: data.discountType || 'percent',
    discount_value: data.discountValue,
    valid_from: data.validFrom ?? null,
    valid_until: data.validUntil ?? null,
    max_uses: data.maxUses != null ? Math.max(0, Math.floor(data.maxUses)) : null,
    min_order_amount: data.minOrderAmount != null ? Math.max(0, data.minOrderAmount) : null,
    active: data.active !== false,
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

async function listCoupons() {
  const rows = await listTableRows('coupons', {
    select: SELECT_FIELDS,
    orderBy: 'created_at',
    ascending: false,
  });
  return rows.map(toCouponView);
}

async function createCoupon(body) {
  const parsed = parse(couponCreateSchema, mergeCouponInput(body));
  if (!parsed.ok) return invalid(parsed.message);

  const payload = toCouponRow(parsed.data);

  const existing = await getTableRow('coupons', {
    select: 'id',
    filters: [{ column: 'code', value: payload.code }],
  });
  if (existing) return codeConflict();

  const [created] = await insertIntoTable('coupons', payload);
  return { status: 201, body: { id: String(created.id) } };
}

async function updateCoupon(body = {}) {
  // `coupons.id` é bigint identity, e não uuid como os outros quatro recursos
  // (supabase/schema.sql:208). Ver a nota em validation/admin.schemas.js.
  const parsedId = parse(bigintId, body.id);
  if (!parsedId.ok) return invalid('id é obrigatório.');

  const id = parsedId.data;
  const existing = await getTableRow('coupons', {
    select: EDITABLE_FIELDS,
    filters: [{ column: 'id', value: id }],
  });
  if (!existing) {
    return {
      error: { status: 404, code: ERROR_CODES.NOT_FOUND, message: 'Cupom não encontrado.' },
    };
  }

  const parsed = parse(couponCreateSchema, mergeCouponInput(body, existing));
  if (!parsed.ok) return invalid(parsed.message);

  const payload = toCouponRow(parsed.data, existing);

  if (payload.code !== existing.code) {
    const clash = await getTableRow('coupons', {
      select: 'id',
      filters: [{ column: 'code', value: payload.code }],
    });
    if (clash && String(clash.id) !== id) return codeConflict();
  }

  await updateTable('coupons', { id: `eq.${id}` }, payload);
  return { status: 200, body: {} };
}

async function deleteCoupon(rawId) {
  const parsed = parse(bigintId, rawId);
  if (!parsed.ok) return invalid('id é obrigatório.');

  await deleteFromTable('coupons', { id: `eq.${parsed.data}` });
  return { status: 200, body: {} };
}

module.exports = createAdminResourceHandler({
  targetType: 'coupon',
  errorMessage: 'Erro ao processar cupons do admin.',
  loggerName: 'admin-coupons',
  handlerName: 'adminCouponsHandler',
  operations: {
    GET: async () => ({ status: 200, body: { coupons: await listCoupons() } }),
    POST: (req) => createCoupon(req.body || {}),
    PUT: (req) => updateCoupon(req.body || {}),
    DELETE: (req) => deleteCoupon(String(req.query?.id || req.body?.id || '').trim()),
  },
});
