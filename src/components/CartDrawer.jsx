import PropTypes from 'prop-types';
import { useContext, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CartContext } from '../providers/CartProvider';
import { formatPrice } from '../utils/currency';
import { ROUTES } from '../constants/routes';

/**
 * Drawer lateral de carrinho (regra B3 — carrinho não bloqueia navegação).
 * Substitui o link direto para /checkout.
 *
 * Implementa atalhos:
 * - Esc fecha o drawer
 * - Click no backdrop fecha
 * - Foco volta ao botão que abriu (via prop returnFocus ou useRef)
 *
 * Estado livre é mantido pelo Shell — drawer só consome cart + onClose.
 */
export function CartDrawer({ isOpen, onClose, onCheckout }) {
  // Lê contexto direto (não via useCart) para que renderizar fora de um
  // CartProvider — comum em testes que montam Shell isoladamente — não
  // quebre o componente.
  const ctx = useContext(CartContext);
  const cart = Array.isArray(ctx?.cart) ? ctx.cart : [];
  const total = Number(ctx?.total || 0);
  const removeFromCart = ctx?.removeFromCart || (() => {});
  const clearCart = ctx?.clearCart || (() => {});
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    globalThis.document?.addEventListener('keydown', onKeyDown);
    return () => globalThis.document?.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Focus trap: ao abrir, move o foco para dentro do drawer; Tab/Shift+Tab
  // ciclam apenas entre os elementos focáveis do dialog; ao fechar, devolve o
  // foco ao elemento que o abriu (o botão do carrinho no Shell).
  useEffect(() => {
    if (!isOpen) return undefined;
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
  }, [isOpen]);

  useEffect(() => {
    if (typeof globalThis.document === 'undefined') return undefined;
    const { body } = globalThis.document;
    if (!body) return undefined;
    if (isOpen) {
      const previous = body.style.overflow;
      body.style.overflow = 'hidden';
      return () => {
        body.style.overflow = previous;
      };
    }
    return undefined;
  }, [isOpen]);

  if (!isOpen) return null;

  function handleCheckout() {
    onClose();
    onCheckout?.();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Fechar carrinho"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity"
      />
      <aside
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl focus:outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
              Seu carrinho
            </p>
            <h2 id="cart-drawer-title" className="font-display text-lg font-bold text-slate-900">
              {cart.length === 0
                ? 'Nada por aqui ainda'
                : `${cart.length} item${cart.length === 1 ? '' : 's'}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-500">
              <i className="bi bi-cart3 text-4xl text-slate-300" aria-hidden="true" />
              <p className="text-sm">Seu carrinho está vazio.</p>
              <Link
                to={ROUTES.produtos}
                onClick={onClose}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Ver catálogo
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {cart.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <i className="bi bi-image" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="line-clamp-2 text-sm text-slate-800">{item.name}</strong>
                    <p className="mt-1 text-sm font-semibold text-brand-700">
                      {formatPrice(item.price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    aria-label={`Remover ${item.name}`}
                    className="self-start rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart.length > 0 ? (
          <footer className="border-t border-slate-200 bg-slate-50 px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-600">Subtotal</span>
              <strong className="font-display text-xl font-bold text-brand-700">
                {formatPrice(total)}
              </strong>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Cupons e descontos são aplicados na próxima etapa.
            </p>
            <button
              type="button"
              onClick={handleCheckout}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-3 text-base font-semibold text-white shadow-brand transition hover:scale-[1.01]"
            >
              Finalizar compra <i className="bi bi-arrow-right" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearCart}
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Esvaziar carrinho
            </button>
          </footer>
        ) : null}
      </aside>
    </>
  );
}

CartDrawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCheckout: PropTypes.func,
};
