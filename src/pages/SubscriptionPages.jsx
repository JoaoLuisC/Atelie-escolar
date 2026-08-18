import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { apiRequest, errorMessageOf } from '../utils/api';
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

// ════════════════════════════════════════════════════════════════════
// /confirmar-inscricao?token=...
// ════════════════════════════════════════════════════════════════════
export function ConfirmSubscriptionPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState({ state: 'loading', message: 'Confirmando sua inscrição…' });

  useEffect(() => {
    const token = params.get('token') || '';
    if (!token) {
      setStatus({
        state: 'error',
        message: 'Link inválido. Volte ao seu email e clique no botão de confirmação.',
      });
      return;
    }

    (async () => {
      try {
        // Regra C1: `apiRequest` no lugar de `fetch` cru — traz timeout de 15s
        // (esta tela ficava carregando para sempre numa rede ruim) e normaliza
        // a resposta. Regra A1: o backend agora usa status real (404 token
        // inválido, 409 cancelada, 410 expirada) em vez de 200 com
        // `confirmed:false`, então a checagem é `success`, não `confirmed`.
        const { data } = await apiRequest(
          `/confirm-subscription?token=${encodeURIComponent(token)}`,
        );
        if (!data.success) {
          setStatus({
            state: 'error',
            message: errorMessageOf(data) || 'Token inválido ou expirado.',
          });
          return;
        }
        setStatus({
          state: 'success',
          message: data.alreadyConfirmed
            ? 'Você já tinha confirmado antes — está tudo certo!'
            : 'Inscrição confirmada! Você vai receber as novidades por email.',
          email: data.email,
        });
      } catch (err) {
        setStatus({ state: 'error', message: err.message || 'Erro de conexão.' });
      }
    })();
  }, [params]);

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
  const [emailInput, setEmailInput] = useState(params.get('email') || '');
  const [status, setStatus] = useState({ state: 'idle', message: '' });

  useEffect(() => {
    const token = params.get('token') || '';
    if (!token) return;

    (async () => {
      setStatus({ state: 'loading', message: 'Cancelando sua inscrição…' });
      try {
        // Regra C1: cliente HTTP único, com timeout.
        const { data } = await apiRequest(`/unsubscribe?token=${encodeURIComponent(token)}`);
        setStatus({
          state: data.success ? 'success' : 'error',
          message: data.message || errorMessageOf(data) || 'Algo deu errado.',
        });
      } catch (err) {
        setStatus({ state: 'error', message: err.message || 'Erro de conexão.' });
      }
    })();
  }, [params]);

  async function onSubmit(event) {
    event.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      setStatus({ state: 'error', message: 'Informe um email válido.' });
      return;
    }
    setStatus({ state: 'loading', message: 'Cancelando…' });

    try {
      const { data } = await apiRequest('/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // `confirmationRequired` é o estado "enviamos um e-mail de confirmação e
      // NADA foi removido ainda". Antes ele chegava como `success: false`, o
      // que pintava a tela de erro para uma operação que deu certo — e obrigava
      // o backend a mentir no envelope da regra A1. Aqui ele é o que é: um
      // estado de domínio, num corpo de sucesso.
      setStatus({
        state: data.confirmationRequired ? 'pending' : data.success ? 'success' : 'error',
        message: data.message || errorMessageOf(data) || 'Algo deu errado.',
      });
    } catch (err) {
      setStatus({ state: 'error', message: err.message || 'Erro de conexão.' });
    }
  }

  const isSuccess = status.state === 'success';
  const showForm = !params.get('token') && status.state !== 'success';

  return (
    <Container>
      <SEO title="Cancelar inscrição" pathname="/desinscrever" noindex />
      <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
        {isSuccess ? '✓ Cancelado' : 'Cancelar inscrição'}
      </p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
        {isSuccess ? 'Pronto, você foi removido' : 'Cancelar inscrição'}
      </h1>
      {status.message ? (
        <p className={`mt-3 max-w-md text-sm ${isSuccess ? 'text-emerald-700' : 'text-slate-600'}`}>
          {status.message}
        </p>
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
