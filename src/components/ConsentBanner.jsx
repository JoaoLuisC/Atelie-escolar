import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  getConsentState,
  setConsentState,
  subscribeConsentChanges,
} from '../utils/consent';

function getServerSnapshot() {
  return null;
}

export function ConsentBanner() {
  // LOJA-16: lê a decisão da FONTE (localStorage) e assina mudanças desta aba e
  // de outras — escolher em /privacidade#cookies esconde o banner na hora.
  const storedState = useSyncExternalStore(
    subscribeConsentChanges,
    getConsentState,
    getServerSnapshot,
  );
  // Reserva para quando o storage recusa a gravação (cota cheia, aba anônima
  // do Safari): a decisão vale para esta visita e o banner não fica preso.
  const [choiceThisVisit, setChoiceThisVisit] = useState(null);
  const state = storedState || choiceThisVisit;
  const isPending = state !== CONSENT_GRANTED && state !== CONSENT_DENIED;
  const bannerRef = useRef(null);

  // LOJA-30: o banner é `fixed` e, no celular, cobria o fim da página
  // ("Privacidade", "Termos", a nota da newsletter). Enquanto ele estiver na
  // tela, o body ganha um respiro do tamanho dele no rodapé.
  useEffect(() => {
    const element = bannerRef.current;
    const body = globalThis.document?.body;
    if (!isPending || !element || !body) return undefined;

    const applyPadding = () => {
      body.style.paddingBottom = `${element.offsetHeight}px`;
    };
    applyPadding();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(applyPadding) : null;
    observer?.observe(element);

    return () => {
      observer?.disconnect();
      body.style.paddingBottom = '';
    };
  }, [isPending]);

  if (!isPending) {
    return null;
  }

  function decide(choice) {
    setConsentState(choice);
    setChoiceThisVisit(choice);
  }

  // LOJA-04/30:
  // - z-40 (e não z-50): o drawer do carrinho é z-50 e o overlay dele z-40,
  //   renderizado depois. Com o banner por cima, "Finalizar compra →" ficava
  //   inalcançável no celular. Agora o carrinho aberto cobre o banner, que
  //   volta a aparecer quando o carrinho fecha.
  // - Ele é montado ANTES do <App /> (src/main.jsx), então é dos primeiros
  //   pontos do Tab — antes ficava depois do rodapé inteiro.
  // - Não bloqueia a página: diálogo não-modal, declarado como tal.
  return (
    <aside
      ref={bannerRef}
      role="dialog"
      aria-modal="false"
      aria-live="polite"
      aria-labelledby="consent-banner-title"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 id="consent-banner-title" className="text-sm font-bold text-slate-900">
              Sua privacidade importa
            </h2>
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
              onClick={() => decide(CONSENT_DENIED)}
              className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Apenas essenciais
            </button>
            <button
              type="button"
              onClick={() => decide(CONSENT_GRANTED)}
              className="min-h-[44px] rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Aceitar todos
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
