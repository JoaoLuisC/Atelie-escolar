import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CouponField } from '../components/CouponField';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { StatusStepper } from '../components/StatusStepper';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { apiRequest } from '../utils/api';
import { formatPrice } from '../utils/currency';
import {
  buildCartPayload,
  getAttributionPayload,
  trackEvent,
} from '../utils/analytics';
import { getSessionId } from '../utils/attribution';

// Debounce da captura de carrinho abandonado ao digitar o e-mail.
const ABANDONED_CART_DEBOUNCE_MS = 1500;
// Polling de confirmação do pagamento: 150 tentativas × 4s ≈ 10 minutos.
const PAYMENT_POLL_INTERVAL_MS = 4000;
const PAYMENT_POLL_MAX_ATTEMPTS = 150;
// Backoff ao receber 429. Num IP compartilhado — escola, lan house, CGNAT de
// operadora móvel, que é o cenário típico do público deste catálogo — o
// servidor pode legitimamente pedir uma pausa. A resposta certa é DESACELERAR,
// nunca desistir: o cliente já pagou e esta tela é o único lugar onde ele
// acompanha a confirmação. Piso de 15s para não reentrar no limite no tique
// seguinte (loop de 429); teto de 5min para a espera continuar sendo espera.
const PAYMENT_POLL_BACKOFF_MIN_MS = 15000;
const PAYMENT_POLL_BACKOFF_MAX_MS = 300000;

/**
 * Quanto esperar depois de um 429.
 *
 * Prioriza `retryAfterSeconds` do envelope do projeto e só então o header
 * Retry-After — e não o contrário — porque o header NÃO atravessa CORS sem
 * `Access-Control-Expose-Headers` (em dev o front fala com localhost:3000, que
 * é outra origem). O corpo sempre chega. O header aceita segundos ou data HTTP
 * (RFC 9110 permite as duas formas).
 */
