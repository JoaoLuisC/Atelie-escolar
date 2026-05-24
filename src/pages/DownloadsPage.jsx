import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Shell } from '../components/Shell';
import { StatusStepper } from '../components/StatusStepper';
import { useToast } from '../hooks/useToast';
import { getApiBaseUrl } from '../utils/api';
import { formatPrice } from '../utils/currency';

function usePendingOrderPolling({ orderId, paymentStatus, setOrder, setStatus, setPollingStatus, pushToast }) {
  useEffect(() => {
    if (!orderId || paymentStatus !== 'pending') {
      setPollingStatus('');
      return undefined;
    }

    let attempts = 0;
    const maxAttempts = 12;

    setPollingStatus('Reconsultando automaticamente a cada 10 segundos...');

    const interval = setInterval(async () => {
      attempts += 1;

      if (attempts > maxAttempts) {
        clearInterval(interval);
        setPollingStatus('Reconsulta automatica encerrada. Clique em Atualizar para tentar novamente.');
        return;
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/verify-payment?orderId=${orderId}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          return;
        }

        const nextStatus = data?.order?.paymentStatus;

        if (nextStatus === 'approved') {
          clearInterval(interval);
          setPollingStatus('Pagamento aprovado na reconsulta automatica.');
          setOrder(data.order);
          setStatus('Pagamento aprovado. Seus downloads estao liberados.');
          pushToast('Pagamento aprovado. Downloads liberados.', 'success');
          return;
        }

        if (nextStatus === 'rejected' || nextStatus === 'cancelled') {
          clearInterval(interval);
          setPollingStatus('Pagamento retornou como nao aprovado.');
          setOrder(data.order);
          setStatus('Pagamento nao aprovado para este pedido.');
        }
      } catch (pollError) {
        if (import.meta.env.DEV) {
          console.warn('[downloads] reconsulta falhou:', pollError.message);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [orderId, paymentStatus, pushToast, setOrder, setPollingStatus, setStatus]);
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function DownloadsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [order, setOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [emailStatus, setEmailStatus] = useState('');
  const [searchingByEmail, setSearchingByEmail] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [pollingStatus, setPollingStatus] = useState('');
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm({
    defaultValues: {
      email: '',
    },
    mode: 'onSubmit',
  });

  const params = new URLSearchParams(location.search);
  const orderId = params.get('order') || localStorage.getItem('lastOrderId') || '';
  const hasSuccessFlag = params.get('success') === '1';

  async function loadOrder() {
    if (!orderId) {
      setStatus('Nenhum pedido encontrado para exibir downloads.');
      setOrder(null);
      setOrderError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus('Verificando pedido...');

    try {
      const response = await fetch(`${getApiBaseUrl()}/verify-payment?orderId=${orderId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Nao foi possivel verificar o pedido.');
      }

      setOrder(data.order || null);
      setOrderError('');

      if (data.order?.paymentStatus === 'approved') {
        localStorage.removeItem('lastOrderId');
        setStatus('Pagamento aprovado. Seus downloads estao liberados.');
      } else if (data.order?.paymentStatus === 'pending') {
        setStatus('Pagamento pendente. Atualize para verificar novamente.');
      } else {
        setStatus('Pagamento nao aprovado para este pedido.');
      }
    } catch (error) {
      const message = error.message || 'Erro ao carregar downloads.';
      setStatus(message);
      setOrderError(message);
      pushToast(message, 'error');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  usePendingOrderPolling({
    orderId,
    paymentStatus: order?.paymentStatus,
    setOrder,
    setStatus,
    setPollingStatus,
    pushToast,
  });

  async function loadOrdersByEmail(formData) {
    const email = formData.email.trim();
    setSearchingByEmail(true);
    setEmailStatus('Buscando historico...');

    try {
      const response = await fetch(`${getApiBaseUrl()}/customer-orders?email=${encodeURIComponent(email)}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Nao foi possivel carregar os pedidos.');
      }

      setOrders(data.orders || []);

      if ((data.orders || []).length === 0) {
        setEmailStatus('Nenhum pedido encontrado para este e-mail.');
      } else {
        setEmailStatus(`Encontramos ${(data.orders || []).length} pedido(s).`);
      }
    } catch (error) {
      setOrders([]);
      setEmailStatus(error.message || 'Erro ao buscar pedidos.');
    } finally {
      setSearchingByEmail(false);
    }
  }

  function openOrder(orderCode, internalOrderId) {
    const id = orderCode || internalOrderId;
    if (!id) return;
    navigate(`/downloads?order=${encodeURIComponent(id)}`);
  }

  let statusStep = 0;
  if (order?.paymentStatus === 'approved') {
    statusStep = 2;
  } else if (order?.paymentStatus === 'pending' || pollingStatus) {
    statusStep = 1;
  }

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50';

  return (
    <Shell>
      <section className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Pós-compra</p>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">Meus Downloads</h1>
          <p className="mt-2 text-sm text-slate-600">Seu histórico e seus arquivos em um só lugar.</p>
        </header>

        {hasSuccessFlag ? (
          <article className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
            <strong className="block font-bold">Pagamento confirmado.</strong>
            Seu pedido foi recebido. Se o status estiver aprovado, os botões de download aparecem abaixo.
          </article>
        ) : null}

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-heading text-lg font-bold text-slate-900">
                {orderId ? `Pedido #${orderId}` : 'Nenhum pedido selecionado'}
              </h3>
              {status ? <p className="text-sm text-slate-500">{status}</p> : null}
            </div>
            <button
              type="button"
              onClick={loadOrder}
              disabled={loading}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>

          <StatusStepper
            activeStep={statusStep}
            description={pollingStatus || status || 'Acompanhe a liberação em tempo real.'}
            steps={[
              { label: 'Processando', description: 'Validando a cobrança.' },
              { label: 'Confirmando', description: 'Organizando os links.' },
              { label: 'Liberado', description: 'Acesso pronto.' },
            ]}
          />

          <form onSubmit={handleSubmit(loadOrdersByEmail)} noValidate className="mt-5">
            <label htmlFor="downloads-email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Buscar pedidos por e-mail
            </label>
            <div className="flex gap-2">
              <input
                id="downloads-email"
                type="email"
                placeholder="seu@email.com"
                disabled={searchingByEmail}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'downloads-email-error' : undefined}
                className={inputClass}
                {...register('email', {
                  required: 'Informe o e-mail usado na compra.',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Digite um e-mail válido.' },
                })}
              />
              <button
                type="submit"
                disabled={searchingByEmail}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:bg-brand-300"
              >
                {searchingByEmail ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {errors.email ? (
              <p id="downloads-email-error" role="alert" className="mt-1 text-xs text-rose-700">{errors.email.message}</p>
            ) : null}
            {emailStatus ? <p className="mt-2 text-xs text-slate-500">{emailStatus}</p> : null}
          </form>

          {orderError ? (
            <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <strong className="block text-sm font-bold text-rose-800">Falha ao carregar pedido</strong>
              <p className="mt-1 text-xs text-rose-700/80">{orderError}</p>
            </div>
          ) : null}

          {order && order.paymentStatus !== 'approved' ? (
            <p className="mt-5 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
              Seu pedido ainda não foi aprovado para download.
            </p>
          ) : null}

          {orders.length > 0 ? (
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">Histórico de pedidos</h4>
              <ul className="flex flex-col gap-2">
                {orders.map((entry) => (
                  <li key={`${entry.orderId}-${entry.internalOrderId || ''}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                    <div className="min-w-0">
                      <strong className="block text-sm text-slate-800">Pedido #{entry.orderId || entry.internalOrderId}</strong>
                      <p className="text-xs text-slate-500">
                        Status: {entry.paymentStatus || entry.status} · Total: {formatPrice(entry.totalAmount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openOrder(entry.orderId, entry.internalOrderId)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Abrir pedido
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {order?.paymentStatus === 'approved' ? (
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">Arquivos disponíveis</h4>
              {(order.downloadTokens || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
                  <strong className="block text-sm text-slate-800">Pedido aprovado sem arquivos</strong>
                  <p className="mt-1 text-xs text-slate-500">
                    Aguarde alguns instantes e clique em Atualizar.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {(order.downloadTokens || []).map((item) => (
                    <li key={item.token} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gradient-to-br from-brand-50 to-white p-3 ring-1 ring-brand-100">
                      <div className="min-w-0">
                        <strong className="block text-sm text-slate-800">{item.productName || `Produto ${item.productId}`}</strong>
                        <p className="text-xs text-slate-500">Token vinculado ao pedido aprovado.</p>
                      </div>
                      <a
                        href={`/api/download?token=${item.token}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
                      >
                        <i className="bi bi-download" /> Baixar
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/produtos" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Voltar para produtos
            </Link>
            <Link to="/checkout" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Ir para checkout
            </Link>
          </div>
        </article>
      </section>
    </Shell>
  );
}
