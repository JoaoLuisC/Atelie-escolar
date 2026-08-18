import React from 'react';
import PropTypes from 'prop-types';
import { getApiBaseUrl } from '../utils/api';
import { getSessionId } from '../utils/attribution';

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
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <i className="bi bi-arrow-clockwise" /> Recarregar
          </button>
        </div>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};
