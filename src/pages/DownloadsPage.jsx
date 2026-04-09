import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
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
      } catch {
        // Nao interromper polling por falha transitoria
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
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [searchingByEmail, setSearchingByEmail] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [pollingStatus, setPollingStatus] = useState('');

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

  async function loadOrdersByEmail(event) {
    event.preventDefault();

    if (!email.trim() || !email.includes('@')) {
      setEmailStatus('Informe um e-mail valido para buscar pedidos.');
      return;
    }

    setSearchingByEmail(true);
    setEmailStatus('Buscando historico...');

    try {
      const response = await fetch(`${getApiBaseUrl()}/customer-orders?email=${encodeURIComponent(email.trim())}`);
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

  return (
    <Shell>
      <section className="page-section">
        <p className="eyebrow">Pos-compra</p>
        <h1>Meus Downloads</h1>
        <p>Seu historico e seus arquivos, com a mesma experiencia visual consolidada da loja.</p>
      </section>

      <section className="downloads-wrap products-preview-section">
        <div className="container">
        {hasSuccessFlag ? (
          <article className="card success-card">
            <h3>Pagamento confirmado</h3>
            <p>Seu pedido foi recebido. Se o status estiver aprovado, os botoes de download ja aparecem abaixo.</p>
          </article>
        ) : null}

        <article className="card downloads-card">
          <div className="downloads-head">
            <div>
              <h3>Pedido {orderId ? `#${orderId}` : ''}</h3>
              <p>{status}</p>
            </div>

            <button type="button" className="button secondary small" onClick={loadOrder} disabled={loading}>
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>

          {pollingStatus ? <p className="downloads-polling-status">{pollingStatus}</p> : null}

          <form className="downloads-search" onSubmit={loadOrdersByEmail}>
            <label htmlFor="downloads-email">Buscar pedidos por e-mail</label>
            <div className="downloads-search-row">
              <input
                id="downloads-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                disabled={searchingByEmail}
              />
              <button type="submit" className="button secondary small" disabled={searchingByEmail}>
                {searchingByEmail ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {emailStatus ? <p className="downloads-search-status">{emailStatus}</p> : null}
          </form>

          {orderId ? null : (
            <div className="downloads-empty-state">
              <h4>Nenhum pedido selecionado</h4>
              <p>Informe um pedido via checkout ou pesquise pelo seu e-mail para localizar compras.</p>
            </div>
          )}

          {orderId && order === null && !orderError ? (
            <p className="empty-text">Quando voce concluir um pagamento, os downloads aparecerao aqui.</p>
          ) : null}

          {orderError ? (
            <div className="downloads-error-state">
              <h4>Falha ao carregar pedido</h4>
              <p>{orderError}</p>
            </div>
          ) : null}

          {order && order.paymentStatus !== 'approved' ? (
            <p className="empty-text">Seu pedido ainda nao foi aprovado para download.</p>
          ) : null}

          {orders.length > 0 ? (
            <div className="downloads-history">
              <h4>Historico de Pedidos</h4>
              {orders.map((entry) => (
                <article className="download-history-card" key={`${entry.orderId}-${entry.internalOrderId || ''}`}>
                  <div>
                    <strong>Pedido #{entry.orderId || entry.internalOrderId}</strong>
                    <p>
                      Status: {entry.paymentStatus || entry.status} | Total: {formatPrice(entry.totalAmount)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => openOrder(entry.orderId, entry.internalOrderId)}
                  >
                    Abrir pedido
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {order?.paymentStatus === 'approved' ? (
            <div className="downloads-list">
              {(order.downloadTokens || []).map((item) => (
                <article className="download-item-card" key={item.token}>
                  <div>
                    <strong>{item.productName || `Produto ${item.productId}`}</strong>
                    <p>Token vinculado ao pedido aprovado.</p>
                  </div>
                  <a className="button primary small" href={`/api/download?token=${item.token}`}>
                    Baixar
                  </a>
                </article>
              ))}
            </div>
          ) : null}

          {order?.paymentStatus === 'approved' && (order.downloadTokens || []).length === 0 ? (
            <div className="downloads-empty-state">
              <h4>Pedido aprovado sem arquivos</h4>
              <p>
                Ainda nao recebemos os links de download para este pedido. Aguarde alguns instantes e clique em
                Atualizar.
              </p>
            </div>
          ) : null}

          <div className="downloads-actions">
            <Link to="/produtos" className="button secondary small">
              Voltar para produtos
            </Link>
            <Link to="/checkout" className="button secondary small">
              Ir para checkout
            </Link>
          </div>
        </article>
        </div>
      </section>
    </Shell>
  );
}
