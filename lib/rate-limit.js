// ════════════════════════════════════════════════════════════════════
// Rate limiting válido em PRODUÇÃO — contador atômico no Postgres.
//
// COMO USAR num handler de api/*.js (early return no topo, antes de qualquer
// trabalho caro ou de qualquer consulta que revele existência de recurso):
//
//   const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
//
//   module.exports = async function validateCouponHandler(req, res) {
//     if (req.method === 'OPTIONS') return res.status(204).end();
//
//     const gate = await enforceRateLimit(req, res, RATE_LIMITS.validateCoupon);
//     if (gate.blocked) return;   // 429 + headers já foram enviados aqui dentro
//
//     ...resto do handler...
//   };
//
// POR QUE ESTE MÓDULO EXISTE: os limitadores de express-rate-limit vivem em
// server.js / routes/api-compat.routes.js com store em MEMÓRIA. Esses arquivos
// só rodam no Express de desenvolvimento — em produção o deploy são funções
// serverless isoladas na Vercel, sem processo longevo e sem memória
// compartilhada. Resultado: brute force ilimitado em /api/admin-login,
// enumeração em /api/validate-coupon e varredura em /api/verify-payment
// (achado P1-3 / "API-03"). O contador precisa morar FORA do processo, e o
// único estado compartilhado que já existe é o Postgres do Supabase.
//
// Backend: public.rate_limit_hit() em
// supabase/migrations/20260813000000_rate_limit.sql.
// ════════════════════════════════════════════════════════════════════

const crypto = require('node:crypto');

const { getSupabaseConfig, supabaseRequest } = require('./supabase');
const { ERROR_CODES } = require('./http');
const { extractClientIp, recordSecurityEvent } = require('./security-logger');

const RATE_LIMIT_RPC_PATH = 'rpc/rate_limit_hit';

// Teto de tempo PRÓPRIO, bem menor que os 10s padrão do lib/supabase.js: o
// limitador é uma guarda, não o trabalho do endpoint. Se o Postgres está lento,
// desistir da contagem em ~2,5s e seguir (fail-open) é melhor do que torrar o
// orçamento inteiro da função serverless esperando para dizer "pode passar".
// (toPositiveInt é declaração de função, içada — env inválida cai no default
// em vez de estourar em AbortSignal.timeout(NaN).)
const RPC_TIMEOUT_MS = toPositiveInt(process.env.RATE_LIMIT_TIMEOUT_MS, 2500);

const DEFAULT_MESSAGE = 'Muitas tentativas. Aguarde um instante e tente novamente.';

