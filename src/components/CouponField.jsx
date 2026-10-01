import PropTypes from 'prop-types';
import { useState } from 'react';
import { validateCoupon } from '../services/coupons';
import { formatPrice } from '../utils/currency';

/**
 * Cupom de desconto (regra G6 — validação real é server-side).
 * Este componente APENAS apresenta o feedback. O backend revalida e
 * aplica em `/api/create-payment` (o `couponCode` é enviado no payload).
 *
 * Props:
 * - cart: itens do carrinho (necessário para validação contextual)
 * - applied: cupom já aplicado ({ code, discount, ... }) ou null
 * - onApply(coupon): chamado com o resultado da validação
 * - onClear(): chamado quando o usuário remove o cupom
 * - disabled: bloqueia interação (ex: durante processamento)
 */
// Mesmo teto do schema do backend (validation/payment.schemas.js): passar
// disso só servia para a API recusar (LOJA-51).
const MAX_CODE_LENGTH = 40;

export function CouponField({ cart, applied, onApply, onClear, disabled = false }) {
  const [expanded, setExpanded] = useState(Boolean(applied));
  const [code, setCode] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [previousApplied, setPreviousApplied] = useState(applied);
  const cartIsEmpty = !Array.isArray(cart) || cart.length === 0;

  // O pai tirou o cupom porque o carrinho mudou (CROSS-06). O painel reabria
  // com "Desconto aplicado: R$ 3,98" — um valor que já não vale. Ajuste de
  // estado durante o render (padrão do React para "estado derivado de prop"),
  // sem efeito e sem um render com a mensagem velha.
  if (applied !== previousApplied) {
    setPreviousApplied(applied);
    if (!applied && previousApplied && status.type === 'success') {
      setStatus({
        type: 'info',
        message: 'O carrinho mudou. Aplique o cupom de novo para recalcular o desconto.',
      });
    }
  }

  if (applied) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
              Cupom aplicado
            </p>
            <p className="text-sm font-semibold text-emerald-900">
              {applied.code} · −{formatPrice(applied.discount)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCode('');
              setStatus({ type: 'idle', message: '' });
              onClear?.();
            }}
            disabled={disabled}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            Remover
          </button>
        </div>
      </div>
    );
  }

  async function applyCode(event) {
    event?.preventDefault?.();
    const trimmed = code.trim();
    if (!trimmed) return;
    // CROSS-05: com o carrinho vazio o cupom "aplicava" −R$ 0,00.
    if (cartIsEmpty) {
      setStatus({
        type: 'error',
        message: 'Adicione produtos ao carrinho antes de aplicar o cupom.',
      });
      return;
    }

    setStatus({ type: 'loading', message: 'Validando…' });

    try {
      // Regra C2: o componente pede "valide este cupom para este carrinho"
      // e não sabe URL, método nem formato de item. A montagem do payload
      // (inclusive o `categoryId`, sem o qual cupom restrito sempre reporta
      // "não elegível") mora em src/services/coupons.js.
      const data = await validateCoupon(trimmed, cart);

      if (!data.ok) {
        setStatus({ type: 'error', message: data.message });
        return;
      }

      setStatus({ type: 'success', message: `Desconto aplicado: ${formatPrice(data.discount)}` });
      onApply?.({
        code: data.coupon.code,
        discount: Number(data.discount || 0),
        subtotal: Number(data.subtotal || 0),
        total: Number(data.total || 0),
        // Preços do servidor usados no cálculo: o checkout atualiza o carrinho
        // com eles, para o subtotal da tela ser o mesmo do desconto.
        items: data.items || [],
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Não foi possível validar o cupom.' });
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="coupon-field-panel"
        onClick={() => setExpanded((value) => !value)}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <i className="bi bi-ticket-perforated" aria-hidden="true" />
          Tem um cupom?
        </span>
        <i
          className={`bi bi-chevron-down text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <div id="coupon-field-panel" className="border-t border-slate-200 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              aria-label="Código do cupom"
              placeholder="DIGITE O CÓDIGO"
              maxLength={MAX_CODE_LENGTH}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyCode(event);
              }}
              disabled={disabled || status.type === 'loading'}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm uppercase tracking-wide focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={applyCode}
              disabled={disabled || status.type === 'loading' || !code.trim() || cartIsEmpty}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:bg-brand-300"
            >
              {status.type === 'loading' ? 'Validando…' : 'Aplicar'}
            </button>
          </div>
          {status.type === 'error' ? (
            <p role="alert" className="mt-2 text-xs text-rose-700">
              <i className="bi bi-exclamation-circle mr-1" aria-hidden="true" />
              {status.message}
            </p>
          ) : null}
          {status.type === 'info' ? (
            <p role="status" className="mt-2 text-xs text-amber-700">
              <i className="bi bi-info-circle mr-1" aria-hidden="true" />
              {status.message}
            </p>
          ) : null}
          {status.type === 'success' ? (
            <p className="mt-2 text-xs text-emerald-700">
              <i className="bi bi-check-circle mr-1" aria-hidden="true" />
              {status.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

CouponField.propTypes = {
  cart: PropTypes.array.isRequired,
  applied: PropTypes.shape({
    code: PropTypes.string,
    discount: PropTypes.number,
  }),
  onApply: PropTypes.func,
  onClear: PropTypes.func,
  disabled: PropTypes.bool,
};
