const {
  getSupabaseConfig,
  serviceRoleHelpers: { listTableRows, updateTable },
} = require('../lib/supabase');
const { getCustomerSessionFromRequest } = require('../lib/customer-session');
const { getAdminClient } = require('../services/supabase-auth');
const { ERROR_CODES, fail, methodNotAllowed, ok, preflight } = require('../lib/http');
const { createLogger } = require('../lib/logger');

const log = createLogger('customer-orders');

// ════════════════════════════════════════════════════════════════════
// AuthZ deste endpoint — por que a âncora é `customer_id`, e não o e-mail.
//
// A migration 20260812000000_security_hardening_wave1.sql (W1-02) tirou a
// policy de public.orders do claim `email` e passou para
// `customer_id = auth.uid()`, com a justificativa de que o claim `email` NÃO
// prova posse do endereço: com "Confirm email" OFF, qualquer um se cadastra
// com o e-mail da vítima e recebe uma sessão carregando aquele e-mail.
//
// Só que este handler usa serviceRoleHelpers, que BYPASSA RLS — a policy
// corrigida não o alcança. Enquanto ele filtrasse por `customer_email`, o
// mesmo IDOR continuava aberto na camada de aplicação, entregando pedidos,
// itens e — pior — os download_tokens VÁLIDOS de terceiros. Por isso o escopo
// aqui passou a ser exatamente o mesmo da policy: orders.customer_id = uid da
// sessão, sendo o uid o `sub` do usuário no Supabase Auth (chave forte, não
// um atributo autodeclarado).
//
// Registro histórico do bug anterior (não repetir): o filtro já foi `ilike`.
// No PostgREST o valor de `ilike` entra direto no padrão LIKE, e `_`/`%` são
// metacaracteres. Como `_` é caractere legal e corriqueiro em e-mail,
// `ana_lima@x.com` casava `ana.lima@x.com` e o endpoint entregava os pedidos
// de terceiros — IDOR silencioso, sem sequer haver um atacante. Trocado por
// `eq`, e agora o e-mail saiu de vez do caminho de autorização.
// ════════════════════════════════════════════════════════════════════

const ORDER_COLUMNS = 'id,order_code,total_amount,status,payment_status,created_at';

function mapOrder(order, itemsByOrder, tokensByOrder) {
  const orderIdKey = String(order.id);
  return {
    orderId: order.order_code,
    internalOrderId: order.id,
    status: order.status,
    paymentStatus: order.payment_status,
    totalAmount: Number(order.total_amount || 0),
    createdAt: order.created_at,
    items: (itemsByOrder[orderIdKey] || []).map((item) => ({
      id: item.product_id,
      title: item.product_name,
      quantity: item.quantity,
      price: item.unit_price,
    })),
    downloadTokens: (tokensByOrder[orderIdKey] || []).map((token) => ({
      productId: token.product_id,
      productName: token.product_name,
      token: token.token,
      expiresAt: token.expires_at,
      used: token.used === true,
    })),
  };
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const id = String(row[key]);
    if (!acc[id]) {
      acc[id] = [];
    }
    acc[id].push(row);
    return acc;
  }, {});
}

// Identidade AUTORITATIVA do titular: lida de auth.users pelo uid, nunca do
// cookie. O cookie é assinado por nós, então seu e-mail não é forjável pelo
// cliente — mas ele é uma CÓPIA feita no login, e o que vale para reconciliar
// dados é o estado atual em auth.users. Exigimos ainda o e-mail confirmado:
// com "Confirm email" ON (obrigatório — a wave1 lista isso em "NÃO cobre"),
// email_confirmed_at é a única evidência que o Supabase produz de que aquele
// endereço pertence de fato a este uid.
async function resolveAuthIdentity(uid) {
  const admin = getAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin.auth.admin.getUserById(uid);
  const user = data?.user;
  if (error || !user?.id || String(user.id) !== String(uid)) {
    return null;
  }

  const email = String(user.email || '')
    .trim()
    .toLowerCase();
  const confirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
  if (!email || !confirmed) {
    return null;
  }

  return { email };
}