// ─── Configuração por endpoint ───────────────────────────────────────
// Espelha os limiters que hoje só existem no Express de dev
// (routes/api-compat.routes.js), para que dev e prod passem a ter o MESMO
// comportamento — a divergência dev/prod é a causa raiz deste achado.
const RATE_LIMITS = Object.freeze({
  // 5 tentativas / 10 min (routes/api-compat.routes.js: adminLoginLimiter).
  // DIFERENÇA DELIBERADA: o limiter de dev usa `skipSuccessfulRequests`, que
  // exigiria "estornar" um hit já gravado. Aqui o sucesso também conta — com
  // 1 admin, 5 logins a cada 10 minutos é folga de sobra, e contar tudo é o
  // comportamento seguro (um atacante não escolhe quais tentativas contam).
  adminLogin: Object.freeze({
    bucket: 'admin-login',
    limit: 5,
    windowSeconds: 10 * 60,
    message: 'Muitas tentativas. Aguarde 10 minutos e tente novamente.',
  }),
  // Balde SEPARADO para o 2º fator: o challengeToken é reemitível, então sem
  // contador próprio o fallbackPin (mín. 6 chars) fica força-brutável mesmo
  // com a senha limitada. Ver P1-3 no relatório.
  adminLoginSecondFactor: Object.freeze({
    bucket: 'admin-login-2fa',
    limit: 5,
    windowSeconds: 10 * 60,
    // FAIL-CLOSED aqui e NAO no adminLogin, de proposito. O anti-replay do
    // TOTP tambem mora no Postgres (rate_limit_hit com p_limit=1): com o
    // contador fora do ar, um codigo interceptado volta a ser reutilizavel e o
    // PIN de 6 caracteres volta a ser forca-brutavel. Quem ja passou pela
    // senha nesta etapa espera 30s pelo proximo codigo — o custo de recusar e
    // baixo, o de aceitar nao e.
    failMode: 'closed',
    message: 'Muitas tentativas de verificação. Aguarde 10 minutos e tente novamente.',
  }),
  // ── /api/auth/customer/login: DOIS baldes, mesma forma do verifyPayment ──
  //
  // O limiter de dev (routes/auth.routes.js:17) é 5/10min por IP puro, e copiar
  // isso para produção seria ruim dos DOIS lados. Por IP puro:
  //   • falso positivo — quatro professoras da mesma escola (ou do mesmo CGNAT
  //     de operadora móvel, o público típico deste catálogo) somam 5 tentativas
  //     e a quinta pessoa não consegue nem TENTAR entrar na própria conta;
  //   • falso negativo — credential stuffing não repete conta, ele varre MUITAS
  //     contas com uma senha vazada cada. Um teto por IP conta as duas coisas
  //     na mesma moeda e não distingue "errei minha senha" de "estou testando
  //     500 e-mails".
  //
  // Então medimos as duas coisas separadamente:
  //   1) balde primário (IP + e-mail) → 5 tentativas por conta a cada 10min. É
  //      o limite anti-força-bruta de verdade: ele acompanha a CONTA atacada,
  //      não a conexão, e por isso não é esvaziado por quem divide o IP.
  //   2) balde de VARREDURA por IP (distinctScope) → incrementado só quando o
  //      primário reporta hit_count === 1, isto é, quando aquele IP tocou um
  //      e-mail INÉDITO na janela. Conta CONTAS DISTINTAS, não tentativas: 20
  //      em 10min cobre com folga uma escola inteira logando junto e ainda
  //      corta stuffing, que precisa de centenas.
  //
  // Por que o e-mail pode ser escopo aqui, se resolveIdentifier proíbe usá-lo
  // como identificador: escopo não SUBSTITUI o teto por IP, ele o recorta — e o
  // distinctScope cobra exatamente a TROCA de valor, que é a única forma de
  // fugir do balde primário. Sem o segundo balde isto seria "N por e-mail
  // inventado", ou seja, ilimitado.
  //
  // O sucesso também conta (o contador do Postgres não tem estorno, ver
  // adminLogin): 5 tentativas por conta a cada 10min continua folgado para
  // quem sabe a própria senha.
  customerLogin: Object.freeze({
    bucket: 'customer-login',
    limit: 5,
    windowSeconds: 10 * 60,
    scope: 'loginEmail',
    // Ver FAIL-OPEN vs FAIL-CLOSED em enforceRateLimit: o contador vive no
    // Postgres, mas quem confere a senha aqui e o GoTrue. Um pode cair com o
    // outro de pe — e ai "passar" seria brute force sem teto.
    failMode: 'closed',
    message: 'Muitas tentativas de login nesta conta. Aguarde 10 minutos e tente novamente.',
    distinctScope: Object.freeze({
      bucket: 'customer-login-scan',
      limit: 20,
      windowSeconds: 10 * 60,
      message: 'Muitas tentativas de login a partir desta conexão. Aguarde um instante.',
    }),
  }),
  // 20 / min — anti-enumeração de códigos de cupom.
  validateCoupon: Object.freeze({
    bucket: 'validate-coupon',
    limit: 20,
    windowSeconds: 60,
    message: 'Muitas tentativas. Aguarde 1 minuto.',
  }),
  // ── /api/verify-payment: DOIS baldes, e o porquê ──────────────────
  //
  // Este endpoint é, ao mesmo tempo, (a) alvo de varredura de order_code — a
  // resposta carrega PII (nome, e-mail, tokens de download) — e (b) o endpoint
  // que o front consulta em POLLING: CheckoutPage a cada 4s por até ~10min
  // (150 tentativas) e DownloadsPage a cada 10s, ou seja ~15 req/min POR
  // COMPRADOR. Um teto plano de 60/min por IP misturava as duas coisas e
  // punia o caso legítimo: quatro compradores atrás do MESMO IP público
  // (escola, lan house, CGNAT de operadora móvel — o cenário TÍPICO do público
  // deste catálogo, professores da educação básica) somavam 60 req/min e o
  // quinto polling levava 429.
  //
  // A ironia do desenho antigo: quem faz polling legítimo JÁ conhece um
  // order_code válido de 128 bits; ele não está enumerando nada. Enumeração é
  // TENTAR order_codes DIFERENTES. Então a defesa passa a medir exatamente
  // isso, em dois níveis:
  //
  //   1) balde primário por (IP + order_code)  → contém o polling. Consultar o
  //      MESMO pedido mil vezes não consome nem um único ponto do orçamento de
  //      outro comprador no mesmo IP. Dimensionamento: 150 (checkout, 4s×10min)
  //      + 12 (downloads, 10s) + recargas de página e cliques em "Atualizar"
  //      ≈ 170 requisições por pedido numa janela de 10min. 600 dá ~3,5x de
  //      folga e ainda é só 1 req/s para UM pedido que o cliente já conhece.
  //
  //   2) balde de VARREDURA por IP (distinctScope) → só é incrementado quando o
  //      balde primário reporta hit_count === 1, isto é, quando aquele IP tocou
  //      um order_code que ele ainda não tinha tocado nesta janela. Ele conta
  //      order_codes DISTINTOS, não requisições. 40 pedidos distintos por IP a
  //      cada 10min cobre com folga uma escola inteira comprando junto (N
  //      compradores simultâneos por trás de um CGNAT) e ainda assim é MAIS
  //      APERTADO que o limite anterior contra enumeração: 40 tentativas/10min
  //      contra as 600 que 60/min permitia. A defesa ficou mais forte, não mais
  //      fraca — só parou de cobrar o polling honesto por ela.
  //
  // Residual conhecido e aceito: alguém pode queimar o balde de varredura de um
  // IP inteiro mandando order_codes inventados, atrasando o PRIMEIRO poll dos
  // vizinhos de CGNAT. Não derruba polling já em curso (esse vive no balde
  // primário, que não é tocado) e o front trata o 429 com backoff em vez de
  // erro. É o preço de existir qualquer teto por IP; em troca, todo estouro
  // deste balde é um evento rate_limit_exceeded de bucket 'verify-payment-scan',
  // que é sinal de enumeração quase sem falso positivo.
  verifyPayment: Object.freeze({
    bucket: 'verify-payment',
    limit: 600,
    windowSeconds: 600,
    scope: 'orderCode',
    message: 'Muitas verificações deste pedido. Vamos tentar de novo em instantes.',
    distinctScope: Object.freeze({
      bucket: 'verify-payment-scan',
      limit: 40,
      windowSeconds: 600,
      message:
        'Muitas consultas de pedidos diferentes a partir desta conexão. Aguarde um instante.',
    }),
  }),
  // 5 / min — newsletter (regra D1): coíbe submissão automatizada.
  subscribe: Object.freeze({
    bucket: 'subscribe',
    limit: 5,
    windowSeconds: 60,
    message: 'Muitas tentativas. Aguarde 1 minuto.',
  }),
  // 20 / min — NÃO existia limiter em dev. Criação de pedido grava PII e chama
  // o Mercado Pago; 20/min por IP é folgado para um humano no checkout e
  // corta script de flood (custo em preferências criadas no MP).
  createPayment: Object.freeze({
    bucket: 'create-payment',
    limit: 20,
    windowSeconds: 60,
    message: 'Muitas tentativas de pagamento. Aguarde 1 minuto.',
  }),
  // Demais baldes já existentes no Express de dev, para o wiring ficar 1:1.
  abandonedCart: Object.freeze({
    bucket: 'abandoned-cart',
    limit: 30,
    windowSeconds: 60,
    message: 'Muitas requisições. Aguarde 1 minuto.',
  }),
  meDeleteAccount: Object.freeze({
    bucket: 'me-delete-account',
    limit: 5,
    windowSeconds: 60,
    message: 'Muitas tentativas. Aguarde 1 minuto.',
  }),
  unsubscribe: Object.freeze({
    bucket: 'unsubscribe',
    limit: 20,
    windowSeconds: 60,
    message: 'Muitas tentativas. Aguarde 1 minuto.',
  }),
  trackEvent: Object.freeze({
    bucket: 'track-event',
    limit: 120,
    windowSeconds: 60,
    message: 'Muitos eventos por minuto.',
  }),
  // ── Os cinco que a remedição de 18/08 encontrou descobertos (item P3.1) ──
  //
  // A regra E1 é "rate limit em todo endpoint público, sem exceção", e o
  // CONTRIBUTING registrava "5 → 0" depois de 13/08. A varredura de 18/08
  // achou OUTROS cinco. Nenhum destes perfis existia — ao contrário do que o
  // item supõe: os baldes abaixo são novos, não aplicação de perfil pronto.

  // O MAIS URGENTE dos cinco: é o único que gasta DINHEIRO e reputação de
  // domínio por requisição, contra a cota de 3.000 e-mails/mês do Resend.
  // Sem contador, é um relay de spam com o nosso domínio no envelope.
  //
  // 5/10min por IP é deliberadamente apertado e não estreita nada legítimo:
  // este endpoint não tem UM consumidor no repositório (varrido em `src/`,
  // `api/` e `lib/`) — é integração legada mantida por compatibilidade, e o
  // envio real do pedido acontece dentro do webhook. Some-se a isso a
  // idempotência por (email, kind, entity_id) do `sendEmail`, que já barra o
  // reenvio do MESMO pedido; o que faltava era barrar pedidos INVENTADOS.
  sendConfirmationEmail: Object.freeze({
    bucket: 'send-confirmation-email',
    limit: 5,
    windowSeconds: 10 * 60,
    message: 'Muitas solicitações de e-mail. Aguarde 10 minutos.',
  }),

  // Criação de conta em massa. Mesmo teto do `adminLogin` e do balde primário
  // do `customerLogin`: 5/10min. Cadastro é ação rara — quem erra o formulário
  // três vezes ainda tem folga, e um script que cria contas não tem.
  customerRegister: Object.freeze({
    bucket: 'customer-register',
    limit: 5,
    windowSeconds: 10 * 60,
    // Mesmo raciocinio do customerLogin: o GoTrue cria a conta mesmo com o
    // contador fora do ar.
    failMode: 'closed',
    message: 'Muitas tentativas de cadastro. Aguarde 10 minutos e tente novamente.',
  }),

  // Geração de state/PKCE sem teto. Cada chamada grava estado e é o degrau
  // anterior ao callback; 20/10min cobre alguém que desiste e tenta de novo
  // várias vezes, e ainda assim impede varredura.
  //
  // Por que MAIS folgado que o login por senha: aqui não há segredo a
  // adivinhar — o risco é custo e lixo de estado, não força bruta. Apertar
  // para 5 puniria o CGNAT de escola (o público típico deste catálogo) sem
  // ganho de segurança correspondente, que é o erro que o comentário do
  // `customerLogin` documenta em detalhe.
  customerGoogleStart: Object.freeze({
    bucket: 'customer-google-start',
    limit: 20,
    windowSeconds: 10 * 60,
    message: 'Muitas tentativas de login com Google. Aguarde um instante.',
  }),

  // Troca de código sem teto. Mesmo dimensionamento do start, pelo mesmo
  // motivo — os dois são as duas metades do mesmo fluxo e um teto menor no
  // callback derrubaria logins que o start já autorizou.
  customerGoogleCallback: Object.freeze({
    bucket: 'customer-google-callback',
    limit: 20,
    windowSeconds: 10 * 60,
    message: 'Muitas tentativas de login com Google. Aguarde um instante.',
  }),

  // Enumeração de token de confirmação. Mesmo teto do `unsubscribe`, que é o
  // endpoint irmão do double opt-in (20/min): o clique legítimo vem uma vez
  // por inscrição, direto do e-mail.
  confirmSubscription: Object.freeze({
    bucket: 'confirm-subscription',
    limit: 20,
    windowSeconds: 60,
    message: 'Muitas tentativas. Aguarde 1 minuto.',
  }),

  // ── Catálogo público (regra E1) ───────────────────────────────────
  // products, product-details, home-sections e cross-sell ficavam SEM contador
  // em produção: o limiter global do server.js (250/15min) só existe no Express
  // de dev, e na Vercel cada função é isolada. Descoberto na padronização de
  // 2026-08-13 — mesma causa raiz do achado P1-3 (divergência dev/prod).
  //
  // 120/min por IP é deliberadamente FOLGADO, por dois motivos:
  //   • estes quatro endpoints respondem com `s-maxage=300`, então a esmagadora
  //     maioria dos hits legítimos morre no CDN e nunca chega à função;
  //   • uma página de catálogo dispara várias chamadas em sequência (lista +
  //     detalhe + cross-sell) e navegação rápida não pode virar 429.
  // Ainda assim corta scraping sistemático, que é o risco real aqui: o custo
  // de um catálogo raspado é a fatura do Supabase, não vazamento.
  catalog: Object.freeze({
    bucket: 'catalog',
    limit: 120,
    windowSeconds: 60,
    message: 'Muitas requisições. Aguarde um instante.',
  }),
  // ── /api/download: DOIS baldes, mesma forma do verifyPayment ──────
  //
  // Este é o endpoint que ENTREGA o produto pago, e estava sem contador algum.
  // Um teto plano por IP seria errado nos dois sentidos, exatamente como em
  // verifyPayment: pune a escola inteira atrás de um CGNAT baixando os
  // materiais comprados, e ao mesmo tempo dá centenas de tentativas para quem
  // enumera tokens.
  //
  //   1) balde primário (IP + token) → contém a repetição legítima. O comprador
  //      que recarrega a página ou tenta de novo após queda de rede consome só
  //      o próprio balde. 20 em 10min é muito mais do que qualquer compra
  //      precisa (o token é de uso único: a 2ª tentativa bem-sucedida já
  //      recebe "Token já utilizado").
  //   2) balde de VARREDURA por IP (distinctScope) → incrementado só quando o
  //      primário reporta hit_count === 1, ou seja, quando aquele IP tocou um
  //      token INÉDITO na janela. Conta TOKENS DISTINTOS: 30 por IP a cada
  //      10min cobre um pedido com muitos itens (um token por produto) e ainda
  //      assim torna enumeração de token de 32 bytes inviável.
  //
  // Todo estouro do balde de varredura é um evento rate_limit_exceeded de
  // bucket 'download-scan' — sinal de enumeração com pouquíssimo falso positivo.
  download: Object.freeze({
    bucket: 'download',
    limit: 20,
    windowSeconds: 600,
    scope: 'downloadToken',
    message: 'Muitas tentativas para este download. Aguarde um instante.',
    distinctScope: Object.freeze({
      bucket: 'download-scan',
      limit: 30,
      windowSeconds: 600,
      message: 'Muitas tentativas de download a partir desta conexão. Aguarde um instante.',
    }),
  }),
});

