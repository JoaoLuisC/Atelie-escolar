import PropTypes from 'prop-types';
import { useState } from 'react';
import { ModalWizard } from './ModalWizard';
import { useToast } from '../hooks/useToast';

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const LABEL_CLASS = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

function emptyForm() {
  return {
    id: '',
    code: '',
    discountType: 'percent',
    discountValue: '',
    minOrderAmount: '',
    maxUses: '',
    maxUsesPerCustomer: '1',
    audience: 'all',
    eligibleEmails: '',
    purchasesRequired: '5',
    validFrom: '',
    validUntil: '',
    active: true,
  };
}

// ════════════════════════════════════════════════════════════════════
// VALIDADE DO CUPOM (ADM-39). O `<input type="date">` dá "2026-12-31"; ele ia
// cru para o servidor, que gravava 2026-12-31T00:00Z — 30/12 às 21h em São
// Paulo — e cada salvamento sem mudança encurtava a validade em um dia.
//
// As datas valem no horário de BRASÍLIA (UTC−3, sem horário de verão desde
// 2019), não no fuso de quem abre o painel: o início é 00:00 e o fim 23:59:59
// do dia escolhido. A leitura converte o instante gravado de volta para o dia
// de Brasília, então ida e volta dão o mesmo dia em qualquer computador.
// ════════════════════════════════════════════════════════════════════
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDateInputValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

export function startOfBrtDayIso(dateInputValue) {
  if (!DATE_INPUT.test(String(dateInputValue || ''))) return null;
  return new Date(`${dateInputValue}T00:00:00.000-03:00`).toISOString();
}

export function endOfBrtDayIso(dateInputValue) {
  if (!DATE_INPUT.test(String(dateInputValue || ''))) return null;
  return new Date(`${dateInputValue}T23:59:59.999-03:00`).toISOString();
}

// Mesmo alfabeto que o servidor aceita (couponCode em validation/admin.schemas.js).
// Filtrar na digitação evita que o "@" só seja recusado depois do envio (ADM-45).
function sanitizeCouponCode(value) {
  return String(value)
    .toUpperCase()
    .replaceAll(/[^A-Z0-9._-]/g, '');
}

/** Formulário a partir do cupom gravado (edição) ou vazio (novo). */
function fromCoupon(initialCoupon) {
  if (!initialCoupon) return emptyForm();
  return {
    id: initialCoupon.id || '',
    code: initialCoupon.code || '',
    discountType: initialCoupon.discountType || 'percent',
    discountValue: initialCoupon.discountValue != null ? String(initialCoupon.discountValue) : '',
    minOrderAmount:
      initialCoupon.minOrderAmount != null ? String(initialCoupon.minOrderAmount) : '',
    maxUses: initialCoupon.maxUses != null ? String(initialCoupon.maxUses) : '',
    maxUsesPerCustomer:
      initialCoupon.maxUsesPerCustomer != null ? String(initialCoupon.maxUsesPerCustomer) : '',
    audience: initialCoupon.audience || 'all',
    eligibleEmails: (initialCoupon.eligibleEmails || []).join('\n'),
    purchasesRequired:
      initialCoupon.purchasesRequired != null ? String(initialCoupon.purchasesRequired) : '5',
    validFrom: toDateInputValue(initialCoupon.validFrom),
    validUntil: toDateInputValue(initialCoupon.validUntil),
    active: initialCoupon.active !== false,
  };
}

/**
 * O limite por cliente que vai para o servidor depende do público:
 * - primeira compra: um uso por cliente por definição — o campo nem aparece;
 * - recompensa por compras: quem limita é a própria recompensa (N compras
 *   liberam um uso), então o limite fixo não se aplica;
 * - demais: o que a dona digitou (vazio = sem limite individual).
 */
export function maxUsesPerCustomerFor(formData) {
  if (formData.audience === 'new_customers') return 1;
  if (formData.audience === 'purchase_milestone') return null;
  return formData.maxUsesPerCustomer === '' ? null : Number(formData.maxUsesPerCustomer);
}

