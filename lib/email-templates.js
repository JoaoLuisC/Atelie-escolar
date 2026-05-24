const { getAppUrl } = require('./email-sender');

/**
 * Templates HTML para todos os emails do Ateliê.
 *
 * Princípios de copy (alinhados a REGRAS_ECOMMERCE):
 * - Personalização nominal só no corpo, NUNCA no assunto (regra C9, D5)
 * - Segmentação por categoria, não por individualização
 * - Sem urgência falsa, sem "queima total"
 * - Foco em um único CTA por email
 *
 * Cada template recebe um objeto de contexto e retorna { subject, html }.
 */

const BRAND_COLORS = {
  primary: '#7A3DC0',
  primaryLight: '#9B5DE5',
  accent: '#F15BB5',
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function priceLabel(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function shell(innerHtml, { title } = {}) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(title || 'Ateliê da Escola')}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#2d3748;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    ${innerHtml}
  </div>
</body>
</html>`;
}

function heroBlock({ emoji, title, subtitle }) {
  return `
    <div style="background:linear-gradient(135deg,${BRAND_COLORS.primary} 0%,${BRAND_COLORS.primaryLight} 100%);border-radius:16px 16px 0 0;padding:32px 36px 28px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">${emoji}</div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-.3px;">${escapeHtml(title)}</h1>
      ${subtitle ? `<p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:14px;">${escapeHtml(subtitle)}</p>` : ''}
    </div>`;
}

function bodyBlock(inner) {
  return `
    <div style="background:#fff;padding:32px 36px;border-radius:0 0 16px 16px;box-shadow:0 4px 20px rgba(0,0,0,.08);">
      ${inner}
    </div>`;
}

function ctaButton({ href, label }) {
  return `
    <div style="text-align:center;margin:28px 0;">
      <a href="${escapeHtml(href)}" style="
        display:inline-block;
        background:linear-gradient(135deg,${BRAND_COLORS.primaryLight} 0%,${BRAND_COLORS.primary} 100%);
        color:#fff;text-decoration:none;border-radius:10px;
        padding:14px 36px;font-size:16px;font-weight:700;
        box-shadow:0 4px 16px rgba(122,61,192,.35);
      ">
        ${escapeHtml(label)}
      </a>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════
// 1. Confirmação de pedido (transacional — D+0)
// ════════════════════════════════════════════════════════════════════
function orderConfirmation({ orderId, customerName, items = [], totalAmount, isNewAccount }) {
  const appUrl = getAppUrl();
  const downloadsUrl = `${appUrl}/downloads?order=${encodeURIComponent(orderId)}`;
  const loginUrl = `${appUrl}/login`;

  const itemsHtml = items.length
    ? items.map((item) => `
        <li style="padding:8px 0;border-bottom:1px solid #f0e8ff;font-size:14px;">
          <strong>${escapeHtml(item.name || item.product_name)}</strong>
          &nbsp;–&nbsp; ${priceLabel(item.price || item.unit_price)}
        </li>`).join('')
    : '<li style="color:#94a3b8;">Detalhes dos produtos disponíveis na área de downloads.</li>';

  const accountBlock = isNewAccount ? `
    <div style="background:#f5f0ff;border:1.5px solid #d4b8ff;border-radius:12px;padding:18px 22px;margin:24px 0;">
      <h3 style="margin:0 0 10px;color:${BRAND_COLORS.primary};font-size:14px;font-weight:700;">
        🔑 Conta criada para você
      </h3>
      <p style="font-size:13px;margin:0;color:#475569;">
        Clique em "Esqueci minha senha" em <a href="${loginUrl}" style="color:${BRAND_COLORS.primaryLight};font-weight:600;">${escapeHtml(loginUrl)}</a>
        para definir uma senha e acessar seus arquivos a qualquer momento.
      </p>
    </div>` : '';

  return {
    subject: '🎉 Pagamento confirmado — seus arquivos estão liberados',
    html: shell(
      heroBlock({ emoji: '🎉', title: 'Pagamento confirmado!', subtitle: `Obrigada pela sua compra, ${customerName || 'cliente'}!` })
      + bodyBlock(`
        <p style="font-size:15px;margin:0 0 16px;">
          Seu pedido <strong style="color:${BRAND_COLORS.primary};">#${escapeHtml(orderId)}</strong> foi aprovado.
          Acesse seus downloads imediatamente:
        </p>
        ${ctaButton({ href: downloadsUrl, label: '⬇️ Acessar meus downloads' })}

        <h3 style="font-size:12px;font-weight:700;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">
          Produtos adquiridos
        </h3>
        <ul style="list-style:none;padding:0;margin:0;">${itemsHtml}</ul>
        ${totalAmount ? `<p style="text-align:right;font-weight:800;color:${BRAND_COLORS.primary};font-size:16px;margin:12px 0 0;">Total: ${priceLabel(totalAmount)}</p>` : ''}

        ${accountBlock}
      `),
      { title: 'Pagamento confirmado' },
    ),
  };
}

// ════════════════════════════════════════════════════════════════════
// 2. Opt-in confirmation (double opt-in — regra D1)
// ════════════════════════════════════════════════════════════════════
function optInConfirmation({ confirmationToken }) {
  const appUrl = getAppUrl();
  const confirmUrl = `${appUrl}/confirmar-inscricao?token=${encodeURIComponent(confirmationToken)}`;

  return {
    subject: 'Confirme sua inscrição — Ateliê da Escola',
    html: shell(
      heroBlock({ emoji: '📬', title: 'Quase lá!', subtitle: 'Falta só confirmar sua inscrição' })
      + bodyBlock(`
        <p style="font-size:15px;margin:0 0 16px;">
          Recebemos seu pedido de inscrição na nossa lista de novidades.
          Para começar a receber dicas e materiais educativos novos, confirme seu email:
        </p>
        ${ctaButton({ href: confirmUrl, label: '✓ Confirmar inscrição' })}
        <p style="font-size:13px;color:#64748b;margin:16px 0 0;">
          Se não foi você que se inscreveu, ignore este email — nada acontece.
        </p>
      `),
      { title: 'Confirme sua inscrição' },
    ),
  };
}

// ════════════════════════════════════════════════════════════════════
// 3. Post-purchase D+3 — review request (regra D4)
// ════════════════════════════════════════════════════════════════════
function postPurchaseD3({ orderId, customerName, items = [] }) {
  const appUrl = getAppUrl();
  const productNames = items.map((i) => i.name || i.product_name).filter(Boolean);
  const firstProduct = productNames[0] || 'seu material';

  return {
    subject: 'Como foi sua experiência com o material?',
    html: shell(
      heroBlock({ emoji: '💜', title: 'E aí, deu certo?', subtitle: `Faz uns dias que você baixou ${firstProduct}` })
      + bodyBlock(`
        <p style="font-size:15px;margin:0 0 16px;">
          Olá ${escapeHtml(customerName || '')}, tudo bem?
        </p>
        <p style="font-size:15px;margin:0 0 16px;">
          A gente faz cada material pensando em quem está na sala de aula.
          Sua opinião sobre <strong>${escapeHtml(firstProduct)}</strong> ajuda a melhorar e a inspirar outros professores.
        </p>
        <p style="font-size:15px;margin:0 0 16px;">
          Pode responder este email contando como foi? Bastam duas linhas. Se preferir avaliar com nota, é só clicar:
        </p>
        ${ctaButton({ href: `${appUrl}/avaliar?order=${encodeURIComponent(orderId)}`, label: '⭐ Avaliar em 1 minuto' })}
      `),
      { title: 'Como foi sua experiência?' },
    ),
  };
}

// ════════════════════════════════════════════════════════════════════
// 4. Post-purchase D+15 — produto complementar (regra D5: por categoria)
// ════════════════════════════════════════════════════════════════════
function postPurchaseD15({ customerName, category, suggestions = [] }) {
  const appUrl = getAppUrl();
  const categoryLabel = category || 'sua área de atuação';

  const suggestionsHtml = suggestions.length
    ? suggestions.slice(0, 3).map((p) => `
        <a href="${appUrl}/produtos/${encodeURIComponent(p.slug || p.id)}" style="text-decoration:none;color:inherit;display:block;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:8px;">
          <strong style="color:${BRAND_COLORS.primary};font-size:14px;">${escapeHtml(p.name)}</strong>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">${priceLabel(p.price)}</div>
        </a>`).join('')
    : `<p style="color:#64748b;font-size:14px;">Dá uma olhada no <a href="${appUrl}/produtos" style="color:${BRAND_COLORS.primaryLight};">catálogo completo</a>.</p>`;

  return {
    subject: `Novidades em ${categoryLabel}`,
    html: shell(
      heroBlock({ emoji: '✨', title: `Mais material de ${categoryLabel}`, subtitle: 'Selecionei pensando em você' })
      + bodyBlock(`
        <p style="font-size:15px;margin:0 0 16px;">
          Olá ${escapeHtml(customerName || '')}!
        </p>
        <p style="font-size:15px;margin:0 0 20px;">
          Como você se interessou por <strong>${escapeHtml(categoryLabel)}</strong>,
          separei alguns materiais que combinam bem com o que você já tem em casa:
        </p>
        ${suggestionsHtml}
        ${ctaButton({ href: `${appUrl}/produtos`, label: 'Ver catálogo completo' })}
      `),
      { title: `Novidades em ${categoryLabel}` },
    ),
  };
}

// ════════════════════════════════════════════════════════════════════
// 5. Post-purchase D+45 — novidade da mesma categoria
// ════════════════════════════════════════════════════════════════════
function postPurchaseD45({ customerName, category, newProducts = [] }) {
  const appUrl = getAppUrl();
  const categoryLabel = category || 'sua categoria';

  const productsHtml = newProducts.length
    ? newProducts.slice(0, 3).map((p) => `
        <a href="${appUrl}/produtos/${encodeURIComponent(p.slug || p.id)}" style="text-decoration:none;color:inherit;display:block;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:8px;">
          <strong style="color:${BRAND_COLORS.primary};font-size:14px;">${escapeHtml(p.name)}</strong>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">${priceLabel(p.price)}</div>
        </a>`).join('')
    : '';

  return {
    subject: `Acabamos de adicionar novidades em ${categoryLabel}`,
    html: shell(
      heroBlock({ emoji: '🆕', title: 'Chegou material novo', subtitle: `Selecionado para quem usa ${categoryLabel}` })
      + bodyBlock(`
        <p style="font-size:15px;margin:0 0 16px;">
          Olá ${escapeHtml(customerName || '')}!
        </p>
        <p style="font-size:15px;margin:0 0 20px;">
          Você comprou material de ${escapeHtml(categoryLabel)} faz uns dias.
          ${productsHtml ? 'Acabei de publicar alguns novos que ainda não estavam disponíveis na sua compra:' : 'Passa lá no catálogo, tem coisa nova.'}
        </p>
        ${productsHtml}
        ${ctaButton({ href: `${appUrl}/produtos`, label: 'Ver tudo de novo' })}
      `),
      { title: 'Material novo na sua categoria' },
    ),
  };
}

// ════════════════════════════════════════════════════════════════════
// 6. Abandoned cart (1h e 24h)
// ════════════════════════════════════════════════════════════════════
function abandonedCart({ items = [], step = '1h' }) {
  const appUrl = getAppUrl();
  const checkoutUrl = `${appUrl}/checkout`;

  const itemsHtml = items.length
    ? items.slice(0, 5).map((item) => `
        <li style="padding:8px 0;border-bottom:1px solid #f0e8ff;font-size:14px;">
          <strong>${escapeHtml(item.name)}</strong>
          &nbsp;–&nbsp; ${priceLabel(item.price)}
        </li>`).join('')
    : '<li style="color:#94a3b8;">Materiais aguardando você no carrinho.</li>';

  const isLater = step === '24h';
  const heading = isLater ? 'Seu carrinho ainda está aqui' : 'Esqueceu algo no carrinho?';
  const subtitle = isLater
    ? 'Reservamos seus materiais por mais alguns dias.'
    : 'Achei melhor avisar antes que você esqueça.';

  return {
    subject: isLater ? 'Seu carrinho ainda está esperando' : 'Você esqueceu algo no carrinho 🛒',
    html: shell(
      heroBlock({ emoji: '🛒', title: heading, subtitle })
      + bodyBlock(`
        <p style="font-size:15px;margin:0 0 16px;">
          ${isLater
            ? 'Os materiais que você escolheu continuam disponíveis. Quando quiser finalizar, é só clicar abaixo — vamos te levar direto para o checkout com tudo já preenchido.'
            : 'Notei que você começou a comprar mas não terminou. Sem pressa! Seus materiais estão salvos aqui:'}
        </p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${itemsHtml}</ul>
        ${ctaButton({ href: checkoutUrl, label: 'Finalizar minha compra' })}
        <p style="font-size:13px;color:#64748b;margin:16px 0 0;text-align:center;">
          Se mudou de ideia, sem problema — é só ignorar este email.
        </p>
      `),
      { title: heading },
    ),
  };
}

// ════════════════════════════════════════════════════════════════════
// 7. Reativação 90 dias — cupom (regra D8 — só 90-180d, nunca 180+)
// ════════════════════════════════════════════════════════════════════
function reactivation90({ customerName, couponCode = 'VOLTEI15', discountPct = 15 }) {
  const appUrl = getAppUrl();

  return {
    subject: 'Faz um tempo que a gente não se vê 💜',
    html: shell(
      heroBlock({ emoji: '💜', title: 'Sentimos sua falta', subtitle: 'Tem cupom esperando você' })
      + bodyBlock(`
        <p style="font-size:15px;margin:0 0 16px;">
          Olá ${escapeHtml(customerName || '')}!
        </p>
        <p style="font-size:15px;margin:0 0 20px;">
          Faz um tempinho que você não passa por aqui.
          Como agradecimento por já ter comprado conosco, separei <strong>${discountPct}% de desconto</strong> na sua próxima compra.
        </p>
        <div style="background:#fff7ed;border:2px dashed #f59e0b;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Cupom</p>
          <p style="margin:0;font-size:22px;font-weight:800;letter-spacing:.1em;color:#92400e;">${escapeHtml(couponCode)}</p>
        </div>
        ${ctaButton({ href: `${appUrl}/produtos`, label: 'Ver catálogo com desconto' })}
        <p style="font-size:13px;color:#64748b;margin:16px 0 0;text-align:center;">
          Aplique o cupom no checkout. Sem pressa.
        </p>
      `),
      { title: 'Cupom de boas-vindas de volta' },
    ),
  };
}

// ════════════════════════════════════════════════════════════════════
// 8. Unsubscribe success
// ════════════════════════════════════════════════════════════════════
function unsubscribeSuccess() {
  const appUrl = getAppUrl();
  return {
    subject: 'Você foi removido da nossa lista',
    html: shell(
      heroBlock({ emoji: '👋', title: 'Inscrição cancelada', subtitle: 'Sem ressentimentos!' })
      + bodyBlock(`
        <p style="font-size:15px;margin:0 0 16px;">
          Você não vai mais receber emails de marketing da gente.
        </p>
        <p style="font-size:14px;color:#64748b;margin:0 0 16px;">
          Você ainda recebe emails operacionais (confirmação de compra, downloads, etc.) porque são essenciais para o funcionamento da loja.
        </p>
        <p style="font-size:14px;color:#64748b;margin:0;">
          Se mudar de ideia, é só voltar ao <a href="${appUrl}" style="color:${BRAND_COLORS.primaryLight};">site</a> e se inscrever de novo no rodapé.
        </p>
      `),
      { title: 'Inscrição cancelada' },
    ),
  };
}

module.exports = {
  orderConfirmation,
  optInConfirmation,
  postPurchaseD3,
  postPurchaseD15,
  postPurchaseD45,
  abandonedCart,
  reactivation90,
  unsubscribeSuccess,
};
