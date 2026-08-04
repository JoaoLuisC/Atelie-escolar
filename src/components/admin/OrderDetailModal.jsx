import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';
import { formatPrice } from '../../utils/currency';
import { formatDateTime } from './utils/format';
import { StatusChip } from './ui/StatusChip';
import { Button } from './ui/Button';

export function OrderDetailModal({ order, onClose }) {
  const dialogRef = useRef(null);
  const open = Boolean(order);

  // Esc fecha, foco preso dentro do dialog e devolvido ao gatilho ao fechar.
  useEffect(() => {
    if (!open) return undefined;
    const doc = globalThis.document;
    if (!doc) return undefined;

    const previouslyFocused = doc.activeElement;
    const dialog = dialogRef.current;

    const getFocusable = () => {
      if (!dialog) return [];
      return Array.from(
        dialog.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };

    const focusables = getFocusable();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else if (dialog) {
      dialog.focus();
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = doc.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  // Trava o scroll do body enquanto o modal está aberto.
  useEffect(() => {
    if (!open) return undefined;
    const body = globalThis.document?.body;
    if (!body) return undefined;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar detalhes"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />
      <dialog
        ref={dialogRef}
        open
        tabIndex={-1}
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl focus:outline-none"
        aria-labelledby="order-detail-title"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pedido</p>
            <h2 id="order-detail-title" className="truncate text-lg font-bold text-slate-900">
              {order.orderId || order.id}
            </h2>
          </div>
          <Button variant="ghost" size="sm" icon="x-lg" onClick={onClose} aria-label="Fechar" />
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Cliente</dt>
            <dd className="truncate font-semibold text-slate-800">
              {order.customerName || order.customerEmail || '-'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">E-mail</dt>
            <dd className="truncate text-slate-800">{order.customerEmail || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd className="mt-0.5"><StatusChip status={order.paymentStatus} /></dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Total</dt>
            <dd className="font-bold text-slate-900">{formatPrice(order.totalAmount || 0)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Data</dt>
            <dd className="text-slate-800">{formatDateTime(order.createdAt)}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Itens</h3>
          {(order.items || []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
              Sem itens vinculados.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {(order.items || []).map((item, index) => (
                <li
                  key={`${item.id || item.productId || 'item'}-${index}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="truncate text-slate-800">
                    {item.title || `Produto ${item.id || item.productId || index + 1}`}
                  </span>
                  <span className="shrink-0 font-medium text-slate-700">
                    {item.quantity || 1} × {formatPrice(item.price || 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </div>
  );
}

OrderDetailModal.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    orderId: PropTypes.string,
    customerName: PropTypes.string,
    customerEmail: PropTypes.string,
    paymentStatus: PropTypes.string,
    totalAmount: PropTypes.number,
    createdAt: PropTypes.string,
    items: PropTypes.array,
  }),
  onClose: PropTypes.func.isRequired,
};
