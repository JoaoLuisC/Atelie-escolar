export const CART_KEY = 'cart';

/**
 * Item do carrinho como o resto do app espera, ou `null` se o dado guardado não
 * tem forma de item.
 *
 * ── POR QUE A LEITURA DESCONFIA DO QUE ESTÁ GUARDADO (LOJA-01) ──────
 * O localStorage é de quem tem o navegador: extensão, versão antiga do site,
 * outra aba no meio de uma gravação ou alguém no console. Com `cart = '{}'`, o
 * `cart.reduce` do CartProvider estourava no primeiro render e o site inteiro
 * caía em "Algo deu errado" — e "Recarregar" não resolvia, porque o dado
 * corrompido continuava lá. Agora o que não é item é descartado na leitura, e
 * a próxima gravação substitui o valor ruim.
 */
function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id;
  if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim() === '') return null;
  const price = Number(raw.price);
  const quantity = Math.trunc(Number(raw.quantity));
  return {
    ...raw,
    id,
    name: typeof raw.name === 'string' ? raw.name : String(raw.name ?? ''),
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    image: typeof raw.image === 'string' ? raw.image : '',
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
  };
}

export function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.map(sanitizeItem).filter((item) => {
      // Duplicata do mesmo produto também é dado inválido: o carrinho guarda
      // um item por produto (addToCart recusa o repetido).
      if (!item || seen.has(String(item.id))) return false;
      seen.add(String(item.id));
      return true;
    });
  } catch {
    return [];
  }
}

const toCents = (value) => Math.round((Number(value) || 0) * 100);

/**
 * Aplica ao carrinho a cotação do servidor (CROSS-03/CROSS-04). Função pura.
 *
 * - item indisponível (pausado ou apagado no painel) sai do carrinho: o
 *   create-payment recusaria o pedido inteiro por causa dele;
 * - preço diferente do guardado vira o preço do servidor, que é o cobrado;
 * - nome e categoria acompanham em silêncio (a categoria decide cupom
 *   restrito);
 * - item que a cotação não menciona fica como está (entrou no carrinho depois
 *   de a consulta sair, com preço recém-lido).
 *
 * Devolve o MESMO array quando nada muda, para o React não re-renderizar à toa.
 *
 * @returns {{ cart: Array, changed: Array<{id, name, oldPrice, newPrice}>,
 *   removed: Array<{id, name}> }}
 */
export function applyQuoteToCart(cart, quoteItems) {
  const quoteById = new Map(
    (Array.isArray(quoteItems) ? quoteItems : []).map((quote) => [String(quote.productId), quote]),
  );
  const changed = [];
  const removed = [];
  let touched = false;

  const next = [];
  for (const item of cart) {
    const quote = quoteById.get(String(item.id));
    if (!quote) {
      next.push(item);
      continue;
    }
    if (quote.available === false) {
      removed.push({ id: item.id, name: item.name });
      touched = true;
      continue;
    }

    const updated = { ...item };
    let diff = false;
    const price = Number(quote.price);
    if (Number.isFinite(price) && toCents(price) !== toCents(item.price)) {
      changed.push({
        id: item.id,
        name: quote.name || item.name,
        oldPrice: Number(item.price) || 0,
        newPrice: price,
      });
      updated.price = price;
      diff = true;
    }
    if (quote.name && quote.name !== item.name) {
      updated.name = quote.name;
      diff = true;
    }
    const categoryId = quote.categoryId ?? null;
    if (categoryId !== (item.categoryId ?? null)) {
      updated.categoryId = categoryId;
      diff = true;
    }
    if (diff) touched = true;
    next.push(diff ? updated : item);
  }

  return { cart: touched ? next : cart, changed, removed };
}

/**
 * Assinatura do carrinho para saber se um cálculo feito sobre ele (o desconto
 * do cupom) ainda vale: muda quando muda item, quantidade OU preço.
 */
export function cartSignatureOf(cart) {
  return (Array.isArray(cart) ? cart : [])
    .map((item) => `${item.id}:${item.quantity || 1}:${toCents(item.price)}`)
    .join('|');
}

/**
 * Grava o carrinho. NUNCA joga.
 *
 * Cota cheia, Safari em aba anônima ou storage bloqueado fazem o `setItem`
 * lançar — e, chamado de dentro de um efeito, isso derrubava a árvore inteira
 * (LOJA-01). O carrinho continua valendo em memória até o fim da visita; só não
 * sobrevive ao F5. Devolve `false` para quem quiser avisar.
 */
export function writeCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    return true;
  } catch {
    return false;
  }
}