// Reconciliação do checkout de CONVIDADO.
//
// api/create-payment.js grava o pedido sem customer_id (o comprador pode nem
// ter conta), e ensureCustomerAccountFromCheckout cria a conta depois, sem
// voltar para vincular o pedido. Sem esta reconciliação, escopar por
// customer_id faria o cliente perder pedidos legítimos — a wave1 backfillou
// só o histórico até 2026-08-12, e nada mantém o vínculo dali para frente.
//
// O filtro tem DOIS predicados e o segundo é o controle de segurança:
// `customer_id=is.null` restringe a adoção a pedidos ÓRFÃOS. Um pedido já
// vinculado a outro uid é intocável — ninguém "rouba" pedido de quem tem
// conta, que é o caso do cliente recorrente. O e-mail aqui não autoriza
// leitura: ele apenas casa órfão com dono, e vem de auth.users (uid → e-mail),
// não da sessão crua.
//
// RISCO RESIDUAL, assumido e documentado: se "Confirm email" estiver OFF no
// projeto hospedado E a vítima nunca tiver criado conta (pedidos órfãos), um
// atacante que registre o e-mail dela adota esses órfãos. Não há, na camada de
// aplicação, prova de posse melhor que essa para um pedido feito sem conta —
// o fecho definitivo é "Confirm email = ON" no dashboard.
async function adoptOrphanGuestOrders(uid, email) {
  const adopted = await updateTable(
    'orders',
    { customer_email: `eq.${email}`, customer_id: 'is.null' },
    { customer_id: uid },
  );
  return Array.isArray(adopted) ? adopted.length : 0;
}

function listOwnOrders(uid) {
  return listTableRows('orders', {
    select: ORDER_COLUMNS,
    filters: [{ column: 'customer_id', operator: 'eq', value: uid }],
    orderBy: 'created_at',
    ascending: false,
  });
}

module.exports = async function customerOrdersHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return preflight(res);
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET', 'OPTIONS']);
  }

  try {
    if (!getSupabaseConfig()) {
      return fail(res, {
        status: 500,
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Supabase não configurado',
      });
    }

    // O uid vem da sessão de cliente (cookie HttpOnly assinado), NUNCA de um
    // parâmetro — do contrário qualquer um listaria pedidos e tokens de
    // download de qualquer cliente (IDOR).
    const session = getCustomerSessionFromRequest(req);
    const uid = String(session?.uid || '').trim();
    if (!uid) {
      // CUSTOMER_SESSION_INVALID e não UNAUTHORIZED genérico: o espelho de
      // `src/constants/error-codes.js` traz o código específico justamente para
      // o cliente distinguir "sua sessão caiu, faça login" de "você não tem
      // permissão". Enquanto nenhum handler o emitia, era um ramo morto dos
      // dois lados (regra A2).
      return fail(res, {
        status: 401,
        code: ERROR_CODES.CUSTOMER_SESSION_INVALID,
        message: 'Autenticação necessária.',
      });
    }

    // As duas chamadas são independentes: a leitura já vale por si, e a
    // identidade só serve para a reconciliação. Em paralelo para não pagar
    // dois RTTs em série no caminho comum (nenhum órfão para adotar).
    const [linkedOrders, identity] = await Promise.all([
      listOwnOrders(uid),
      resolveAuthIdentity(uid).catch((err) => {
        log.warn('identidade_nao_resolvida', { reason: err.message });
        return null;
      }),
    ]);

    let ordersRows = linkedOrders;

    if (identity) {
      try {
        // Reler só quando houve adoção: no caso comum o PATCH não casa nada e
        // a lista já está completa.
        if (await adoptOrphanGuestOrders(uid, identity.email)) {
          ordersRows = await listOwnOrders(uid);
        }
      } catch (err) {
        // Degrada em vez de derrubar a página: o cliente vê os pedidos já
        // vinculados. Falhar aqui nunca amplia o escopo — só o reduz.
        log.warn('adocao_de_pedidos_orfaos_falhou', { reason: err.message });
      }
    }

    if (!ordersRows.length) {
      return ok(res, { success: true, orders: [] });
    }

    // Filtra por order_id NA QUERY (in.(...)), em vez de baixar as tabelas
    // inteiras e filtrar em memória (evita carregar itens/tokens de terceiros).
    const orderIds = ordersRows.map((order) => String(order.id));
    const orderIdFilter = `(${orderIds.join(',')})`;

    const itemsRows = await listTableRows('order_items', {
      select: 'order_id,product_id,product_name,unit_price,quantity',
      filters: [{ column: 'order_id', operator: 'in', value: orderIdFilter }],
      orderBy: 'order_id',
      ascending: false,
    });

    const tokensRows = await listTableRows('download_tokens', {
      select: 'order_id,product_id,product_name,token,used,expires_at',
      filters: [{ column: 'order_id', operator: 'in', value: orderIdFilter }],
      orderBy: 'created_at',
      ascending: false,
    });

    const groupedItems = groupBy(itemsRows, 'order_id');
    const groupedTokens = groupBy(tokensRows, 'order_id');

    const orders = ordersRows.map((order) => mapOrder(order, groupedItems, groupedTokens));
    return ok(res, { success: true, orders });
  } catch (error) {
    log.error('handler_failed', { reason: error?.message || String(error) });
    return fail(res, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Erro ao buscar pedidos do cliente',
    });
  }
};
