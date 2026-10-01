import React from 'react';
import PropTypes from 'prop-types';
import { getApiBaseUrl } from '../utils/api';
import { getSessionId } from '../utils/attribution';
import { CART_KEY } from '../utils/cart-storage';

function reportErrorToBackend(error, info) {
  try {
    const body = JSON.stringify({
      event_name: 'client_error',
      session_id: getSessionId(),
      properties: {
        message: String(error?.message || error || '').slice(0, 500),
        stack: String(error?.stack || '').slice(0, 1500),
        component_stack: String(info?.componentStack || '').slice(0, 1500),
        path: globalThis.location?.pathname || '',
      },
    });
    const url = `${getApiBaseUrl()}/track-event`;

    if (typeof globalThis.navigator?.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      globalThis.navigator.sendBeacon(url, blob);
      return;
    }

    // ── EXCEÇÃO DELIBERADA À REGRA C1 ───────────────────────────────
    // `fetch` cru de propósito, NÃO por esquecimento. Isto é telemetria de
    // erro emitida do `componentDidCatch`: o React já derrubou a árvore, e o
    // que sobra é entregar a mensagem antes de a aba fechar.
    //
    // `apiRequest` não serve aqui por dois motivos concretos:
    //   • ele aborta em 15s — mas este `fetch` é o FALLBACK do `sendBeacon`
    //     acima, e um `AbortController` num envio `keepalive` cancela
    //     exatamente o que se quer que sobreviva ao descarregamento da página;
    //   • ele normaliza a RESPOSTA, e aqui não há resposta a ler — o `.catch`
    //     vazio é o contrato: se a telemetria falhar, ninguém pode saber.
    //
    // Uma falha aqui não pode virar outro erro dentro do handler de erro.
    // Ver item P5.1 do docs/PADRONIZACAO-CORRECOES.md.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  // LOJA-01: este boundary fica ACIMA do BrowserRouter, então trocar de URL não
  // o desmontava — o botão Voltar mudava o endereço e o cartão de erro ficava.
  // Num `popstate`, a árvore tenta de novo; se o erro persistir, ele volta.
  componentDidMount() {
    globalThis.addEventListener?.('popstate', this.handlePopState);
  }

  componentWillUnmount() {
    globalThis.removeEventListener?.('popstate', this.handlePopState);
  }

  handlePopState = () => {
    if (this.state.hasError) this.setState({ hasError: false });
  };

  componentDidCatch(error, info) {
    reportErrorToBackend(error, info);
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary]', error, info);
    }
  }

  handleReload = () => {
    try {
      globalThis.location.reload();
    } catch {
      /* ignore */
    }
  };

  // LOJA-01: um carrinho corrompido no localStorage derrubava a loja de novo a
  // cada "Recarregar" — o dado ruim sobrevivia ao reload. Esta é a saída que
  // não depende de abrir o DevTools. Só o carrinho sai: consentimento LGPD e o
  // último pedido (usado em /downloads) ficam.
  handleResetCart = () => {
    try {
      globalThis.localStorage?.removeItem(CART_KEY);
    } catch {
      /* storage bloqueado: o reload abaixo é o que resta */
    }
    this.handleReload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <i className="bi bi-exclamation-triangle text-3xl text-rose-600" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">Algo deu errado</h1>
          <p className="mt-2 text-sm text-slate-600">
            Tivemos um problema ao carregar esta página. Já registramos o ocorrido. Tente
            recarregar.
          </p>
          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Recarregar
            </button>
            <button
              type="button"
              onClick={this.handleResetCart}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 underline-offset-2 transition hover:underline"
            >
              Continua com erro? Esvaziar o carrinho salvo e recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};
