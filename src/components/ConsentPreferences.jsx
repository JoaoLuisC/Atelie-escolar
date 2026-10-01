import { useSyncExternalStore } from 'react';
import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  getConsentMetadata,
  getConsentState,
  setConsentState,
  subscribeConsentChanges,
} from '../utils/consent';

// ════════════════════════════════════════════════════════════════════
// REVOGAR CONSENTIMENTO — o caminho que faltava (LGPD art. 8º §5º).
//
// O `ConsentBanner` some assim que existe uma decisão gravada
// (`ConsentBanner.jsx:23`), e `setConsentState` só era chamado de lá. Ou seja:
// depois de clicar em "Aceitar todos", não havia nenhum controle no produto
// para voltar atrás. A política de privacidade já prometia revogação "a
// qualquer momento" e oferecia como caminho "limpar os dados do site" — o que
// é verdade técnica e não é procedimento facilitado.
//
// POR QUE O RELOAD AO REVOGAR
// Parar de MEDIR é imediato: `trackEvent` consulta `hasMarketingConsent()` a
// cada chamada, então nada novo é enviado ao GA4/Pixel no instante em que o
// estado vira `denied`. Mas os scripts do Google e da Meta, se já foram
// injetados nesta aba por `applyMarketingConsent`, continuam carregados e com
// os próprios timers. Recarregar é o que garante que a página seguinte à
// revogação não tenha mais nenhum dos dois no ar — e é honesto com o que a
// política afirma. Ao CONCEDER não há reload: `applyMarketingConsent` já
// escuta a mudança e sobe os scripts sozinho.
// ════════════════════════════════════════════════════════════════════

function formatarData(iso) {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString('pt-BR');
}

function lerDataDaDecisao() {
  // Só conta a data de uma decisão que ainda VALE (versão atual da política).
  return getConsentState() ? (getConsentMetadata()?.at ?? null) : null;
}

function semServidor() {
  return null;
}

export function ConsentPreferences() {
  // LOJA-16: a fonte é o localStorage, assinado por `subscribeConsentChanges`
  // (esta aba E as outras). Antes havia só o evento `storage`, que não dispara
  // na aba que gravou: "Apenas essenciais" no banner deixava este bloco em
  // "Você ainda não escolheu" até o F5.
  const state = useSyncExternalStore(subscribeConsentChanges, getConsentState, semServidor);
  const decididoEmIso = useSyncExternalStore(
    subscribeConsentChanges,
    lerDataDaDecisao,
    semServidor,
  );
  const decididoEm = formatarData(decididoEmIso);

  function escolher(novo) {
    const revogando = getConsentState() === CONSENT_GRANTED && novo === CONSENT_DENIED;

    setConsentState(novo);

    if (revogando) {
      try {
        globalThis.location?.reload();
      } catch {
        /* sem window (SSR/teste): o estado já foi gravado, que é o que vale */
      }
    }
  }

  const rotulo =
    state === CONSENT_GRANTED
      ? 'Cookies de marketing ativos'
      : state === CONSENT_DENIED
        ? 'Apenas cookies essenciais'
        : 'Você ainda não escolheu';

  return (
    <section
      id="cookies"
      aria-label="Preferências de cookies"
      className="not-prose my-6 scroll-mt-20 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
    >
      <h3 className="text-sm font-bold text-slate-900">Suas preferências de cookies</h3>
      <p className="mt-1 text-xs text-slate-600 sm:text-sm">
        Situação atual: <strong>{rotulo}</strong>
        {decididoEm ? ` — escolhido em ${decididoEm}.` : '.'} Você pode mudar quando quiser, e a
        mudança vale a partir de agora.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => escolher(CONSENT_DENIED)}
          aria-pressed={state === CONSENT_DENIED}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Apenas essenciais
        </button>
        <button
          type="button"
          onClick={() => escolher(CONSENT_GRANTED)}
          aria-pressed={state === CONSENT_GRANTED}
          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Aceitar todos
        </button>
      </div>
    </section>
  );
}
