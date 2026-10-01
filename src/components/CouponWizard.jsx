import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
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
    validUntil: '',
    active: true,
  };
}

// ════════════════════════════════════════════════════════════════════
// VALIDADE DO CUPOM (ADM-39). O `<input type="date">` dá "2026-12-31"; ele ia
// cru para o servidor, que gravava 2026-12-31T00:00Z — 30/12 às 21h em São
// Paulo. A tela mostrava "Vale até 30/12", a edição trazia "2026-12-30" e cada
// salvamento sem mudança encurtava a validade em mais um dia.
//
// Agora a data escolhida vira o FIM daquele dia no fuso do navegador (o mesmo
// em que a dona da loja lê a data), e a leitura usa a data LOCAL do instante
// gravado. Ida e volta dão o mesmo dia.
// ════════════════════════════════════════════════════════════════════
export function toDateInputValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function endOfLocalDayIso(dateInputValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateInputValue || ''));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

// Mesmo alfabeto que o servidor aceita (couponCode em validation/admin.schemas.js).
// Filtrar na digitação evita que o "@" só seja recusado depois do envio (ADM-45).
function sanitizeCouponCode(value) {
  return String(value)
    .toUpperCase()
    .replaceAll(/[^A-Z0-9._-]/g, '');
}

export function CouponWizard({ isOpen, onClose, onSubmit, initialCoupon = null }) {
  const { pushToast } = useToast();
  const [formData, setFormData] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialCoupon) {
      setFormData({
        id: initialCoupon.id || '',
        code: initialCoupon.code || '',
        discountType: initialCoupon.discountType || 'percent',
        discountValue:
          initialCoupon.discountValue != null ? String(initialCoupon.discountValue) : '',
        minOrderAmount:
          initialCoupon.minOrderAmount != null ? String(initialCoupon.minOrderAmount) : '',
        maxUses: initialCoupon.maxUses != null ? String(initialCoupon.maxUses) : '',
        validUntil: toDateInputValue(initialCoupon.validUntil),
        active: initialCoupon.active !== false,
      });
    } else {
      setFormData(emptyForm());
    }
  }, [initialCoupon, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let nextValue = type === 'checkbox' ? checked : value;
    if (name === 'code') {
      nextValue = sanitizeCouponCode(value);
    }
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
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
        validUntil: endOfLocalDayIso(formData.validUntil),
        active: formData.active,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isPercent = formData.discountType === 'percent';

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
        </div>

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
    validUntil: PropTypes.string,
    active: PropTypes.bool,
  }),
};
