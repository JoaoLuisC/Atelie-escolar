import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CouponField } from '../components/CouponField';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { StatusStepper } from '../components/StatusStepper';
import { TrustBadgeRow } from '../components/TrustBadgeRow';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { getApiBaseUrl } from '../utils/api';
import { formatPrice } from '../utils/currency';
import {
  buildCartPayload,
  getAttributionPayload,
  trackEvent,
} from '../utils/analytics';
import { getSessionId } from '../utils/attribution';

export function CheckoutPage() {
  const navigate = useNavigate();
  const { customerSession, setCustomerSession, loginCustomerGoogle } = useAuth();
  const { cart, total, removeFromCart, clearCart } = useCart();
  const { pushToast } = useToast();
  const [status, setStatus] = useState('');
  const [processing, setProcessing] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState('');
  const [pendingOrderEmail, setPendingOrderEmail] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
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

  const watchedEmail = watch('email');

  // Captura de e-mail para carrinho abandonado: debounce 1.5s; só
  // dispara se email é válido e cart tem itens. Falha silenciosamente.
  useEffect(() => {
    if (!cart.length) return undefined;
    const email = (watchedEmail || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;

    const timeoutId = setTimeout(() => {
      fetch(`${getApiBaseUrl()}/abandoned-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          email,
          sessionId: getSessionId(),
          items: cart.map((item) => ({
            productId: String(item.id),
            name: item.name,
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
          })),
          attribution: getAttributionPayload(),
        }),
      }).catch(() => {
        /* silencioso — não pode quebrar checkout */
      });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [watchedEmail, cart]);

  useEffect(() => {
    if (customerSession?.email) {
      setValue('email', customerSession.email, { shouldValidate: true });
    }
    if (customerSession?.name) {
      setValue('name', customerSession.name, { shouldValidate: true });
    }
  }, [customerSession, setValue]);

  useEffect(() => {
    if (!cart.length) return;
    trackEvent('begin_checkout', buildCartPayload(cart, total));
    // Disparar uma vez por mount com carrinho preenchido — guarda mais
    // fiel ao significado do evento canônico do GA4.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          setPendingOrderEmail('');
          setStatus('Demorou mais do que esperávamos para confirmar. Você pode acompanhar a qualquer momento em Meus Downloads — ninguém perde o pedido.');
        }
        return;
      }

      try {
        const verifyResponse = await fetch(`${getApiBaseUrl()}/verify-payment?orderId=${encodeURIComponent(pendingOrderId)}&email=${encodeURIComponent(pendingOrderEmail)}`);
        const verifyData = await verifyResponse.json();
        if (cancelled) return;
        const paymentStatus = verifyData?.order?.paymentStatus;

        if (paymentStatus === 'approved') {
          clearInterval(interval);
          clearCart();
          setProcessing(false);
          setPendingOrderId('');
          setPendingOrderEmail('');
          pushToast('Pagamento aprovado.', 'success');
          setStatus('Tudo certo! Pagamento aprovado. Levando você para a área de downloads…');
          navigate(`/downloads?order=${encodeURIComponent(pendingOrderId)}&email=${encodeURIComponent(pendingOrderEmail)}&success=1`);
          return;
        }

        if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
          clearInterval(interval);
          setProcessing(false);
          setPendingOrderId('');
          setPendingOrderEmail('');
          setStatus('Não conseguimos confirmar este pagamento. Você pode tentar de novo com outro método sem perder o carrinho.');
          pushToast('Pagamento não confirmado.', 'warning');
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
  }, [pendingOrderId, pendingOrderEmail, clearCart, navigate, pushToast]);

  const statusStep = useMemo(() => {
    if (status.includes('aprovado')) return 2;
    if (status.includes('Aguardando')) return 1;
    if (processing) return 0;
    return 0;
  }, [processing, status]);

  const stepperDescription = useMemo(() => {
    if (processing) {
      return 'Estamos preparando seu pagamento e abrindo a cobrança em uma nova aba.';
    }

    if (status.includes('Aguardando')) {
      return 'Acompanhando a confirmação do pagamento em tempo real. Pode fechar a outra aba quando terminar de pagar.';
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
      setStatus('Seu carrinho está vazio. Volte ao catálogo para escolher seus materiais.');
      return;
    }

    setProcessing(true);
    setStatus('Estamos preparando seu pagamento…');

    try {
      const payload = {
        items: cart.map((item) => ({ productId: item.id, quantity: item.quantity || 1 })),
        customer: { name, email },
        attribution: getAttributionPayload(),
        couponCode: appliedCoupon?.code || null,
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
      localStorage.setItem('lastOrderEmail', email);

      const paymentUrl = data.initPoint || data.sandboxInitPoint;
      if (!paymentUrl) {
        throw new Error('URL de pagamento nao retornada pela API.');
      }

      window.open(paymentUrl, '_blank');
      pushToast('Pagamento gerado. Estamos aguardando a confirmação.', 'info');
      setStatus('Aguardando confirmação do pagamento. Pode finalizar pela aba que abrimos — vamos te avisar aqui assim que aprovar.');
      setPendingOrderEmail(email);
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

  const discount = appliedCoupon?.discount || 0;
  const displayTotal = Math.max(0, total - discount);

  async function onGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await loginCustomerGoogle('/checkout');
      // O fluxo OAuth redireciona; o estado de loading fica até a navegação
    } catch (err) {
      setGoogleLoading(false);
      pushToast(err?.message || 'Não foi possível entrar com Google.', 'error');
    }
  }

  return (
    <Shell>
      <SEO
        title="Finalizar compra"
        description="Conclua sua compra com pagamento seguro e download imediato dos materiais educativos."
        pathname="/checkout"
        noindex
      />
      <section className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        {/* TRUST PANEL — credibilidade acima da dobra, antes do formulário */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <TrustBadgeRow />
          <p className="mt-3 text-center text-xs text-slate-500 sm:text-sm">
            <i className="bi bi-info-circle mr-1 text-brand-600" aria-hidden="true" />
            Você verá a confirmação do pagamento antes de sair desta página.
            Não precisa atualizar nem voltar — vamos te avisar em tempo real.
          </p>
        </div>

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

            <div className="mt-5">
              <CouponField
                cart={cart.map((item) => ({ ...item, categoryId: item.categoryId || null }))}
                applied={appliedCoupon}
                onApply={setAppliedCoupon}
                onClear={() => setAppliedCoupon(null)}
                disabled={processing}
              />
            </div>

            <div className="mt-4 rounded-xl bg-gradient-to-br from-brand-50 to-white p-4 ring-1 ring-brand-100">
              {discount > 0 ? (
                <>
                  <div className="mb-1 flex items-baseline justify-between text-sm text-slate-500">
                    <span>Subtotal</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  <div className="mb-2 flex items-baseline justify-between text-sm text-emerald-700">
                    <span>Desconto</span>
                    <span>−{formatPrice(discount)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-600">Total</span>
                <strong className="font-display text-2xl font-bold text-brand-700">{formatPrice(displayTotal)}</strong>
              </div>
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
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="mb-2 text-xs text-slate-600">
                  Acelere preenchendo seus dados pela sua conta Google — ou continue como convidado preenchendo nome e e-mail abaixo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    disabled={googleLoading || processing}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    <i className="bi bi-google text-base" aria-hidden="true" />
                    {googleLoading ? 'Abrindo Google…' : 'Continuar com Google'}
                  </button>
                  <Link
                    to="/login?mode=login&redirect=/checkout"
                    className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 transition hover:underline"
                  >
                    Já tenho conta
                  </Link>
                </div>
              </div>
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
