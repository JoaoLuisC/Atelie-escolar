const {
  getSupabaseConfig,
  serviceRoleHelpers: { getTableRow, listTableRows },
} = require('../lib/supabase');
const { getCustomerSessionFromRequest } = require('../lib/customer-session');
const { getAdminClient } = require('../services/supabase-auth');
const { recordSecurityEvent, extractClientIp } = require('../lib/security-logger');
const { enforceRateLimit, RATE_LIMITS } = require('../lib/rate-limit');
const { ERROR_CODES, fail, guardMethod, ok } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('me-export-data');

// ════════════════════════════════════════════════════════════════════
// LGPD art. 18, V — portabilidade/acesso aos próprios dados.
//
// O direito de exclusão já existia (`me-delete-account`); o de ACESSO não. A
// pessoa não tinha como ver o que a loja guarda sobre ela sem pedir por
// e-mail e alguém montar à mão — que é o processo que a lei chama de não
// facilitado.
//
// ── A ÂNCORA É `customer_id`, NUNCA O E-MAIL ────────────────────────
// Mesma disciplina de `customer-orders.js`, e pelo mesmo motivo medido lá: o
// e-mail é atributo autodeclarado, e com "Confirm email" OFF qualquer um se
// cadastra com o endereço da vítima. O escopo aqui é `orders.customer_id =
// uid da sessão`, com o uid confirmado contra `auth.users` — e o e-mail usado
// SOMENTE onde a tabela não tem outra chave (newsletter e carrinho
// abandonado), depois de conferido em `auth.users`.
//
// Como este handler usa `serviceRoleHelpers` (bypassa RLS por desenho), a
// policy corrigida do banco não o alcança: o escopo tem que ser correto AQUI.
// Um erro de filtro neste arquivo é vazamento em massa, não bug de tela.
//
// ── O QUE NÃO ENTRA, E POR QUÊ ──────────────────────────────────────
//   • O VALOR do token de download. Ele não é dado pessoal da titular — é
//     credencial que nós emitimos, de uso único, que abre o arquivo pago. Um
//     JSON exportado circula por e-mail e Drive; token vivo dentro dele vira
//     link de download vazado. Vão o produto, a validade e se já foi usado,
//     que é a informação. O link em si continua saindo por /downloads.
//   • `analytics_events` e `page_views`. São chaveados por `session_id` do
//     navegador, que não está ligado à identidade no servidor — para devolver
//     "os eventos dela" seria preciso primeiro CRIAR essa ligação, ou seja,
//     produzir dado pessoal novo para cumprir um pedido de acesso.
//   • `security_events`. Registram tentativa de ataque por IP; entregá-los sob
//     demanda a quem pede conta o que a detecção enxerga.
// ════════════════════════════════════════════════════════════════════

const VERSAO_DO_FORMATO = '1';

/**
 * Identidade autoritativa do titular, lida de `auth.users` pelo uid.
 *
 * O cookie é assinado por nós — não é forjável — mas carrega uma CÓPIA do
 * e-mail feita no login. Numa operação que devolve o dossiê da pessoa, o que
 * vale é o estado atual, e o e-mail confirmado é a única evidência que o
 * Supabase produz de que aquele endereço pertence a este uid.
 */
async function resolveIdentidade(uid) {
  const admin = getAdminClient();
  if (!admin) return null;

  const { data, error } = await admin.auth.admin.getUserById(uid);
  const user = data?.user;
  if (error || !user?.id || String(user.id) !== String(uid)) return null;
  if (!user.email_confirmed_at) return null;

  return {
    uid: String(user.id),
    email: String(user.email || '')
      .trim()
      .toLowerCase(),
    nome: user.user_metadata?.name || user.user_metadata?.full_name || null,
    contaCriadaEm: user.created_at || null,
  };
}

async function montarPedidos(uid) {
  const pedidos = await listTableRows('orders', {
    select:
      'id,order_code,status,payment_status,total_amount,discount_amount,coupon_code,created_at,completed_at',
    filters: [{ column: 'customer_id', value: uid }],
    orderBy: 'created_at',
    ascending: false,
  });

  if (pedidos.length === 0) return [];

  const ids = pedidos.map((pedido) => pedido.id);
  const itens = await listTableRows('order_items', {
    select: 'order_id,product_id,product_name,unit_price,quantity',
    filters: [{ column: 'order_id', operator: 'in', value: `(${ids.join(',')})` }],
  });

  const tokens = await listTableRows('download_tokens', {
    select: 'order_id,product_id,product_name,used,used_at,expires_at,created_at',
    filters: [{ column: 'order_id', operator: 'in', value: `(${ids.join(',')})` }],
  });

  const porPedido = (linhas, id) => linhas.filter((linha) => String(linha.order_id) === String(id));

  return pedidos.map((pedido) => ({
    codigo: pedido.order_code,
    status: pedido.status,
    statusPagamento: pedido.payment_status,
    total: Number(pedido.total_amount || 0),
    desconto: Number(pedido.discount_amount || 0),
    cupom: pedido.coupon_code || null,
    criadoEm: pedido.created_at,
    concluidoEm: pedido.completed_at,
    itens: porPedido(itens, pedido.id).map((item) => ({
      produto: item.product_name,
      precoUnitario: Number(item.unit_price || 0),
      quantidade: item.quantity,
    })),
    // Sem o valor do token — ver a nota no topo.
    downloads: porPedido(tokens, pedido.id).map((token) => ({
      produto: token.product_name,
      emitidoEm: token.created_at,
      expiraEm: token.expires_at,
      jaUtilizado: token.used === true,
      utilizadoEm: token.used_at || null,
    })),
  }));
}

