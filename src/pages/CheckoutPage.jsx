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
  const [pendingOrderId, setPendingOrderId] = useState('');
  const {
    formState: { errors },
    handleSubmit,
    register,
    setValue,
  } = useForm({
    defaultValues: {
      email: customerSession?.email || '',
      name: customerSession?.name || '',
    },
    mode: 'onSubmit',
  });

  useEffect(() => {
    if (customerSession?.email) {
      setValue('email', customerSession.email, { shouldValidate: true });
    }
    if (customerSession?.name) {
      setValue('name', customerSession.name, { shouldValidate: true });
    }
  }, [customerSession, setValue]);

  useEffect(() => {
    if (!pendingOrderId) return undefined;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 150;

    const interval = setInterval(async () => {
      if (cancelled) return;
      attempts += 1;

      if (attempts > maxAttempts) {
        clearInterval(interval);
        if (!cancelled) {
          setProcessing(false);
          setPendingOrderId('');
          setStatus('Tempo de espera excedido. Voce pode verificar mais tarde em Downloads.');
        }
        return;
      }

      try {
        const verifyResponse = await fetch(`${getApiBaseUrl()}/verify-payment?orderId=${pendingOrderId}`);
        const verifyData = await verifyResponse.json();
        if (cancelled) return;
        const paymentStatus = verifyData?.order?.paymentStatus;

        if (paymentStatus === 'approved') {
          clearInterval(interval);
          clearCart();
          setProcessing(false);
          setPendingOrderId('');
          pushToast('Pagamento aprovado.', 'success');
          setStatus('Pagamento aprovado. Redirecionando para downloads...');
          navigate(`/downloads?order=${pendingOrderId}&success=1`);
          return;
        }

        if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
          clearInterval(interval);
          setProcessing(false);
          setPendingOrderId('');
          setStatus('Pagamento nao aprovado. Tente novamente.');
          pushToast('Pagamento nao aprovado.', 'warning');
        }
      } catch (pollError) {
        if (import.meta.env.DEV) {
          console.warn('[checkout] verify-payment falhou, tentando novamente:', pollError.message);
        }
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingOrderId, clearCart, navigate, pushToast]);

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
      setPendingOrderId(String(data.orderId || ''));
    } catch (submitError) {
      setProcessing(false);
      const message = submitError.message || 'Erro ao processar checkout.';
      setStatus(message);
      pushToast(message, 'error');
    }
  }

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500';
  const errorInputClass = 'border-rose-300 focus:border-rose-500 focus:ring-rose-100';

  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* RESUMO */}
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Resumo do Pedido</p>
                <h3 className="font-heading text-lg font-bold text-slate-900">Seu Carrinho</h3>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <i className="bi bi-shield-check" /> Seguro
              </span>
            </header>

            {cart.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 py-6 text-center text-sm text-slate-500">
                Seu carrinho está vazio.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {cart.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-slate-800">{item.name}</strong>
                      <span className="text-xs font-semibold text-brand-700">{formatPrice(item.price)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex items-baseline justify-between rounded-xl bg-gradient-to-br from-brand-50 to-white p-4 ring-1 ring-brand-100">
              <span className="text-sm font-semibold text-slate-600">Total</span>
              <strong className="font-display text-2xl font-bold text-brand-700">{formatPrice(total)}</strong>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Após a aprovação, seus arquivos ficam disponíveis automaticamente na área de downloads.
            </p>
          </article>

          {/* PAGAMENTO */}
          <article className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <header>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Finalização segura</p>
              <h3 className="font-heading text-lg font-bold text-slate-900">Dados para pagamento</h3>
            </header>

            <StatusStepper
              activeStep={statusStep}
              description={stepperDescription}
              steps={[
                { label: 'Processando', description: 'Geração e abertura da cobrança.' },
                { label: 'Confirmando', description: 'Aguardando confirmação do pagamento.' },
                { label: 'Liberado', description: 'Acesso imediato aos arquivos.' },
              ]}
            />

            {customerSession?.email ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Comprando como <strong className="text-slate-800">{customerSession.email}</strong>
              </p>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Entre na sua conta para preencher seus dados automaticamente.{' '}
                <Link to="/login?mode=login&redirect=/checkout" className="font-semibold text-brand-700 hover:underline">
                  Entrar agora
                </Link>
              </p>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
              <div>
                <label htmlFor="checkout-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nome completo
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  placeholder="Seu nome"
                  disabled={processing}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'checkout-name-error' : undefined}
                  className={`${inputClass} ${errors.name ? errorInputClass : ''}`}
                  {...register('name', {
                    required: 'Informe o nome completo para continuar.',
                    minLength: { value: 3, message: 'Informe pelo menos 3 caracteres no nome.' },
                  })}
                />
                {errors.name ? (
                  <p id="checkout-name-error" role="alert" className="mt-1 text-xs text-rose-700">{errors.name.message}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="checkout-email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  E-mail
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  placeholder="seu@email.com"
                  disabled={processing}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'checkout-email-error' : undefined}
                  className={`${inputClass} ${errors.email ? errorInputClass : ''}`}
                  {...register('email', {
                    required: 'Informe um e-mail válido para receber a confirmação.',
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Digite um e-mail válido.' },
                  })}
                />
                {errors.email ? (
                  <p id="checkout-email-error" role="alert" className="mt-1 text-xs text-rose-700">{errors.email.message}</p>
                ) : null}
              </div>

              <div className="mt-2 rounded-2xl bg-gradient-to-br from-brand-50 to-slate-50 p-4">
                <button
                  type="submit"
                  disabled={processing || !cart.length}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-3 text-base font-semibold text-white shadow-brand transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
                >
                  {processing ? (
                    <><i className="bi bi-arrow-clockwise animate-spin" /> Processando…</>
                  ) : (
                    <>Ir para pagamento <i className="bi bi-arrow-right" /></>
                  )}
                </button>

                <div aria-label="Selos de confiança" className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span className="inline-flex items-center gap-1"><i className="bi bi-shield-lock-fill text-emerald-600" /> Compra segura</span>
                  <span className="inline-flex items-center gap-1"><i className="bi bi-credit-card-2-front-fill text-brand-600" /> Pagamento verificado</span>
                  <span className="inline-flex items-center gap-1"><i className="bi bi-stars text-amber-500" /> Download garantido</span>
                </div>
              </div>
            </form>

            {status ? (
              <output className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{status}</output>
            ) : null}
          </article>
        </div>
      </section>
    </Shell>
  );
}