function readRetryAfterMs(response, data, { minMs, maxMs }) {
  const fromBody = Number(data?.retryAfterSeconds);
  let seconds = Number.isFinite(fromBody) && fromBody > 0 ? fromBody : 0;

  if (!seconds) {
    const header = response?.headers?.get?.('Retry-After');
    const asNumber = Number(header);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      seconds = asNumber;
    } else if (header) {
      const asDate = Date.parse(header);
      if (Number.isFinite(asDate)) seconds = (asDate - Date.now()) / 1000;
    }
  }

  // Clamp nos dois lados: sem piso, um Retry-After curto (ou ausente) reentra
  // no limite imediatamente; sem teto, um valor absurdo — ou o relógio do
  // cliente adiantado, no caso da forma de data — congelaria a tela.
  return Math.min(Math.max(seconds * 1000, minMs), maxMs);
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { customerSession, loginCustomerGoogle } = useAuth();
  const { cart, total, removeFromCart, clearCart } = useCart();
  const { pushToast } = useToast();
  const [status, setStatus] = useState('');
  // Tom do status para diferenciar erro (vermelho) de sucesso/info.
  const [statusTone, setStatusTone] = useState('info');
  const [processing, setProcessing] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState('');
  const [pendingOrderEmail, setPendingOrderEmail] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  // URL da cobrança gerada — mantida em estado para renderizar SEMPRE um
  // link visível "Abrir pagamento" (fallback quando o popup é bloqueado no
  // iOS/Safari e o window.open não abre).
  const [paymentUrl, setPaymentUrl] = useState('');
  // E-mail informado por convidado no checkout. Guardado localmente para não
  // forjar uma sessão de autenticação (setCustomerSession) para quem não logou.
  const [guestEmail, setGuestEmail] = useState('');
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
      // apiRequest (e não fetch cru): traz o AbortController com timeout e a
      // normalização de erro da camada de API. `keepalive` continua valendo —
      // a captura precisa sobreviver ao fechamento da aba.
      apiRequest('/abandoned-cart', {
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
    }, ABANDONED_CART_DEBOUNCE_MS);

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

  // Revalida o cupom quando o conteúdo do carrinho muda: zera o desconto
  // aplicado para o valor exibido não divergir do que será cobrado em
  // create-payment (o servidor recalcula a elegibilidade com o cart novo).
  const cartSignature = useMemo(
    () => cart.map((item) => `${item.id}:${item.quantity || 1}`).join('|'),
    [cart],
  );
  const previousCartSignatureRef = useRef(cartSignature);
  useEffect(() => {
    if (previousCartSignatureRef.current !== cartSignature) {
      previousCartSignatureRef.current = cartSignature;
      setAppliedCoupon(null);
    }
  }, [cartSignature]);

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
    // Tiques a PULAR por conta de um 429 (o agendador continua sendo o mesmo
    // setInterval de 4s — desacelerar é pular tiques, não reagendar).
    let cooldownTicks = 0;
    // Piso do backoff, que sobe a cada 429 consecutivo e volta ao mínimo na
    // primeira resposta boa.
    let backoffFloorMs = PAYMENT_POLL_BACKOFF_MIN_MS;
    const maxAttempts = PAYMENT_POLL_MAX_ATTEMPTS;

    const interval = setInterval(async () => {
      if (cancelled) return;

      // Em backoff: não consulta a API e não gasta tentativa. O efeito é
      // esticar o relógio do polling (150 tentativas passam a cobrir bem mais
      // que 10min) em vez de encerrar a espera.
      if (cooldownTicks > 0) {
        cooldownTicks -= 1;
        return;
      }

      attempts += 1;

      if (attempts > maxAttempts) {
        clearInterval(interval);
        if (!cancelled) {
          setProcessing(false);
          setPendingOrderId('');
          setPendingOrderEmail('');
          setPaymentUrl('');
          setStatusTone('info');
          setStatus('Demorou mais do que esperávamos para confirmar. Você pode acompanhar a qualquer momento em Meus Downloads — ninguém perde o pedido.');
        }
        return;
      }

      try {
        // POST com o e-mail no CORPO (achado M6): na query string ele vazaria
        // para os access logs da Vercel, para o histórico do navegador e para o
        // header Referer. O backend ainda aceita GET por compatibilidade, mas
        // este é o caminho preferencial. apiRequest dá timeout (AbortController)
        // ao polling — antes, uma requisição pendurada ficava presa para sempre.
        const { response, data: verifyData } = await apiRequest('/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: pendingOrderId, email: pendingOrderEmail }),
        });
        if (cancelled) return;

        // 429 NÃO é erro nem resposta final: é o servidor pedindo ritmo. Nada
        // de limpar pendingOrderId nem de mostrar falha — o pedido segue vivo
        // e o pagamento pode ser aprovado no próximo tique. Sem este ramo, o
        // 429 caía no caminho de "resposta sem order" e a tela quebrava.
        if (response?.status === 429) {
          const waitMs = readRetryAfterMs(response, verifyData, {
            minMs: backoffFloorMs,
            maxMs: PAYMENT_POLL_BACKOFF_MAX_MS,
          });
          cooldownTicks = Math.ceil(waitMs / PAYMENT_POLL_INTERVAL_MS);
          backoffFloorMs = Math.min(backoffFloorMs * 2, PAYMENT_POLL_BACKOFF_MAX_MS);
          setStatusTone('info');
          setStatus('Muita gente confirmando pagamento agora. Continuamos verificando o seu — só um pouco mais devagar. Pode deixar esta tela aberta.');
          return;
        }

        // Resposta boa: desfaz a escada do backoff.
        backoffFloorMs = PAYMENT_POLL_BACKOFF_MIN_MS;
        const paymentStatus = verifyData?.order?.paymentStatus;

        if (paymentStatus === 'approved') {
          clearInterval(interval);
          clearCart();
          setProcessing(false);
          setPendingOrderId('');
          setPendingOrderEmail('');
          setPaymentUrl('');
          setStatusTone('success');
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
          setPaymentUrl('');
          setStatusTone('error');
          setStatus('Não conseguimos confirmar este pagamento. Você pode tentar de novo com outro método sem perder o carrinho.');
          pushToast('Pagamento não confirmado.', 'warning');
        }
      } catch (pollError) {
        if (import.meta.env.DEV) {
          console.warn('[checkout] verify-payment falhou, tentando novamente:', pollError.message);
        }
      }
    }, PAYMENT_POLL_INTERVAL_MS);

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
      return 'Estamos preparando seu pagamento. Se a cobrança não abrir sozinha, use o botão "Abrir pagamento".';
    }

    if (status.includes('Aguardando')) {
      return 'Acompanhando a confirmação do pagamento em tempo real. Se a cobrança não abriu, use o botão "Abrir pagamento".';
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
      setStatusTone('error');
      setStatus('Seu carrinho está vazio. Volte ao catálogo para escolher seus materiais.');
      return;
    }

    setProcessing(true);
    setStatusTone('info');
    setPaymentUrl('');
    setStatus('Estamos preparando seu pagamento…');

    try {
      const payload = {
        items: cart.map((item) => ({ productId: item.id, quantity: item.quantity || 1 })),
        customer: { name, email },
        attribution: getAttributionPayload(),
        couponCode: appliedCoupon?.code || null,
      };

      // Convidado: guardamos o e-mail apenas localmente. NÃO forjamos uma
      // sessão de autenticação (setCustomerSession) para quem não fez login.
      if (email && customerSession?.email !== email) {
        setGuestEmail(email);
      }

      const { response, data } = await apiRequest('/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao criar pagamento.');
      }

      localStorage.setItem('lastOrderId', String(data.orderId || ''));
      localStorage.setItem('lastOrderEmail', email);

      const nextPaymentUrl = data.initPoint || data.sandboxInitPoint;
      if (!nextPaymentUrl) {
        throw new Error('URL de pagamento não retornada pela API.');
      }

      // Guarda a URL para o botão de fallback e tenta abrir o popup. Em iOS/
      // Safari o popup pode ser bloqueado — por isso o link fica sempre visível.
      setPaymentUrl(nextPaymentUrl);
      window.open(nextPaymentUrl, '_blank', 'noopener,noreferrer');
      pushToast('Pagamento gerado. Estamos aguardando a confirmação.', 'info');
      setStatusTone('info');
      setStatus('Aguardando confirmação do pagamento. Use o botão "Abrir pagamento" caso a cobrança não tenha aberto — vamos te avisar aqui assim que aprovar.');
      setPendingOrderEmail(email);
      setPendingOrderId(String(data.orderId || ''));
    } catch (submitError) {
      setProcessing(false);
      setStatusTone('error');
      const message = submitError.message || 'Erro ao processar checkout.';
      setStatus(message);
      pushToast(message, 'error');
    }
  }

  // text-base (16px) no mobile evita o zoom automático do iOS ao focar o input;
  // sm:text-sm mantém o visual compacto no desktop.
  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base sm:text-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500';
  const errorInputClass = 'border-rose-300 focus:border-rose-500 focus:ring-rose-100';

  // Cancela a espera de confirmação: zera o pedido pendente e reabilita o form
  // para o cliente revisar os dados e tentar novamente sem perder o carrinho.
  function cancelProcessing() {
    setProcessing(false);
    setPendingOrderId('');
    setPendingOrderEmail('');
    setPaymentUrl('');
    setStatusTone('info');
    setStatus('Você pode revisar seus dados e tentar de novo. Seu carrinho continua salvo.');
  }

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
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
                <p>Seu carrinho está vazio.</p>
                <Link
                  to="/produtos"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
                >
                  <i className="bi bi-bag" aria-hidden="true" /> Ver produtos
                </Link>
              </div>
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
                {guestEmail ? (
                  <p className="mb-2 text-xs text-slate-600">
                    Comprando como convidado: <strong className="text-slate-800">{guestEmail}</strong>
                  </p>
                ) : null}
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

                {paymentUrl ? (
                  <a
                    href={paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                  >
                    <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> Abrir pagamento
                  </a>
                ) : null}

                {processing ? (
                  <button
                    type="button"
                    onClick={cancelProcessing}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <i className="bi bi-x-circle" aria-hidden="true" /> Cancelar e tentar de novo
                  </button>
                ) : null}

                <div aria-label="Selos de confiança" className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span className="inline-flex items-center gap-1"><i className="bi bi-shield-lock-fill text-emerald-600" /> Compra segura</span>
                  <span className="inline-flex items-center gap-1"><i className="bi bi-credit-card-2-front-fill text-brand-600" /> Pagamento verificado</span>
                  <span className="inline-flex items-center gap-1"><i className="bi bi-stars text-amber-500" /> Download garantido</span>
                </div>
              </div>
            </form>

            {status ? (
              <output
                role={statusTone === 'error' ? 'alert' : undefined}
                className={`rounded-lg px-3 py-2 text-xs ${
                  statusTone === 'error'
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    : statusTone === 'success'
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-slate-50 text-slate-600'
                }`}
              >
                {status}
              </output>
            ) : null}
          </article>
        </div>
      </section>
    </Shell>
  );
}
