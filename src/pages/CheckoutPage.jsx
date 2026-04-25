import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Shell } from '../components/Shell';
import { StatusStepper } from '../components/StatusStepper';
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
  const [status, setStatus] = useState('');
  const [processing, setProcessing] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm({
    defaultValues: {
      email: customerSession?.email || '',
      name: customerSession?.name || '',
    },
    mode: 'onSubmit',
  });

  const currentName = watch('name');
  const currentEmail = watch('email');

  useEffect(() => {
    if (customerSession?.email) {
      setValue('email', customerSession.email, { shouldValidate: true });
    }
    if (customerSession?.name) {
      setValue('name', customerSession.name, { shouldValidate: true });
    }
  }, [customerSession, setValue]);

  const statusStep = useMemo(() => {
    if (status.includes('aprovado')) return 2;
    if (status.includes('Aguardando')) return 1;
    if (processing) return 0;
    return 0;
  }, [processing, status]);

  const stepperDescription = useMemo(() => {
    if (processing) {
      return 'Criando pagamento e abrindo a cobrança.';
    }

    if (status.includes('Aguardando')) {
      return 'Acompanhando a confirmação do pagamento em tempo real.';
    }

    if (status.includes('aprovado')) {
      return 'Pagamento confirmado. Os próximos passos já estão liberados.';
    }

    return 'Preencha seus dados e avance para o pagamento.';
  }, [processing, status]);

  async function onSubmit(formData) {
    const name = formData.name.trim();
    const email = formData.email.trim();

    if (!cart.length) {
      setStatus('Seu carrinho esta vazio.');
      return;
    }

    setProcessing(true);
    setStatus('Criando pagamento...');

    try {
      const payload = {
        items: cart.map((item) => ({ productId: item.id, quantity: item.quantity || 1 })),
        customer: { name, email },
      };

      if (email && customerSession?.email !== email) {
        setCustomerSession({
          email,
          name,
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
      <section className="checkout-wrap products-preview-section">
        <div className="container">
          <div className="checkout-grid">
            <article className="card checkout-card checkout-summary-card">
              <div className="checkout-summary-head">
                <div>
                  <p className="checkout-kicker">Resumo do Pedido</p>
                  <h3>Seu Carrinho</h3>
                </div>
                <span className="checkout-summary-chip">Seguro e instantaneo</span>
              </div>

              {cart.length === 0 ? <p className="empty-text">Seu carrinho esta vazio.</p> : null}

              <div className="checkout-summary-list">
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
              </div>

              <div className="checkout-total checkout-total-emphasis">
                <span>Total</span>
                <strong>{formatPrice(total)}</strong>
              </div>

              <p className="checkout-summary-note">Apos a aprovacao, seus arquivos ficam disponiveis automaticamente na area de downloads.</p>
            </article>

            <article className="card checkout-card checkout-payment-card">
              <div className="checkout-payment-head">
                <div>
                  <p className="checkout-kicker">Finalizacao segura</p>
                  <h3>Dados para Pagamento</h3>
                </div>
              </div>

              <StatusStepper
                activeStep={statusStep}
                description={stepperDescription}
                steps={[
                  { label: 'Processando Pagamento', description: 'Geracao e abertura da cobranca.' },
                  { label: 'Preparando Arquivos', description: 'Aguardando confirmacao do pagamento.' },
                  { label: 'Download Liberado', description: 'Acesso imediato aos arquivos.' },
                ]}
              />

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

              <form className="checkout-form checkout-form-elevated" onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="form-field">
                  <label htmlFor="checkout-name">Nome completo</label>
                  <input
                    id="checkout-name"
                    type="text"
                    placeholder="Seu nome"
                    disabled={processing}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'checkout-name-error' : undefined}
                    {...register('name', {
                      required: 'Informe o nome completo para continuar.',
                      minLength: {
                        value: 3,
                        message: 'Informe pelo menos 3 caracteres no nome.',
                      },
                    })}
                  />
                  {errors.name ? (
                    <p className="form-error" id="checkout-name-error" role="alert">
                      {errors.name.message}
                    </p>
                  ) : null}
                </div>

                <div className="form-field">
                  <label htmlFor="checkout-email">E-mail</label>
                  <input
                    id="checkout-email"
                    type="email"
                    placeholder="seu@email.com"
                    disabled={processing}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'checkout-email-error' : undefined}
                    {...register('email', {
                      required: 'Informe um e-mail valido para receber a confirmacao.',
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: 'Digite um e-mail valido, como nome@dominio.com.',
                      },
                    })}
                  />
                  {errors.email ? (
                    <p className="form-error" id="checkout-email-error" role="alert">
                      {errors.email.message}
                    </p>
                  ) : null}
                </div>

                <div className="checkout-cta-panel">
                  <button type="submit" className="button primary checkout-cta" disabled={processing || !cart.length}>
                    {processing ? 'Processando...' : 'Ir para pagamento'}
                  </button>

                  <div className="checkout-trust-badges" aria-label="Selos de confianca">
                    <span className="checkout-trust-badge">
                      <i className="bi bi-shield-lock-fill" /> Compra segura
                    </span>
                    <span className="checkout-trust-badge">
                      <i className="bi bi-credit-card-2-front-fill" /> Pagamento verificado
                    </span>
                    <span className="checkout-trust-badge">
                      <i className="bi bi-stars" /> Download garantido
                    </span>
                  </div>
                </div>
              </form>

              {status ? <output className="checkout-status">{status}</output> : null}
              {currentName || currentEmail ? <p className="checkout-inline-note checkout-inline-note-muted">Conferindo cadastro de <strong>{currentName || 'cliente'}</strong>.</p> : null}
            </article>
          </div>
        </div>
      </section>
    </Shell>
  );
}
