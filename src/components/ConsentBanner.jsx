import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  getConsentState,
  setConsentState,
} from '../utils/consent';

export function ConsentBanner() {
  const [state, setState] = useState(getConsentState());

  useEffect(() => {
    // Atualiza se a escolha mudar em outra aba
    const onStorage = (event) => {
      if (event.key === 'lgpd_consent') setState(getConsentState());
    };
    globalThis.addEventListener?.('storage', onStorage);
    return () => globalThis.removeEventListener?.('storage', onStorage);
  }, []);

  if (state === CONSENT_GRANTED || state === CONSENT_DENIED) {
    return null;
  }

  function accept() {
    setConsentState(CONSENT_GRANTED);
    setState(CONSENT_GRANTED);
  }

  function reject() {
    setConsentState(CONSENT_DENIED);
    setState(CONSENT_DENIED);
  }

  return (
    <aside
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies e privacidade"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">Sua privacidade importa</h2>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              Usamos cookies essenciais para o funcionamento do site. Cookies de marketing (Google
              Analytics e Meta) ajudam a medir o que funciona. Você decide. Saiba mais na nossa{' '}
              <Link
                to={ROUTES.privacidade}
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                Política de Privacidade
              </Link>{' '}
              e nos{' '}
              <Link
                to={ROUTES.termos}
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                Termos de Uso
              </Link>
              .
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reject}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Apenas essenciais
            </button>
            <button
              type="button"
              onClick={accept}
              className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Aceitar todos
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
