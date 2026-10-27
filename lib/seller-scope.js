// ════════════════════════════════════════════════════════════════════
// RECORTE POR PROFESSORA — pedidos e clientes só dos materiais dela.
//
// No painel da loja, a professora (sessão `seller`) vê apenas:
//   • os pedidos que têm pelo menos um material dela (products.seller_id);
//   • nesses pedidos, só os itens dela, e o VALOR só da parte dela;
//   • como clientes, só quem comprou esses materiais.
// Admin/master não têm recorte: veem a plataforma inteira.
//
// A parte dela num pedido é proporcional: total_amount × (itens dela ÷ todos
// os itens). Pedido só com material dela → o total inteiro (com o desconto do
// cupom já aplicado); pedido misto com outro professor → a fatia dela.
//
// O recorte é feito NO SERVIDOR, em cada endpoint que devolve pedido ou
// cliente. Esconder no front não protegeria nada.
// ════════════════════════════════════════════════════════════════════

const { getStaffSession } = require('./admin-session');
const {
  serviceRoleHelpers: { listTableRows },
} = require('./supabase');

const IN_CHUNK = 100;

/** `{ sellerId }` para professora; `null` para admin/master (sem recorte). */
function getSellerScope(req) {
  const session = getStaffSession(req);
  if (session?.role !== 'seller' || !session.userId) return null;
  return { sellerId: session.userId };
}

function itemAmount(item) {
  const total = Number(item?.total_price);
  if (Number.isFinite(total) && total > 0) return total;
  return Number(item?.unit_price || 0) * Number(item?.quantity || 0);
}

async function listIn(table, select, column, values) {
  const ids = [...new Set(values.map(String))];
  const pages = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    pages.push(
      listTableRows(table, {
        select,
        filters: [{ column, operator: 'in', value: `(${ids.slice(i, i + IN_CHUNK).join(',')})` }],
      }),
    );
  }
  return (await Promise.all(pages)).flat();
}

/** Ids (texto) dos produtos da professora. */
async function loadSellerProductIds(sellerId) {
  const rows = await listTableRows('products', {
    select: 'id',
    filters: [{ column: 'seller_id', value: sellerId }],
  });
  return new Set(rows.map((row) => String(row.id)));
}

/**
 * Mapa order_id → { share, ownItems } para os pedidos com material da
 * professora. `share` ∈ (0, 1] é a fração do pedido que é dela.
 */
async function loadSellerOrderShares(productIds) {
  if (!productIds.size) return new Map();
  const ownItems = await listIn(
    'order_items',
    'order_id,product_id,product_name,unit_price,quantity,total_price',
    'product_id',
    [...productIds],
  );
  const orderIds = [...new Set(ownItems.map((item) => String(item.order_id)))];
  if (!orderIds.length) return new Map();
  const allItems = await listIn(
    'order_items',
    'order_id,unit_price,quantity,total_price',
    'order_id',
    orderIds,
  );

  const allSum = new Map();
  for (const item of allItems) {
    const key = String(item.order_id);
    allSum.set(key, (allSum.get(key) || 0) + itemAmount(item));
  }
  const shares = new Map();
  for (const item of ownItems) {
    const key = String(item.order_id);
    const entry = shares.get(key) || { own: 0, ownItems: [] };
    entry.own += itemAmount(item);
    entry.ownItems.push(item);
    shares.set(key, entry);
  }
  for (const [key, entry] of shares) {
    const total = allSum.get(key) || 0;
    entry.share = total > 0 ? Math.min(1, entry.own / total) : 1;
  }
  return shares;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Recorta linhas de `orders` (como vieram do banco). Sem recorte, devolve o
 * que recebeu. Com recorte: só pedidos com material dela, e os campos de
 * valor (`total_amount`, `discount_amount`, …) multiplicados pela parte dela.
 *
 * @returns {Promise<{ orders: object[], productIds: Set<string>|null, shares: Map|null }>}
 */
async function scopeOrderRows(
  orderRows,
  scope,
  { amountKeys = ['total_amount', 'discount_amount'] } = {},
) {
  if (!scope) return { orders: orderRows, productIds: null, shares: null };
  const productIds = await loadSellerProductIds(scope.sellerId);
  const shares = await loadSellerOrderShares(productIds);
  const orders = [];
  for (const row of orderRows) {
    const entry = shares.get(String(row.id));
    if (!entry) continue;
    const scoped = { ...row };
    for (const key of amountKeys) {
      if (key in scoped && scoped[key] !== null)
        scoped[key] = roundMoney(Number(scoped[key]) * entry.share);
    }
    orders.push(scoped);
  }
  return { orders, productIds, shares };
}

/** Só os itens de pedido dos materiais dela. */
function scopeItemRows(itemRows, productIds) {
  if (!productIds) return itemRows;
  return itemRows.filter((item) => productIds.has(String(item.product_id)));
}

/** Clientes = quem tem pedido no recorte (por id de conta ou e-mail). */
function scopeCustomerRows(profileRows, scopedOrders) {
  const emails = new Set(
    scopedOrders
      .map((order) =>
        String(order.customer_email || '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  const ids = new Set(scopedOrders.map((order) => String(order.customer_id || '')).filter(Boolean));
  return profileRows.filter(
    (profile) =>
      ids.has(String(profile.id)) ||
      emails.has(
        String(profile.email || '')
          .trim()
          .toLowerCase(),
      ),
  );
}

module.exports = {
  getSellerScope,
  loadSellerProductIds,
  scopeCustomerRows,
  scopeItemRows,
  scopeOrderRows,
};