export function parseEligibleEmails(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// O estado nasce do cupom recebido e NÃO é ressincronizado por efeito: quem
// abre o wizard (CouponsTab) remonta o componente com `key` por cupom, então
// cada abertura começa do zero sem `setState` dentro de `useEffect` (regra D5).
export function CouponWizard({ isOpen, onClose, onSubmit, initialCoupon = null }) {
  const { pushToast } = useToast();
  const [formData, setFormData] = useState(() => fromCoupon(initialCoupon));
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let nextValue = type === 'checkbox' ? checked : value;
    if (name === 'code') {
      nextValue = sanitizeCouponCode(value);
    }
    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
      ...(name === 'audience' && nextValue === 'purchase_milestone'
        ? { maxUsesPerCustomer: '' }
        : {}),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const code = formData.code.trim();
    if (code.length < 3) {
      pushToast('Código deve ter ao menos 3 caracteres.', 'error');
      return;
    }
    const value = Number(formData.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      pushToast('Valor do desconto deve ser maior que zero.', 'error');
      return;
    }
    if (formData.discountType === 'percent' && value > 100) {
      pushToast('Desconto percentual não pode passar de 100%.', 'error');
      return;
    }
    // `eligibleEmails` só existe para "Pessoas específicas"; nos outros
    // públicos nem viaja no payload (o servidor zera a lista de todo jeito).
    const eligibleEmails =
      formData.audience === 'emails' ? parseEligibleEmails(formData.eligibleEmails) : undefined;
    if (formData.audience === 'emails' && eligibleEmails.length === 0) {
      pushToast('Informe ao menos um e-mail.', 'error');
      return;
    }

    // Espera a resposta e não fecha sozinho: quem fecha é o pai, só no
    // sucesso. Um 409 ("Já existe um cupom com esse código.") deixa o que foi
    // digitado na tela (ADM-45).
    setSubmitting(true);
    try {
      await onSubmit({
        id: formData.id || undefined,
        code,
        discountType: formData.discountType,
        discountValue: value,
        minOrderAmount: formData.minOrderAmount === '' ? null : Number(formData.minOrderAmount),
        maxUses: formData.maxUses === '' ? null : Number(formData.maxUses),
        maxUsesPerCustomer: maxUsesPerCustomerFor(formData),
        audience: formData.audience,
        ...(eligibleEmails ? { eligibleEmails } : {}),
        purchasesRequired:
          formData.audience === 'purchase_milestone' ? Number(formData.purchasesRequired) : null,
        validFrom: startOfBrtDayIso(formData.validFrom),
        validUntil: endOfBrtDayIso(formData.validUntil),
        active: formData.active,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isPercent = formData.discountType === 'percent';
  const isFirstPurchase = formData.audience === 'new_customers';
  const isMilestone = formData.audience === 'purchase_milestone';

  return (
    <ModalWizard
      title={initialCoupon ? 'Editar Cupom' : 'Novo Cupom'}
      steps={[{ id: 'info', label: 'Cupom' }]}
      currentStep={0}
      onStepChange={() => {}}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Salvar Cupom"
      showProgress={false}
      size="modal-medium"
      submitting={submitting}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="coupon-code" className={LABEL_CLASS}>
            Código *
          </label>
          <input
            id="coupon-code"
            type="text"
            name="code"
            value={formData.code}
            onChange={handleChange}
            placeholder="Ex: VOLTEI15"
            maxLength={64}
            className={`${INPUT_CLASS} font-mono uppercase`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Letras, números, ponto, hífen e underscore. Sem espaços.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="coupon-type" className={LABEL_CLASS}>
              Tipo de desconto
            </label>
            <select
              id="coupon-type"
              name="discountType"
              value={formData.discountType}
              onChange={handleChange}
              className={INPUT_CLASS}
            >
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
            </select>
          </div>
          <div>
            <label htmlFor="coupon-value" className={LABEL_CLASS}>
              {isPercent ? 'Desconto (%) *' : 'Desconto (R$) *'}
            </label>
            <input
              id="coupon-value"
              type="number"
              name="discountValue"
              value={formData.discountValue}
              onChange={handleChange}
              // Centavos também no percentual (12,5%), e sem `max` nativo: o
              // balão do navegador escondia a mensagem da aplicação (ADM-46).
              step="0.01"
              min="0"
              placeholder={isPercent ? 'Ex: 15' : 'Ex: 10.00'}
              className={INPUT_CLASS}
            />
          </div>
          {isFirstPurchase || isMilestone ? (
            <div>
              <p className={LABEL_CLASS}>Usos por cliente</p>
              <p className="text-xs text-slate-500">
                {isFirstPurchase
                  ? 'Cupom de primeira compra vale uma vez por cliente — o limite é fixo em 1.'
                  : 'A recompensa já limita: cada vez que a pessoa completa as compras exigidas, ganha um uso.'}
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="coupon-max-per-customer" className={LABEL_CLASS}>
                Usos por cliente
              </label>
              <input
                id="coupon-max-per-customer"
                type="number"
                name="maxUsesPerCustomer"
                value={formData.maxUsesPerCustomer}
                onChange={handleChange}
                step="1"
                min="1"
                placeholder="Vazio = sem limite individual"
                className={INPUT_CLASS}
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="coupon-audience" className={LABEL_CLASS}>
            Quem pode usar
          </label>
          <select
            id="coupon-audience"
            name="audience"
            value={formData.audience}
            onChange={handleChange}
            className={INPUT_CLASS}
          >
            <option value="all">Todos</option>
            <option value="customers">Somente clientes com conta</option>
            <option value="new_customers">Somente primeira compra</option>
            <option value="returning_customers">Clientes que já compraram</option>
            <option value="emails">Pessoas específicas</option>
            <option value="purchase_milestone">Recompensa por número de compras</option>
          </select>
        </div>

        {formData.audience === 'emails' ? (
          <div>
            <label htmlFor="coupon-emails" className={LABEL_CLASS}>
              E-mails permitidos
            </label>
            <textarea
              id="coupon-emails"
              name="eligibleEmails"
              value={formData.eligibleEmails}
              onChange={handleChange}
              rows={4}
              placeholder="um@email.com por linha"
              className={INPUT_CLASS}
            />
          </div>
        ) : null}

        {formData.audience === 'purchase_milestone' ? (
          <div>
            <label htmlFor="coupon-purchases-required" className={LABEL_CLASS}>
              Compras aprovadas para ganhar cada uso
            </label>
            <input
              id="coupon-purchases-required"
              type="number"
              name="purchasesRequired"
              value={formData.purchasesRequired}
              onChange={handleChange}
              min="1"
              step="1"
              required
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-slate-500">
              Exemplo: 5 libera um uso após 5, outro após 10, e assim por diante.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="coupon-min" className={LABEL_CLASS}>
              Pedido mínimo (R$)
            </label>
            <input
              id="coupon-min"
              type="number"
              name="minOrderAmount"
              value={formData.minOrderAmount}
              onChange={handleChange}
              step="0.01"
              min="0"
              placeholder="Opcional"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="coupon-max-uses" className={LABEL_CLASS}>
              Limite de usos
            </label>
            <input
              id="coupon-max-uses"
              type="number"
              name="maxUses"
              value={formData.maxUses}
              onChange={handleChange}
              step="1"
              min="0"
              placeholder="Vazio = ilimitado"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <label htmlFor="coupon-valid-from" className={LABEL_CLASS}>
            Válido a partir de
          </label>
          <input
            id="coupon-valid-from"
            type="date"
            name="validFrom"
            value={formData.validFrom}
            onChange={handleChange}
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-slate-500">
            Vazio = já vale. As datas seguem o horário de Brasília.
          </p>
        </div>

        <div>
          <label htmlFor="coupon-valid-until" className={LABEL_CLASS}>
            Válido até
          </label>
          <input
            id="coupon-valid-until"
            type="date"
            name="validUntil"
            value={formData.validUntil}
            onChange={handleChange}
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-slate-500">Vazio = sem data de expiração.</p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <input
            type="checkbox"
            name="active"
            checked={formData.active}
            onChange={handleChange}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Cupom ativo</span>
            <span className="block text-xs text-slate-500">
              Desative para suspender o cupom sem apagá-lo. Inativos não validam no checkout.
            </span>
          </span>
        </label>
      </div>
    </ModalWizard>
  );
}

CouponWizard.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  initialCoupon: PropTypes.shape({
    id: PropTypes.string,
    code: PropTypes.string,
    discountType: PropTypes.string,
    discountValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    minOrderAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    maxUses: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    maxUsesPerCustomer: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    audience: PropTypes.string,
    eligibleEmails: PropTypes.arrayOf(PropTypes.string),
    purchasesRequired: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    validFrom: PropTypes.string,
    validUntil: PropTypes.string,
    active: PropTypes.bool,
  }),
};
