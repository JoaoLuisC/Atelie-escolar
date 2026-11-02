import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { SkeletonDownloadList } from '../components/Skeleton';
import { RefundForm } from '../components/RefundForm';
import { StatusStepper } from '../components/StatusStepper';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  buildDownloadUrl,
  fetchMyRefundRequests,
  fetchMyOrders,
  fetchOrderStatus,
  requestRefund,
} from '../services/downloads';
import { errorMessageOf } from '../utils/api';
import { formatPrice } from '../utils/currency';
import { formatDate } from '../utils/date';
import { trackPurchaseOnce } from '../utils/analytics';
import { ROUTES } from '../constants/routes';

// Mesma forma mínima do checkout. Sem isto, um `?email=abc` ia ao servidor e
// voltava "email é obrigatório" — falso, e em minúsculas (LOJA-43).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usePendingOrderPolling({
  orderId,
  orderEmail,
  paymentStatus,
  setOrder,
  setStatus,
  setPollingStatus,
  pushToast,
}) {
  useEffect(() => {
    if (!orderId || !orderEmail || paymentStatus !== 'pending') {
      setPollingStatus('');
      return undefined;
    }

    let attempts = 0;
    const maxAttempts = 12;

    setPollingStatus('Estamos verificando o pagamento sem você precisar fazer nada.');

    const interval = setInterval(async () => {
      attempts += 1;

      if (attempts > maxAttempts) {
        clearInterval(interval);
        setPollingStatus(
          'Pausamos a verificação automática. Clique em Atualizar quando quiser tentar de novo.',
        );
        return;
      }

      try {
        // Regra C2: a chamada mora em `src/services/downloads.js`. Este
        // polling não recebe AbortSignal de fora — o intervalo é limpo pelo
        // próprio efeito.
        const { response, data } = await fetchOrderStatus({ orderId, email: orderEmail });

        if (!response.ok || !data.success) {
          return;
        }

        const nextStatus = data?.order?.paymentStatus;

        if (nextStatus === 'approved') {
          clearInterval(interval);
          setPollingStatus('Pagamento aprovado. Liberando seus arquivos…');
          setOrder(data.order);
          setStatus('Tudo certo. Seus arquivos estão liberados abaixo.');
          pushToast('Pagamento aprovado. Downloads liberados.', 'success');
          trackPurchaseOnce(data.order?.orderId || orderId, {
            currency: 'BRL',
            value: Number(data.order?.totalAmount || 0),
            items: (data.order?.items || []).map((item) => ({
              item_id: String(item.id),
              item_name: item.title,
              price: Number(item.price || 0),
              quantity: Number(item.quantity || 1),
            })),
          });
          return;
        }

        if (nextStatus === 'rejected' || nextStatus === 'cancelled') {
          clearInterval(interval);
          setPollingStatus('Recebemos o status final do pagamento.');
          setOrder(data.order);
          setStatus(
            'Não conseguimos confirmar este pagamento. Tente novamente em alguns minutos ou nos chame pelo e-mail.',
          );
        }
      } catch (pollError) {
        if (import.meta.env.DEV) {
          console.warn('[downloads] reconsulta falhou:', pollError.message);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [orderId, orderEmail, paymentStatus, pushToast, setOrder, setPollingStatus, setStatus]);
}

// Situação do pedido em português, como a cliente lê no histórico.
const PAYMENT_STATUS_LABELS = {
  approved: 'Aprovado',
  completed: 'Concluído',
  pending: 'Aguardando pagamento',
  in_process: 'Em análise',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  failed: 'Não concluído',
  refunded: 'Estornado',
  charged_back: 'Estornado',
};

/** Itens de pedidos aprovados = o que a cliente pode baixar. */
function countAvailableProducts(orders) {
  return (orders || [])
    .filter((entry) => entry.paymentStatus === 'approved')
    .reduce((total, entry) => total + (entry.items || []).length, 0);
}

const PAYMENT_STATUS_STYLES = {
  approved: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-amber-100 text-amber-800',
  in_process: 'bg-amber-100 text-amber-800',
  refunded: 'bg-slate-200 text-slate-700',
  charged_back: 'bg-slate-200 text-slate-700',
};

const REFUND_STATUS_LABELS = {
  open: 'aberta',
  contacted: 'em conversa',
  accepted: 'aceita',
  declined: 'não aceita',
  resolved: 'resolvida',
};

function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[String(status || '').toLowerCase()] || status || '—';
}

export function DownloadsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { customerSession, updateCustomerName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [order, setOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [emailStatus, setEmailStatus] = useState('');
  const [searchingByEmail, setSearchingByEmail] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [pollingStatus, setPollingStatus] = useState('');
  // E-mail digitado aqui para consultar um pedido sem login (LOJA-42). Fica em
  // estado, e não na URL, pelo mesmo motivo do POST do achado M6.
  const [typedEmail, setTypedEmail] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [activeTab, setActiveTab] = useState(() =>
    new URLSearchParams(location.search).has('order') ? 'history' : 'products',
  );
  const [preparedDownloads, setPreparedDownloads] = useState({});
  const [preparingDownload, setPreparingDownload] = useState('');
  const [refundOrder, setRefundOrder] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundPhone, setRefundPhone] = useState('');
  const [refundPending, setRefundPending] = useState(false);
  const [refundReceipt, setRefundReceipt] = useState('');
  const [refundRequests, setRefundRequests] = useState([]);
  const [refundEligibility, setRefundEligibility] = useState({});
  const [refundCategory, setRefundCategory] = useState('');
  // null = ainda não editado (mostra o nome da sessão); '' = a pessoa apagou o campo.
  const [accountName, setAccountName] = useState(null);
  const [accountSaving, setAccountSaving] = useState(false);

  const loadRefunds = useCallback(() => {
    fetchMyRefundRequests()
      .then(({ requests, eligibility }) => {
        setRefundRequests(requests);
        setRefundEligibility(Object.fromEntries(eligibility.map((item) => [item.orderId, item])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!customerSession?.email) return;
    loadRefunds();
  }, [customerSession?.email, loadRefunds]);

  async function saveAccount(event) {
    event.preventDefault();
    setAccountSaving(true);
    try {
      await updateCustomerName(accountName ?? customerSession?.name ?? '');
      pushToast('Nome atualizado.', 'success');
    } catch (error) {
      pushToast(error?.message || 'Não foi possível salvar sua conta.', 'error');
    } finally {
      setAccountSaving(false);
    }
  }

  const params = new URLSearchParams(location.search);
  const orderId = params.get('order') || localStorage.getItem('lastOrderId') || '';
  // O e-mail é o segundo fator que autoriza a consulta do pedido, mas nunca
  // pode morar na URL: parâmetros aparecem no histórico, nos logs de acesso e
  // são lidos por scripts de analytics. O checkout exige conta, então vem da
  // sessão; links recebidos por e-mail sem login pedem a informação nesta tela.
  const orderEmail = (manualEmail || customerSession?.email || '').trim().toLowerCase();
  const orderEmailIsValid = EMAIL_RE.test(orderEmail);
  const hasSuccessFlag = params.get('success') === '1';
  const isLoggedIn = Boolean(customerSession?.email);

  const loadOrder = useCallback(
    async (signal) => {
      if (!orderId) {
        // Logado, o histórico está logo abaixo — mandar "entrar na conta" era
        // falso (LOJA-41). Deslogado, o convite para entrar já tem caixa
        // própria; repeti-lo aqui só duplicava a frase.
        setStatus(isLoggedIn ? 'Escolha um pedido no seu histórico abaixo.' : '');
        setOrder(null);
        setOrderError('');
        setLoading(false);
        return;
      }
      if (!orderEmail) {
        setStatus('Para consultar este pedido, informe abaixo o e-mail usado na compra.');
        setOrder(null);
        setOrderError('');
        setLoading(false);
        return;
      }
      if (!orderEmailIsValid) {
        setStatus('O e-mail informado não é válido. Confira e informe de novo abaixo.');
        setOrder(null);
        setOrderError('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setStatus('Carregando as informações do seu pedido…');

      try {
        // POST com o e-mail no CORPO (achado M6) — a query string vazava PII por
        // access log/histórico/Referer.
        //
        // Já foi `fetch` cru: `apiRequest` criava o próprio AbortController e
        // SOBRESCREVIA o `signal` do chamador, o que desligaria o cancelamento
        // em troca de pedido/desmontagem. A causa foi corrigida na origem
        // (regra C1) — os dois sinais agora se COMPÕEM, então este caminho tem
        // timeout de 15s sem abrir mão do cancelamento.
        const { response, data } = await fetchOrderStatus({ orderId, email: orderEmail, signal });
        // Requisição substituída por outra (troca de pedido) ou desmontagem:
        // descarta o resultado para não sobrescrever o estado atual.
        if (signal?.aborted) return;

        if (!response.ok || !data.success) {
          throw new Error(errorMessageOf(data) || 'Não foi possível verificar o pedido agora.');
        }

        setOrder(data.order || null);
        setOrderError('');

        if (data.order?.paymentStatus === 'approved') {
          localStorage.removeItem('lastOrderId');
          localStorage.removeItem('lastOrderEmail');
          setStatus('Tudo certo. Seus arquivos estão liberados abaixo.');
          trackPurchaseOnce(data.order?.orderId || orderId, {
            currency: 'BRL',
            value: Number(data.order?.totalAmount || 0),
            items: (data.order?.items || []).map((item) => ({
              item_id: String(item.id),
              item_name: item.title,
              price: Number(item.price || 0),
              quantity: Number(item.quantity || 1),
            })),
          });
        } else if (data.order?.paymentStatus === 'pending') {
          setStatus(
            'Estamos confirmando seu pagamento. Vamos liberar os arquivos assim que aprovar — sem necessidade de recarregar.',
          );
        } else {
          setStatus(
            'Não conseguimos confirmar este pagamento. Tente novamente em alguns minutos ou nos chame pelo e-mail.',
          );
        }
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) return;
        const message = error.message || 'Erro ao carregar downloads.';
        setStatus(message);
        setOrderError(message);
        pushToast(message, 'error');
        setOrder(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [orderId, orderEmail, orderEmailIsValid, isLoggedIn, pushToast],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadOrder(controller.signal);
    return () => controller.abort();
  }, [loadOrder]);

  usePendingOrderPolling({
    orderId,
    orderEmail: orderEmailIsValid ? orderEmail : '',
    paymentStatus: order?.paymentStatus,
    setOrder,
    setStatus,
    setPollingStatus,
    pushToast,
  });

  // Histórico de pedidos: SÓ os do cliente logado. O backend deriva o e-mail da
  // sessão (cookie HttpOnly) — não passamos e-mail arbitrário. `credentials`
  // envia o cookie de sessão. Em `apiRequest` (regra C1) desde que ele passou a
  // compor o `signal` do chamador com o do timeout.
  const loadMyOrders = useCallback(
    async (signal) => {
      if (!customerSession?.email) return;
      setSearchingByEmail(true);
      setEmailStatus('Carregando seus pedidos...');

      try {
        // Sessão expirada NÃO é exceção: é um estado da tela, com texto
        // próprio e caminho de volta para o login. O serviço faz essa
        // distinção.
        const { orders: meusPedidos, sessionExpired } = await fetchMyOrders({ signal });

        if (signal?.aborted) return;

        if (sessionExpired) {
          setOrders([]);
          setEmailStatus('Sua sessão expirou. Faça login novamente para ver seus pedidos.');
          return;
        }

        setOrders(meusPedidos);
        const produtos = countAvailableProducts(meusPedidos);
        setEmailStatus(
          produtos === 0
            ? 'Nenhum produto liberado ainda. Quando um pedido for aprovado, os arquivos aparecem aqui.'
            : `${produtos} ${produtos === 1 ? 'produto disponível' : 'produtos disponíveis'} para baixar.`,
        );
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) return;
        setOrders([]);
        setEmailStatus(error.message || 'Erro ao buscar pedidos.');
      } finally {
        if (!signal?.aborted) setSearchingByEmail(false);
      }
    },
    [customerSession?.email],
  );

  useEffect(() => {
    if (!customerSession?.email) {
      setOrders([]);
      return undefined;
    }
    const controller = new AbortController();
    loadMyOrders(controller.signal);
    return () => controller.abort();
  }, [customerSession?.email, loadMyOrders]);

  function openOrder(orderCode, internalOrderId) {
    const id = orderCode || internalOrderId;
    if (!id) return;
    setActiveTab('history');
    navigate(`/downloads?order=${encodeURIComponent(id)}`);
  }

  async function prepareDownload(entry, item) {
    const orderCode = entry.orderId || entry.internalOrderId;
    const key = `${orderCode}:${item.id}`;
    setPreparingDownload(key);
    try {
      const { response, data } = await fetchOrderStatus({
        orderId: orderCode,
        email: customerSession.email,
      });
      if (!response.ok || !data.success || data.order?.paymentStatus !== 'approved') {
        throw new Error(errorMessageOf(data) || 'Não foi possível preparar o download.');
      }
      const token = (data.order.downloadTokens || []).find(
        (candidate) =>
          String(candidate.productId) === String(item.id) && candidate.available !== false,
      );
      if (!token?.token) throw new Error('Arquivo indisponível. Entre em contato com a loja.');
      setPreparedDownloads((previous) => ({ ...previous, [key]: token.token }));
    } catch (error) {
      pushToast(error.message || 'Não foi possível preparar o download.', 'error');
    } finally {
      setPreparingDownload('');
    }
  }

  const refundFlow = refundEligibility[refundOrder]?.flow || 'simple';

  async function submitRefund(event) {
    event.preventDefault();
    setRefundPending(true);
    try {
      await requestRefund({
        orderId: refundOrder,
        reasonCategory: refundFlow === 'support' ? refundCategory : 'desistencia',
        reason: refundReason,
        phone: refundPhone,
      });
      setRefundReceipt(
        refundFlow === 'support'
          ? `Pedido de suporte do pedido #${refundOrder} recebido. A loja responde em até 5 dias úteis pelo e-mail da conta.`
          : `Desistência do pedido #${refundOrder} registrada. A loja faz o reembolso pelo Mercado Pago e avisa pelo e-mail da conta.`,
      );
      loadRefunds();
      setRefundOrder('');
      setRefundReason('');
      setRefundCategory('');
      setRefundPhone('');
    } catch (error) {
      pushToast(error.message || 'Não foi possível registrar a solicitação.', 'error');
    } finally {
      setRefundPending(false);
    }
  }

  function submitManualEmail(event) {
    event.preventDefault();
    const email = typedEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setStatus('Digite um e-mail válido, como seu@email.com.');
      return;
    }
    setManualEmail(email);
  }

  // Pede o e-mail quando há pedido e o e-mail que temos não serve (ausente ou
  // inválido). Também depois de o servidor não achar o par pedido+e-mail.
  const needsEmail = Boolean(orderId) && (!orderEmailIsValid || Boolean(orderError));

  // O pedido aberto, na lista da conta (a devolução só existe para pedido da conta).
  const openedEntry = orders.find(
    (entry) => String(entry.orderId || entry.internalOrderId) === String(orderId),
  );
  const openedRefund = openedEntry
    ? refundRequests.find((item) => String(item.order_id) === String(openedEntry.internalOrderId))
    : null;

  let statusStep = 0;
  if (order?.paymentStatus === 'approved') {
    statusStep = 2;
  } else if (order?.paymentStatus === 'pending' || pollingStatus) {
    statusStep = 1;
  }

  return (
    <Shell>
      <SEO
        title="Meus produtos"
        description="Acesse os arquivos dos seus pedidos aprovados a qualquer momento."
        pathname="/downloads"
        noindex
      />
      <section className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Pós-compra</p>
          {/* Mesmo nome do link do cabeçalho (LOJA-49). */}
          <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
            Meus produtos
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Seu histórico e seus arquivos em um só lugar.
          </p>
        </header>

        {customerSession?.email ? (
          <nav aria-label="Área do cliente" className="mb-5 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={activeTab === 'products'}
              onClick={() => setActiveTab('products')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === 'products' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
            >
              Produtos
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === 'history' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
            >
              Histórico de pedidos
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'account'}
              onClick={() => setActiveTab('account')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === 'account' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
            >
              Minha conta
            </button>
          </nav>
        ) : null}

        {customerSession?.email && activeTab === 'account' ? (
          <article className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-heading text-lg font-bold text-slate-900">Editar minha conta</h2>
            <form onSubmit={saveAccount} className="mt-4 max-w-md space-y-3">
              <div>
                <label
                  htmlFor="downloads-account-name"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Nome
                </label>
                <input
                  id="downloads-account-name"
                  value={accountName ?? customerSession?.name ?? ''}
                  onChange={(event) => setAccountName(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <p className="text-xs text-slate-500">E-mail: {customerSession.email}</p>
              <button
                type="submit"
                disabled={accountSaving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {accountSaving ? 'Salvando…' : 'Salvar alterações'}
              </button>
              <Link
                to={ROUTES.conta}
                className="ml-3 text-xs font-semibold text-brand-700 hover:underline"
              >
                Privacidade e exclusão da conta
              </Link>
            </form>
          </article>
        ) : null}

        {customerSession?.email && activeTab === 'products' ? (
          <article className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold text-slate-900">
                Seus produtos{' '}
                <span className="ml-1 rounded-full bg-brand-50 px-2.5 py-0.5 align-middle text-sm font-bold text-brand-700">
                  {countAvailableProducts(orders)}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => loadMyOrders()}
                disabled={searchingByEmail}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-60"
              >
                <i className="bi bi-arrow-clockwise" aria-hidden="true" />{' '}
                {searchingByEmail ? 'Atualizando…' : 'Atualizar'}
              </button>
            </div>
            {searchingByEmail ? (
              <p className="mt-2 text-sm text-slate-500">Carregando seus produtos...</p>
            ) : null}
            {!searchingByEmail && countAvailableProducts(orders) === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                {emailStatus ||
                  'Nenhum produto liberado ainda. Quando um pedido for aprovado, os arquivos aparecem aqui.'}
              </p>
            ) : null}
            <ul className="mt-3 space-y-3">
              {orders
                .filter((entry) => entry.paymentStatus === 'approved')
                .flatMap((entry) =>
                  (entry.items || []).map((item) => {
                    const key = `${entry.orderId || entry.internalOrderId}:${item.id}`;
                    return (
                      <li
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                      >
                        <div>
                          <strong className="block text-sm text-slate-800">{item.title}</strong>
                          <span className="text-xs text-slate-500">
                            Pedido #{entry.orderId || entry.internalOrderId}
                          </span>
                        </div>
                        {preparedDownloads[key] ? (
                          <a
                            href={buildDownloadUrl(preparedDownloads[key])}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
                          >
                            Baixar arquivo
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(preparingDownload)}
                            onClick={() => prepareDownload(entry, item)}
                            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {preparingDownload === key ? 'Preparando…' : 'Baixar'}
                          </button>
                        )}
                      </li>
                    );
                  }),
                )}
            </ul>
          </article>
        ) : null}

        {hasSuccessFlag ? (
          <article className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
            <strong className="block font-bold">Pagamento confirmado.</strong>
            Seu pedido foi recebido. Se o status estiver aprovado, os botões de download aparecem
            abaixo.
          </article>
        ) : null}

        {(!customerSession?.email || activeTab === 'history') && (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-bold text-slate-900">
                  {orderId ? `Pedido #${orderId}` : 'Nenhum pedido selecionado'}
                </h3>
                {status ? <p className="text-sm text-slate-500">{status}</p> : null}
              </div>
              {/* Sem pedido não há o que atualizar nem progresso a mostrar
                (LOJA-48): o stepper marcava "Processando" sem pedido nenhum. */}
              {orderId ? (
                <button
                  type="button"
                  onClick={() => loadOrder()}
                  disabled={loading}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {loading ? 'Atualizando…' : 'Atualizar'}
                </button>
              ) : null}
            </div>

            {needsEmail ? (
              <form
                onSubmit={submitManualEmail}
                noValidate
                className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="downloads-order-email"
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    E-mail usado na compra
                  </label>
                  <input
                    id="downloads-order-email"
                    type="email"
                    value={typedEmail}
                    onChange={(event) => setTypedEmail(event.target.value)}
                    placeholder="seu@email.com"
                    maxLength={254}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Consultar pedido
                </button>
              </form>
            ) : null}

            {orderId ? (
              <StatusStepper
                activeStep={statusStep}
                // O `status` já aparece logo acima; repeti-lo aqui duplicava a
                // frase (LOJA-48). O stepper fica com o andamento da verificação.
                description={
                  pollingStatus ||
                  'Acompanhe a liberação em tempo real. Pode fechar a aba e voltar quando quiser.'
                }
                steps={[
                  { label: 'Processando', description: 'Validando a cobrança.' },
                  { label: 'Confirmando', description: 'Organizando os links.' },
                  { label: 'Liberado', description: 'Acesso pronto.' },
                ]}
              />
            ) : null}

            {customerSession?.email ? (
              <div className="mt-5">
                {searchingByEmail ? (
                  <p className="text-xs text-slate-500">Carregando seus pedidos…</p>
                ) : null}
                {!searchingByEmail && orders.length === 0 ? (
                  <p className="text-sm text-slate-500">Você ainda não fez nenhum pedido.</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-700">
                  Para ver o histórico dos seus pedidos e baixar os arquivos, entre na sua conta.
                </p>
                <Link
                  to={`${ROUTES.login}?redirect=${ROUTES.downloads}`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <i className="bi bi-box-arrow-in-right" aria-hidden="true" /> Entrar
                </Link>
              </div>
            )}

            {orderError ? (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <strong className="block text-sm font-bold text-rose-800">
                  Falha ao carregar pedido
                </strong>
                <p className="mt-1 text-xs text-rose-700/80">{orderError}</p>
              </div>
            ) : null}

            {/* Estado de espera: pedido encontrado mas ainda não aprovado.
              Combinamos um aviso suave com skeletons que ancoram o usuário
              no layout que vai aparecer assim que o pagamento confirmar. */}
            {order && order.paymentStatus === 'pending' ? (
              <div className="mt-5 space-y-3">
                <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
                  <i className="bi bi-hourglass-split mr-1.5" aria-hidden="true" />
                  Pagamento ainda em análise. Você não precisa fazer nada — assim que confirmar,
                  seus arquivos aparecem aqui.
                </p>
                <SkeletonDownloadList count={Math.max(1, (order.items || []).length || 2)} />
              </div>
            ) : null}

            {order && order.paymentStatus !== 'approved' && order.paymentStatus !== 'pending' ? (
              <p className="mt-5 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-rose-200">
                <i className="bi bi-x-octagon mr-1.5" aria-hidden="true" />
                Este pedido não foi aprovado. Se já tentou pagar e o valor foi cobrado, nos chame
                por e-mail que verificamos.
              </p>
            ) : null}

            {/* Carga inicial com orderId conhecido: skeleton enquanto o backend responde. */}
            {loading && orderId && !order ? (
              <div className="mt-5 space-y-2">
                <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                  Arquivos disponíveis
                </h4>
                <SkeletonDownloadList count={2} />
              </div>
            ) : null}

            {orders.length > 0 ? (
              <div className="mt-5">
                <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                  Histórico de pedidos
                </h4>
                <ul className="flex flex-col gap-2">
                  {orders.map((entry) => {
                    const code = entry.orderId || entry.internalOrderId;
                    const refund = refundRequests.find(
                      (item) => String(item.order_id) === String(entry.internalOrderId),
                    );
                    const isOpen = String(code) === String(orderId);
                    const itemCount = (entry.items || []).length;
                    const paymentStatus = entry.paymentStatus || entry.status;
                    return (
                      <li key={`${entry.orderId}-${entry.internalOrderId || ''}`}>
                        {/* A linha inteira abre o pedido: um alvo só, sem botões soltos. */}
                        <button
                          type="button"
                          aria-label={`Abrir pedido ${code}`}
                          aria-current={isOpen ? 'true' : undefined}
                          onClick={() => openOrder(entry.orderId, entry.internalOrderId)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                            isOpen
                              ? 'bg-brand-50 ring-1 ring-brand-200'
                              : 'bg-slate-50 hover:bg-slate-100'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <strong className="block text-sm text-slate-900">Pedido #{code}</strong>
                            <span className="block text-xs text-slate-500">
                              {entry.createdAt ? `${formatDate(entry.createdAt)} · ` : ''}
                              {itemCount} {itemCount === 1 ? 'item' : 'itens'} ·{' '}
                              {formatPrice(entry.totalAmount)}
                            </span>
                            {refund ? (
                              <span className="mt-1 block text-xs font-semibold text-violet-700">
                                Devolução {REFUND_STATUS_LABELS[refund.status] || refund.status}
                              </span>
                            ) : null}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              PAYMENT_STATUS_STYLES[String(paymentStatus || '').toLowerCase()] ||
                              'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {paymentStatusLabel(paymentStatus)}
                          </span>
                          <i
                            className="bi bi-chevron-right shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Devolução: dentro do pedido aberto, não na lista. */}
            {openedEntry && customerSession?.email && order?.paymentStatus === 'approved' ? (
              <div className="mt-5 rounded-xl border border-slate-200 p-4">
                {openedRefund ? (
                  <p className="text-sm text-slate-700">
                    <strong className="text-violet-700">
                      Devolução {REFUND_STATUS_LABELS[openedRefund.status] || openedRefund.status}.
                    </strong>
                    {openedRefund.admin_response
                      ? ` Resposta da loja: ${openedRefund.admin_response}`
                      : ' A loja responde pelo e-mail da sua conta e aqui mesmo.'}
                  </p>
                ) : refundReceipt ? (
                  <p role="status" className="text-sm text-emerald-800">
                    {refundReceipt}
                  </p>
                ) : refundOrder === openedEntry.orderId ? null : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      {refundEligibility[openedEntry.orderId]?.flow === 'support'
                        ? 'Problema com o arquivo? Peça suporte ou devolução.'
                        : 'Mudou de ideia? Você pode desistir desta compra.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRefundReceipt('');
                        setRefundCategory('');
                        setRefundOrder(openedEntry.orderId);
                      }}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700"
                    >
                      {refundEligibility[openedEntry.orderId]?.flow === 'support'
                        ? 'Pedir suporte ou devolução'
                        : 'Desistir da compra'}
                    </button>
                  </div>
                )}
                {refundOrder && refundOrder === openedEntry.orderId ? (
                  <RefundForm
                    orderId={refundOrder}
                    eligibility={refundEligibility[refundOrder]}
                    category={refundCategory}
                    reason={refundReason}
                    phone={refundPhone}
                    pending={refundPending}
                    onCategoryChange={setRefundCategory}
                    onReasonChange={setRefundReason}
                    onPhoneChange={setRefundPhone}
                    onSubmit={submitRefund}
                    onCancel={() => setRefundOrder('')}
                  />
                ) : null}
              </div>
            ) : null}

            {order?.paymentStatus === 'approved' ? (
              <div className="mt-5">
                <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                  Arquivos disponíveis
                </h4>
                {(order.downloadTokens || []).length === 0 ? (
                  <div className="space-y-3">
                    <p className="rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-800 ring-1 ring-sky-200">
                      <i className="bi bi-arrow-clockwise mr-1.5" aria-hidden="true" />
                      Tudo certo com o pagamento — estamos preparando os arquivos. Em alguns
                      segundos clique em Atualizar.
                    </p>
                    <SkeletonDownloadList count={Math.max(1, (order.items || []).length || 1)} />
                  </div>
                ) : (
                  <>
                    <ul className="flex flex-col gap-2">
                      {(order.downloadTokens || []).map((item) => (
                        <li
                          key={item.token}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gradient-to-br from-brand-50 to-white p-3 ring-1 ring-brand-100"
                        >
                          <div className="min-w-0">
                            <strong className="block text-sm text-slate-800">
                              {item.productName || `Produto ${item.productId}`}
                            </strong>
                            <p className="text-xs text-slate-500">
                              Token vinculado ao pedido aprovado.
                            </p>
                          </div>
                          {/* `available === false` = o servidor não reemitiu o link
                            (teto de downloads do item). Um "Baixar" aqui daria 401. */}
                          {item.available === false ? (
                            <span className="text-xs font-semibold text-slate-500">
                              Limite de downloads atingido — fale conosco
                            </span>
                          ) : (
                            <a
                              href={buildDownloadUrl(item.token)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
                            >
                              <i className="bi bi-download" /> Baixar
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-slate-500">
                      Cada link é de uso único e expira por segurança. Se um download não abrir ou o
                      link já tiver sido usado, clique em <strong>Atualizar</strong> acima para
                      gerar novos links — ou nos chame por e-mail.
                    </p>
                  </>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                to={ROUTES.produtos}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Voltar para produtos
              </Link>
              <Link
                to={ROUTES.checkout}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Ir para checkout
              </Link>
            </div>
          </article>
        )}
      </section>
    </Shell>
  );
}
