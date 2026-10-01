import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import {
  confirmSubscription,
  unsubscribeByEmail,
  unsubscribeByToken,
} from '../services/subscription';
import { ROUTES } from '../constants/routes';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Container({ children }) {
  return (
    <Shell>
      <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center lg:px-6">
        {children}
      </section>
    </Shell>
  );
}

// Regra C6: componente que RECEBE props declara `propTypes`.
Container.propTypes = {
  children: PropTypes.node,
};

// ════════════════════════════════════════════════════════════════════
// /confirmar-inscricao?token=...
// ════════════════════════════════════════════════════════════════════
const LINK_INVALIDO = 'Link inválido. Volte ao seu email e clique no botão de confirmação.';

export function ConfirmSubscriptionPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  // ── Inicializador lazy em vez de setState no efeito (regra D5) ─────
  // "Sem token" é conhecido no PRIMEIRO render — está na URL, não vem de
  // rede. A versão anterior pintava "Confirmando sua inscrição…" e só então o
  // efeito trocava para o erro: quem clicava num link truncado via, por um
  // quadro, a promessa de que algo estava sendo confirmado. Agora o estado
  // certo já nasce certo, e o efeito só faz o que É assíncrono.
  const [status, setStatus] = useState(() =>
    token
      ? { state: 'loading', message: 'Confirmando sua inscrição…' }
      : { state: 'error', message: LINK_INVALIDO },
  );

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        // Regra C2: a chamada mora em `src/services/subscription.js`. Regra
        // A1: o backend usa status real (404 token inválido, 409 cancelada,
        // 410 expirada) em vez de 200 com `confirmed:false`, então a checagem
        // é `success`, não `confirmed`.
        const resultado = await confirmSubscription(token);
        setStatus({
          state: resultado.ok ? 'success' : 'error',
          message: resultado.message,
        });
      } catch (err) {
        setStatus({ state: 'error', message: err.message || 'Erro de conexão.' });
      }
    })();
  }, [token]);

  const isSuccess = status.state === 'success';
  const isError = status.state === 'error';

  return (
    <Container>
      <SEO title="Confirmar inscrição" pathname="/confirmar-inscricao" noindex />
      <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
        {isSuccess ? '✓ Confirmado' : isError ? 'Ops…' : 'Aguarde'}
      </p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
        {isSuccess
          ? 'Bem-vindo(a) à lista!'
          : isError
            ? 'Não foi possível confirmar'
            : 'Confirmando…'}
      </h1>
      <p className="mt-3 max-w-md text-sm text-slate-600">{status.message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          to={ROUTES.produtos}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Ver produtos
        </Link>
        <Link
          to={ROUTES.home}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Voltar à home
        </Link>
      </div>
    </Container>
  );
}

// ════════════════════════════════════════════════════════════════════
// /desinscrever?token=...   ou   ?email=...   ou   form vazio
// ════════════════════════════════════════════════════════════════════
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [emailInput, setEmailInput] = useState(params.get('email') || '');
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  // LOJA-15: sem rede, o caminho por link ficava só com a mensagem de erro, sem
  // formulário e sem botão. Incrementar a tentativa refaz o pedido.
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!token) return;

    (async () => {
      setStatus({ state: 'loading', message: 'Cancelando sua inscrição…' });
      try {
        const resultado = await unsubscribeByToken(token);
        setStatus({
          state: resultado.ok ? 'success' : 'error',
          message: resultado.message,
        });
      } catch (err) {
        setStatus({ state: 'error', message: err.message || 'Erro de conexão.' });
      }
    })();
  }, [token, tentativa]);

  async function onSubmit(event) {
    event.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      setStatus({ state: 'error', message: 'Informe um email válido.' });
      return;
    }
    setStatus({ state: 'loading', message: 'Cancelando…' });

    try {
      const resultado = await unsubscribeByEmail(email);
      // `confirmationRequired` é o estado "enviamos um e-mail de confirmação e
      // NADA foi removido ainda". Antes ele chegava como `success: false`, o
      // que pintava a tela de erro para uma operação que deu certo — e obrigava
      // o backend a mentir no envelope da regra A1. Aqui ele é o que é: um
      // estado de domínio, num corpo de sucesso.
      setStatus({
        state: resultado.confirmationRequired ? 'pending' : resultado.ok ? 'success' : 'error',
        message: resultado.message,
      });
    } catch (err) {
      setStatus({ state: 'error', message: err.message || 'Erro de conexão.' });
    }
  }

  const isSuccess = status.state === 'success';
  const isTokenError = Boolean(token) && status.state === 'error';
  // Com link quebrado ou sem rede, o formulário por e-mail é a saída que sobra.
  const showForm = (!token || isTokenError) && !isSuccess;

  return (
    <Container>
      <SEO title="Cancelar inscrição" pathname="/desinscrever" noindex />
      <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
        {isSuccess ? '✓ Pronto' : 'Cancelar inscrição'}
      </p>
      {/* LOJA-35: o backend responde igual para token conhecido e inventado
          (anti-enumeração), então o título não pode afirmar "você foi
          removido" — só que o cancelamento foi processado. */}
      <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
        {isSuccess ? 'Cancelamento processado' : 'Cancelar inscrição'}
      </h1>
      {status.message ? (
        <p
          role={status.state === 'error' ? 'alert' : undefined}
          className={`mt-3 max-w-md text-sm ${isSuccess ? 'text-emerald-700' : 'text-slate-600'}`}
        >
          {status.message}
        </p>
      ) : null}

      {isTokenError ? (
        <button
          type="button"
          onClick={() => setTentativa((valor) => valor + 1)}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Tentar novamente
        </button>
      ) : null}

      {showForm ? (
        <form onSubmit={onSubmit} className="mt-6 flex w-full max-w-md flex-col gap-2 text-left">
          <label
            htmlFor="unsub-email"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Email cadastrado
          </label>
          <input
            id="unsub-email"
            type="email"
            required
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            disabled={status.state === 'loading'}
            placeholder="seu@email.com"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={status.state === 'loading'}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            Confirmar cancelamento
          </button>
        </form>
      ) : null}

      <Link
        to={ROUTES.home}
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
      >
        ← Voltar à home
      </Link>
    </Container>
  );
}
