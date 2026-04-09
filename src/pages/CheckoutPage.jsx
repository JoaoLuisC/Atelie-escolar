import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { getApiBaseUrl } from '../utils/api';
import { formatPrice } from '../utils/currency';

export function CheckoutPage() {
  const navigate = useNavigate();
  const { customerSession, setCustomerSession } = useAuth();
  const { cart, total, removeFromCart, clearCart } = useCart();
  const { pushToast } = useToast();
  const [name, setName] = useState(customerSession?.name || '');
  const [email, setEmail] = useState(customerSession?.email || '');
  const [status, setStatus] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (customerSession?.email) {
      setEmail(customerSession.email);
    }
    if (customerSession?.name) {
      setName(customerSession.name);
    }
  }, [customerSession]);

  async function onSubmit(event) {
    event.preventDefault();

    if (!cart.length) {
      setStatus('Seu carrinho esta vazio.');
      return;
    }

    if (!name.trim() || !email.trim()) {
      setStatus('Preencha nome e e-mail para continuar.');
      return;
    }

    setProcessing(true);
    setStatus('Criando pagamento...');

    try {
      const payload = {
        items: cart.map((item) => ({ productId: item.id, quantity: item.quantity || 1 })),
        customer: { name: name.trim(), email: email.trim() },
      };

      if (email.trim() && customerSession?.email !== email.trim()) {
        setCustomerSession({
          email: email.trim(),
          name: name.trim(),
        });
      }

      const response = await fetch(`${getApiBaseUrl()}/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao criar pagamento.');
      }

      localStorage.setItem('lastOrderId', String(data.orderId || ''));

      const paymentUrl = data.initPoint || data.sandboxInitPoint;
      if (!paymentUrl) {
        throw new Error('URL de pagamento nao retornada pela API.');
      }

      window.open(paymentUrl, '_blank');
      pushToast('Pagamento criado. Aguardando confirmacao.', 'info');
      setStatus('Aguardando confirmacao do pagamento...');

      const maxAttempts = 150;
      let attempts = 0;

      const interval = setInterval(async () => {
        attempts += 1;
        if (attempts > maxAttempts) {
          clearInterval(interval);
          setProcessing(false);
          setStatus('Tempo de espera excedido. Voce pode verificar mais tarde em Downloads.');
          return;
        }

        try {
          const verifyResponse = await fetch(`${getApiBaseUrl()}/verify-payment?orderId=${data.orderId}`);
          const verifyData = await verifyResponse.json();
          const paymentStatus = verifyData?.order?.paymentStatus;

          if (paymentStatus === 'approved') {
            clearInterval(interval);
            clearCart();
            setProcessing(false);
            pushToast('Pagamento aprovado.', 'success');
            setStatus('Pagamento aprovado. Redirecionando para downloads...');
            navigate(`/downloads?order=${data.orderId}&success=1`);
            return;
          }

          if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
            clearInterval(interval);
            setProcessing(false);
            setStatus('Pagamento nao aprovado. Tente novamente.');
            pushToast('Pagamento nao aprovado.', 'warning');
          }
        } catch {
          // Repetir na proxima tentativa
        }
      }, 4000);
    } catch (submitError) {
      setProcessing(false);
      const message = submitError.message || 'Erro ao processar checkout.';
      setStatus(message);
      pushToast(message, 'error');
    }
  }

  return (
    <Shell>
      <section className="page-section">
        <p className="eyebrow">Checkout</p>
        <h1>Checkout</h1>
        <p>Fluxo de compra moderno, com a mesma linguagem visual da loja legado.</p>
      </section>

      <section className="checkout-wrap products-preview-section">
        <div className="container">
        <div className="checkout-grid">
          <article className="card checkout-card">
            <h3>Seu Carrinho</h3>

            {cart.length === 0 ? <p className="empty-text">Seu carrinho esta vazio.</p> : null}

            {cart.map((item) => (
              <div key={item.id} className="checkout-item">
                <div className="checkout-item-main">
                  <strong>{item.name}</strong>
                  <span>{formatPrice(item.price)}</span>
                </div>
                <button type="button" className="button secondary small" onClick={() => removeFromCart(item.id)}>
                  Remover
                </button>
              </div>
            ))}

            <div className="checkout-total">
              <span>Total</span>
              <strong>{formatPrice(total)}</strong>
            </div>
          </article>

          <article className="card checkout-card">
            <h3>Dados para Pagamento</h3>

            {customerSession?.email ? (
              <p className="checkout-inline-note">
                Comprando como <strong>{customerSession.email}</strong>
              </p>
            ) : (
              <p className="checkout-inline-note">
                Entre na sua conta para preencher seus dados automaticamente.{' '}
                <Link to="/login?mode=login&redirect=/checkout">Entrar agora</Link>
              </p>
            )}

            <form className="checkout-form" onSubmit={onSubmit}>
              <label htmlFor="checkout-name">Nome completo</label>
              <input
                id="checkout-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Seu nome"
                disabled={processing}
              />

              <label htmlFor="checkout-email">E-mail</label>
              <input
                id="checkout-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                disabled={processing}
              />

              <button type="submit" className="button primary" disabled={processing || !cart.length}>
                {processing ? 'Processando...' : 'Ir para pagamento'}
              </button>
            </form>

            {status ? <p className="checkout-status">{status}</p> : null}
          </article>
        </div>
        </div>
      </section>
    </Shell>
  );
}