// ─── Anti-amplificação dos alertas ───────────────────────────────────
// recordSecurityEvent grava em security_events, ou seja, faz um INSERT no
// MESMO Postgres. Sem freio, um Postgres fora do ar (ou um ataque em curso)
// geraria um INSERT extra por requisição — o log viraria parte do problema.
// Um alerta por balde por janela basta: quem investiga quer saber QUE o limite
// existe/falhou, não ver uma linha por tentativa (essa contagem já está na
// própria tabela rate_limit_hit).
const lastAlertAt = new Map();

function alertIntervalMs() {
  const raw = Number(process.env.RATE_LIMIT_ALERT_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 60_000;
}

function shouldAlert(key) {
  const interval = alertIntervalMs();
  if (interval <= 0) return true;

  const now = Date.now();
  const previous = lastAlertAt.get(key) || 0;
  if (now - previous < interval) return false;

  lastAlertAt.set(key, now);
  return true;
}

// Best-effort e SEM await: a chamada roda de forma síncrona até o primeiro
// await de recordSecurityEvent, que é justamente onde o console.warn
// estruturado acontece — o log em stdout (capturado pela Vercel) está
// garantido. Só a persistência no Postgres é que fica solta, e é exatamente
// ela que estaria lenta/indisponível no cenário de falha.
function fireSecurityEvent(throttleKey, event) {
  if (!shouldAlert(throttleKey)) return;
  try {
    const result = recordSecurityEvent(event);
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch {
    /* logging nunca derruba o handler que ele deveria proteger */
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeKeyPart(value, maxLength) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .slice(0, maxLength);
}

function toPositiveInt(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Identificador do cliente para a chave do contador.
 *
 * Deriva SEMPRE de extractClientIp (lib/security-logger.js), que já ancora no
 * header posto pela borda (x-real-ip / x-vercel-forwarded-for) e, no fallback,
 * usa o ÚLTIMO valor de X-Forwarded-For. Confiar no primeiro X-Forwarded-For
 * cru seria o mesmo que não ter limite: o atacante prepende um IP diferente por
 * requisição e ganha um balde novo a cada tentativa.
 *
 * `explicit` só deve ser usado quando existir um identificador MAIS FORTE que o
 * IP (ex.: id de sessão já autenticada). Nunca passe algo escolhido pelo
 * cliente (e-mail, código de cupom): isso troca "N por IP" por "N por valor
 * arbitrário", que é ilimitado na prática.
 */
function resolveIdentifier(req, explicit) {
  const provided = normalizeKeyPart(explicit, 200);
  if (provided) return provided;

  const ip = normalizeKeyPart(extractClientIp(req), 200);
  // Sem IP, todos caem no mesmo balde 'unknown'. É o lado conservador da
  // troca e, na prática, não acontece: a borda da Vercel e o Express com
  // `trust proxy` sempre entregam um IP.
  return ip || 'unknown';
}

// ─── Escopo do balde (sub-chave dentro do IP) ────────────────────────
// Um balde plano por IP obriga a escolher entre "apertado o bastante para
// conter varredura" e "folgado o bastante para o polling legítimo". O escopo
// desfaz o dilema: a chave passa a ser (IP + recurso consultado), então
// repetir a consulta do MESMO recurso não gasta o orçamento de quem consulta
// outros. O teto por IP continua existindo, mas num balde próprio que conta
// RECURSOS DISTINTOS (ver distinctScope em RATE_LIMITS.verifyPayment).
//
// Só resolvers NOMEADOS aqui são aceitos — o preset guarda a string
// ('orderCode'), não uma função. Isso mantém RATE_LIMITS congelável/serializável
// e, principalmente, impede que um handler passe por engano um resolver que leia
// um campo livre do cliente: escopo derivado de valor arbitrário trocaria
// "N por IP" por "N por valor inventado", que é ilimitado na prática. O escopo
// aqui é seguro porque o teto por IP (distinctScope) cobra justamente a
// TROCA de valor.
const SCOPE_ABSENT = 'sem-escopo';

function readOrderScopeValue(req) {
  // Espelha readVerifyPayload() de handlers/verify-payment.js: POST lê o corpo, GET
  // (mantido por compatibilidade) lê a query. Aceita as duas grafias porque o
  // contrato do endpoint é `orderId` mas a coluna é `order_code`.
  const sources = [];
  if (req && req.body && typeof req.body === 'object') sources.push(req.body);
  if (req && req.query && typeof req.query === 'object') sources.push(req.query);

  for (const source of sources) {
    const raw = source.orderId ?? source.order_code ?? source.orderCode ?? source.order;
    const value = String(raw ?? '').trim();
    if (value) return value.slice(0, 200);
  }
  return '';
}

/**
 * E-mail do corpo de um POST de login, NORMALIZADO.
 *
 * O lowercase não é cosmético: sem ele `Ana@escola.com` e `ana@escola.com`
 * viram baldes diferentes e o atacante ganha uma tentativa nova a cada
 * variação de caixa — 5 tentativas por conta viram 5 por GRAFIA da conta.
 * Só o corpo é lido (o endpoint é POST-only), então não há caminho por query.
 */
function readLoginEmailScopeValue(req) {
  const body = req && req.body && typeof req.body === 'object' ? req.body : null;
  if (!body) return '';
  return String(body.email ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

/**
 * Token de download da query string.
 *
 * Mesma lógica de escopo do orderCode: quem clica no link legítimo do próprio
 * e-mail conhece UM token e pode repeti-lo (recarregar a página, tentar de novo
 * depois de uma queda de rede). Quem enumera precisa TROCAR de token a cada
 * tentativa — e é essa troca que o distinctScope cobra.
 *
 * O valor nunca é gravado em claro: resolveScopedIdentifier já o converte em
 * hash antes de virar chave, o que importa aqui porque o token de download é
 * uma capability viva (entrega o arquivo pago) e `rate_limit_hit` sobrevive
 * 24h à requisição.
 */
function readDownloadTokenScopeValue(req) {
  const raw = req && req.query && typeof req.query === 'object' ? req.query.token : '';
  return String(raw ?? '')
    .trim()
    .slice(0, 200);
}

const SCOPE_RESOLVERS = Object.freeze({
  orderCode: readOrderScopeValue,
  loginEmail: readLoginEmailScopeValue,
  downloadToken: readDownloadTokenScopeValue,
});

/**
 * Deriva a sub-chave do escopo — SEMPRE como hash, nunca em claro.
 *
 * O order_code é uma capability: quem o conhece obtém PII e tokens de download.
 * A tabela rate_limit_hit é operacional (service role, consultada em
 * investigação) e sobrevive 24h à requisição; gravar o order_code cru ali
 * transformaria o contador de segurança num repositório de capabilities vivas.
 * O hash preserva o que o limitador precisa (igualdade: "é o mesmo pedido de
 * antes?") e descarta o resto. Colisão de 96 bits é irrelevante aqui — dois
 * pedidos colididos apenas dividiriam um balde, o que é o lado restritivo.
 *
 * Sem valor de escopo (ex.: requisição sem orderId, que o handler recusa com
 * 400 logo adiante) todas caem numa sub-chave fixa: elas não enumeram nada,
 * mas continuam contadas contra o IP.
 */
function resolveScopedIdentifier(req, baseIdentifier, scopeName) {
  const resolver = SCOPE_RESOLVERS[String(scopeName || '')];
  if (typeof resolver !== 'function') return baseIdentifier;

  let raw = '';
  try {
    raw = resolver(req) || '';
  } catch {
    /* corpo malformado não pode derrubar o limitador */
  }

  const suffix = raw
    ? crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 24)
    : SCOPE_ABSENT;

  // O IP é truncado ANTES da concatenação: normalizar só no fim deixaria um
  // x-real-ip forjado com 200 caracteres empurrar o hash para fora do limite,
  // colapsando todos os escopos daquele IP num balde só.
  return `${normalizeKeyPart(baseIdentifier, 160)}|${suffix}`;
}

function setHeaderSafe(res, name, value) {
  if (!res || typeof res.setHeader !== 'function' || res.headersSent) return;
  try {
    res.setHeader(name, String(value));
  } catch {
    /* header já enviado / resposta encerrada: ignorar */
  }
}

function applyRateLimitHeaders(res, { limit, remaining, resetSeconds }) {
  // Formato draft do IETF, o mesmo que `standardHeaders: true` do
  // express-rate-limit emite hoje em dev — o front não precisa aprender nada novo.
  setHeaderSafe(res, 'RateLimit-Limit', limit);
  setHeaderSafe(res, 'RateLimit-Remaining', Math.max(0, remaining));
  setHeaderSafe(res, 'RateLimit-Reset', Math.max(0, resetSeconds));
}

function parseRpcRow(payload) {
  // PostgREST devolve um ARRAY para funções `returns table`. Alguns proxies
  // entregam o objeto direto — aceitamos as duas formas (mesmo cuidado que
  // handlers/create-payment.js toma com increment_coupon_usage).
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== 'object') return null;
  if (typeof row.allowed !== 'boolean') return null;
  return row;
}

/**
 * Um incremento no contador atômico. Não toca em `res` e não decide nada —
 * só devolve a linha da RPC ou o motivo pelo qual ela não veio. Extraído para
 * que o segundo balde (o teto por IP) reaproveite exatamente o mesmo caminho
 * de I/O, timeout e tolerância a formato inesperado.
 *
 * @returns {Promise<{ok: true, row: object} | {ok: false, reason: string}>}
 */
async function countHit({ bucket, identifier, limit, windowSeconds }) {
  let row;
  try {
    const payload = await supabaseRequest(RATE_LIMIT_RPC_PATH, {
      method: 'POST',
      useServiceRole: true,
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      body: JSON.stringify({
        p_bucket: bucket,
        p_identifier: identifier,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }),
    });

    row = parseRpcRow(payload);
  } catch (error) {
    return {
      ok: false,
      reason: 'rpc_failed',
      status: error?.statusCode || null,
      message: String(error?.message || '').slice(0, 200),
    };
  }

  // Resposta em formato inesperado (migration não aplicada, cache do
  // PostgREST, proxy reescrevendo o corpo). Tratada como falha de infra —
  // NUNCA como "estourou": um parser confuso não pode bloquear o checkout.
  if (!row) return { ok: false, reason: 'unexpected_rpc_shape' };

  return { ok: true, row };
}

// Envia o 429 e o evento de segurança. Centralizado porque agora existem DOIS
// baldes capazes de bloquear a mesma requisição e o corpo/headers precisam ser
// idênticos nos dois casos — o front distingue os dois pelo `code` estável.
function rejectWithRateLimit(
  req,
  res,
  { bucket, limit, windowSeconds, identifier, remaining, resetSeconds, message, hitCount },
) {
  applyRateLimitHeaders(res, { limit, remaining, resetSeconds });
  setHeaderSafe(res, 'Retry-After', resetSeconds);

  fireSecurityEvent(`blocked:${bucket}`, {
    eventName: 'rate_limit_exceeded',
    severity: 'warn',
    ip: identifier,
    userAgent: req?.headers?.['user-agent'] || null,
    properties: {
      bucket,
      limit,
      windowSeconds,
      hitCount: Number(hitCount) || null,
    },
  });

  // Envelope da regra A1 com o código estável da A2 (item P1.5). O código
  // ficava em MINÚSCULO e FORA do objeto `error` — então o `parseJson` do
  // cliente, que lê `error.code`, devolvia `errorCode: null` e o `if` por
  // RATE_LIMITED do front nunca disparava. `retryAfterSeconds` continua ao
  // lado, no nível de cima, porque é dado de domínio da resposta e não do erro.
  res.status(429).json({
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: message || DEFAULT_MESSAGE,
    },
    retryAfterSeconds: resetSeconds,
  });

  return {
    blocked: true,
    failOpen: false,
    bucket,
    identifier,
    limit,
    remaining: 0,
    resetSeconds,
  };
}

/**
 * Conta a requisição no balde indicado e, se estourou, RESPONDE 429.
 *
 * @param {object} req
 * @param {object} res
 * @param {object} options
 * @param {string} options.bucket         nome do balde (ver RATE_LIMITS)
 * @param {number} options.limit          requisições permitidas por janela
 * @param {number} options.windowSeconds  tamanho da janela fixa, em segundos
 * @param {string} [options.identifier]   sobrescreve o IP (ver resolveIdentifier)
 * @param {string} [options.scope]        nome do resolver de sub-chave
 *                                        (ver SCOPE_RESOLVERS): a chave vira
 *                                        (IP + recurso), não só IP
 * @param {object} [options.distinctScope] teto por IP que conta RECURSOS
 *                                        DISTINTOS — incrementado apenas na
 *                                        primeira vez que o IP toca aquele
 *                                        escopo dentro da janela
 * @param {string} [options.message]      mensagem do 429
 * @returns {Promise<{blocked: boolean, failOpen: boolean, bucket: string,
 *   identifier: string, limit: number, remaining: number, resetSeconds: number}>}
 *   `blocked === true` significa que a resposta 429 JÁ foi enviada: o handler
 *   deve dar `return` imediatamente, sem escrever mais nada em `res`.
 */
async function enforceRateLimit(req, res, options = {}) {
  const { bucket, limit, windowSeconds, identifier, message, scope, distinctScope, failMode } =
    options || {};

  const safeBucket = normalizeKeyPart(bucket, 64) || 'default';
  const safeLimit = toPositiveInt(limit, 60);
  const safeWindow = toPositiveInt(windowSeconds, 60);
  // `baseKey` é o cliente (IP, ou o identificador forte que o handler passou);
  // `key` é o cliente JÁ recortado pelo escopo. Sem `scope` os dois são iguais
  // e o comportamento é exatamente o de antes.
  const baseKey = resolveIdentifier(req, identifier);
  const key = resolveScopedIdentifier(req, baseKey, scope);

  const openResult = (reason) => ({
    blocked: false,
    failOpen: true,
    reason,
    bucket: safeBucket,
    identifier: key,
    limit: safeLimit,
    remaining: safeLimit,
    resetSeconds: safeWindow,
  });

  /**
   * Contador indisponível num balde marcado `failMode: 'closed'`: RECUSA.
   *
   * 503 e não 429, de propósito. 429 diria "você excedeu o limite", que é
   * falso e manda o cliente esperar a janela inteira; 503 diz o que houve — a
   * verificação não pôde ser feita — e o `Retry-After` curto convida a tentar
   * de novo assim que o contador voltar. Mentir sobre a causa aqui atrapalha
   * tanto quem opera quanto quem só quer entrar na conta.
   */
  const closedResult = (reason) => {
    setHeaderSafe(res, 'Retry-After', 30);

    res.status(503).json({
      success: false,
      error: {
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Não foi possível validar esta tentativa agora. Tente de novo em instantes.',
      },
      retryAfterSeconds: 30,
    });

    return {
      blocked: true,
      failOpen: false,
      failClosed: true,
      reason,
      bucket: safeBucket,
      identifier: key,
      limit: safeLimit,
      remaining: 0,
      resetSeconds: safeWindow,
    };
  };

  // `open` é o default: preserva o comportamento de todos os baldes que não
  // opinam, e com ele o raciocínio do ADR 0007 continua valendo onde vale.
  const unavailableResult = failMode === 'closed' ? closedResult : openResult;

  // ── CONTADOR INDISPONÍVEL: passa ou recusa? ───────────────────────
  // O default continua sendo PASSAR, pelos dois motivos originais: (1) a mesma
  // indisponibilidade de Postgres que derruba a contagem já derrubaria o
  // endpoint logo adiante — negar não protege nada, só troca 500 por 429
  // enganoso; (2) fail-closed no /api/admin-login trancaria a dona para fora
  // justamente durante um incidente, que é quando ela mais precisa entrar.
  //
  // O QUE MUDOU (01/09/2026): o argumento (1) NÃO vale para os baldes que
  // guardam verificação de credencial. `customerLogin` e `customerRegister`
  // autenticam contra o GoTrue (lib/customer-auth-handlers.js), serviço
  // distinto do PostgREST que serve a RPC do contador; e o anti-replay do TOTP
  // (handlers/admin/login.js) é ele próprio uma chamada de rate_limit_hit. Nos
  // três casos o serviço atacado pode estar de pé com o contador fora do ar —
  // e "passar" vira brute force sem teto contra um alvo funcionando, que é
  // precisamente o cenário que o limite existe para cobrir.
  //
  // Por isso a política é POR BALDE (`failMode`), e não global: continua UM
  // mecanismo (ADR 0007), com uma decisão explícita sobre indisponibilidade em
  // vez de uma implícita. Ver a marca `failMode: 'closed'` nos perfis.
  //
  // Nos dois casos o evento de segurança é emitido, para que a recusa OU a
  // ausência de proteção sejam VISÍVEIS e não silenciosas.
  if (!getSupabaseConfig()) {
    fireSecurityEvent(`unconfigured:${safeBucket}`, {
      eventName: 'rate_limit_unavailable',
      severity: 'error',
      ip: key,
      properties: { bucket: safeBucket, reason: 'supabase_not_configured' },
    });
    return unavailableResult('supabase_not_configured');
  }

  const primary = await countHit({
    bucket: safeBucket,
    identifier: key,
    limit: safeLimit,
    windowSeconds: safeWindow,
  });

  if (!primary.ok) {
    fireSecurityEvent(`${primary.reason}:${safeBucket}`, {
      eventName: 'rate_limit_unavailable',
      severity: 'error',
      ip: key,
      properties: {
        bucket: safeBucket,
        reason: primary.reason,
        status: primary.status ?? null,
        message: primary.message ?? null,
      },
    });
    return unavailableResult(primary.reason);
  }

  const row = primary.row;
  const remaining = Number.isFinite(Number(row.remaining))
    ? Math.max(0, Math.floor(Number(row.remaining)))
    : 0;
  const resetSeconds = toPositiveInt(row.retry_after_seconds, safeWindow);

  if (!row.allowed) {
    return rejectWithRateLimit(req, res, {
      bucket: safeBucket,
      limit: safeLimit,
      windowSeconds: safeWindow,
      identifier: key,
      remaining,
      resetSeconds,
      message,
      hitCount: row.hit_count,
    });
  }

  applyRateLimitHeaders(res, { limit: safeLimit, remaining, resetSeconds });

  // ── Teto por IP que conta RECURSOS DISTINTOS ──────────────────────
  // O truque que dispensa schema novo: `hit_count === 1` no balde primário
  // significa "este par (IP, escopo) é INÉDITO nesta janela". Só nesse instante
  // cobramos um ponto do balde por IP. Consequências:
  //   • polling do mesmo pedido → hit_count 2, 3, 4… → o teto por IP nunca é
  //     tocado, que é exatamente o acoplamento que causou a regressão;
  //   • varredura → cada order_code novo é um hit_count 1 → um ponto cada,
  //     e o balde estoura em `distinctScope.limit` TENTATIVAS distintas;
  //   • custo: uma RPC extra por pedido novo (≈1 por checkout), não por poll.
  // As duas janelas têm o mesmo tamanho e a mesma âncora (a RPC alinha
  // window_start a múltiplos de p_window_seconds), então viram juntas: um
  // comprador que fica 20min na tela gasta 1 ponto em cada uma das 2 janelas.
  const isFirstHitForScope = Number(row.hit_count) === 1;

  if (distinctScope && isFirstHitForScope) {
    const scanBucket = normalizeKeyPart(distinctScope.bucket, 64) || `${safeBucket}-scan`;
    const scanLimit = toPositiveInt(distinctScope.limit, 30);
    const scanWindow = toPositiveInt(distinctScope.windowSeconds, safeWindow);

    // Identificador SEM o escopo: aqui o que importa é o IP.
    const scan = await countHit({
      bucket: scanBucket,
      identifier: baseKey,
      limit: scanLimit,
      windowSeconds: scanWindow,
    });

    if (!scan.ok) {
      // Mesmo fail-open do balde primário: sem contador, a requisição passa —
      // mas o evento registra que o teto anti-varredura ficou ausente.
      fireSecurityEvent(`${scan.reason}:${scanBucket}`, {
        eventName: 'rate_limit_unavailable',
        severity: 'error',
        ip: baseKey,
        properties: {
          bucket: scanBucket,
          reason: scan.reason,
          status: scan.status ?? null,
          message: scan.message ?? null,
        },
      });
    } else if (!scan.row.allowed) {
      return rejectWithRateLimit(req, res, {
        bucket: scanBucket,
        limit: scanLimit,
        windowSeconds: scanWindow,
        identifier: baseKey,
        remaining: 0,
        resetSeconds: toPositiveInt(scan.row.retry_after_seconds, scanWindow),
        message: distinctScope.message,
        hitCount: scan.row.hit_count,
      });
    }
  }

  return {
    blocked: false,
    failOpen: false,
    bucket: safeBucket,
    identifier: key,
    limit: safeLimit,
    remaining,
    resetSeconds,
  };
}

module.exports = {
  RATE_LIMITS,
  enforceRateLimit,
  // Exportados para teste e para handlers que precisem da mesma derivação.
  resolveIdentifier,
  resolveScopedIdentifier,
};