async function montarNewsletter(email) {
  const inscricao = await getTableRow('email_subscribers', {
    select: 'email,confirmed,confirmed_at,unsubscribed_at,created_at',
    filters: [{ column: 'email', value: email }],
  });

  if (!inscricao) return null;

  return {
    email: inscricao.email,
    confirmada: inscricao.confirmed === true,
    confirmadaEm: inscricao.confirmed_at || null,
    descadastradaEm: inscricao.unsubscribed_at || null,
    inscritaEm: inscricao.created_at,
  };
}

async function montarCarrinhos(email) {
  const carrinhos = await listTableRows('abandoned_carts', {
    select: 'items,total_amount,recovered_at,reminder_sent_at,created_at,updated_at',
    filters: [{ column: 'email', value: email }],
    orderBy: 'updated_at',
    ascending: false,
  });

  return carrinhos.map((carrinho) => ({
    itens: Array.isArray(carrinho.items) ? carrinho.items : [],
    total: Number(carrinho.total_amount || 0),
    recuperadoEm: carrinho.recovered_at || null,
    lembreteEnviadoEm: carrinho.reminder_sent_at || null,
    criadoEm: carrinho.created_at,
    atualizadoEm: carrinho.updated_at,
  }));
}

module.exports = async function meExportDataHandler(req, res) {
  // Ordem da regra A3: método → rate limit → autenticação → try.
  if (guardMethod(req, res, ['GET'])) return;

  const gate = await enforceRateLimit(req, res, RATE_LIMITS.meExportData);
  if (gate.blocked) return;

  // A resposta é o dossiê inteiro da pessoa: não pode ficar em cache de
  // proxy, de CDN nem do navegador de um computador compartilhado.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado.',
      });
    }

    const sessao = getCustomerSessionFromRequest(req);
    if (!sessao?.uid) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.CUSTOMER_SESSION_INVALID,
        message: 'Faça login para exportar seus dados.',
      });
    }

    const identidade = await resolveIdentidade(sessao.uid);
    if (!identidade) {
      return fail(res, {
        status: 401,
        code: ERROR_CODES.CUSTOMER_SESSION_INVALID,
        message: 'Não foi possível confirmar sua identidade. Faça login novamente.',
      });
    }

    const [pedidos, newsletter, carrinhos] = await Promise.all([
      montarPedidos(identidade.uid),
      montarNewsletter(identidade.email),
      montarCarrinhos(identidade.email),
    ]);

    // Rastro de que o acesso aconteceu — sem PII no evento, só o fato.
    await recordSecurityEvent({
      eventName: 'customer_data_exported',
      severity: 'info',
      ip: extractClientIp(req),
      userAgent: req.headers?.['user-agent'],
      properties: { orders: pedidos.length, carts: carrinhos.length },
    }).catch(() => {});

    return ok(res, {
      formato: VERSAO_DO_FORMATO,
      geradoEm: new Date().toISOString(),
      titular: {
        email: identidade.email,
        nome: identidade.nome,
        contaCriadaEm: identidade.contaCriadaEm,
      },
      pedidos,
      newsletter,
      carrinhosAbandonados: carrinhos,
      // O que fica de fora vai DENTRO do arquivo, não só no código: um export
      // silencioso sobre suas próprias omissões é pior que um export honesto
      // sobre elas.
      naoIncluido: {
        tokensDeDownload:
          'O valor do link é credencial de uso único, não dado pessoal. Produto, validade e uso aparecem em cada pedido; o link continua em /downloads.',
        analytics:
          'Eventos de navegação são guardados por identificador de sessão do navegador, sem ligação com sua identidade no servidor.',
        seguranca: 'Registros de segurança são tratados por IP e não são ligados à sua conta.',
      },
    });
  } catch (error) {
    log.error('handler_failed', { reason: error.message });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Não foi possível exportar seus dados agora. Tente novamente.',
    });
  }
};
