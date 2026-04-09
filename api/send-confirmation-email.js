const nodemailer = require('nodemailer');
const { getSupabaseConfig, getTableRow, listTableRows } = require('../lib/supabase');

/**
 * API: Enviar e-mail de confirmação após pagamento aprovado
 * POST /api/send-confirmation-email
 * Body: { orderId, customerName, customerEmail, isNewAccount }
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, customerName, customerEmail, isNewAccount } = req.body;

    if (!orderId || !customerEmail) {
      return res.status(400).json({ error: 'orderId e customerEmail são obrigatórios' });
    }

    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: true, sent: false, reason: 'supabase_not_configured' });
    }

    // Busca o pedido no Supabase para pegar os itens
    const order = await getTableRow('orders', {
      select: 'id,order_code,total_amount,customer_email',
      filters: [{ column: 'order_code', value: orderId }],
    });

    const orderItems = order
      ? await listTableRows('order_items', {
          select: 'order_id,product_name,unit_price,quantity',
          filters: [{ column: 'order_id', value: order.id }],
          orderBy: 'id',
          ascending: true,
        })
      : [];

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const downloadsUrl = `${appUrl}/downloads?order=${orderId}`;
    const loginUrl = `${appUrl}/login`;

    // Monta lista de produtos
    const itemsHtml = order
      ? orderItems.map(item =>
          `<li style="padding:6px 0;border-bottom:1px solid #f0e8ff;font-size:15px;">
             <strong>${item.product_name}</strong>
             &nbsp;–&nbsp; R$ ${Number(item.unit_price || 0).toFixed(2).replace('.', ',')}
           </li>`
        ).join('')
      : '<li>Produtos indisponíveis no momento</li>';

    const totalAmount = order
      ? `R$ ${Number(order.total_amount || 0).toFixed(2).replace('.', ',')}`
      : '';

    // Bloco de credenciais (só para contas novas)
    const credentialsBlock = isNewAccount ? `
      <div style="background:#f5f0ff;border:1.5px solid #d4b8ff;border-radius:12px;padding:20px 24px;margin:24px 0;">
        <h3 style="margin:0 0 12px;color:#7A3DC0;font-size:15px;font-weight:700;">
          🔑 Seus dados de acesso
        </h3>
        <table style="font-size:14px;color:#2d3748;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 12px 4px 0;color:#718096;font-weight:600;">Login:</td>
            <td style="padding:4px 0;"><strong>${customerEmail}</strong></td>
          </tr>
          <tr>
            <td style="padding:4px 12px 4px 0;color:#718096;font-weight:600;">Senha:</td>
            <td style="padding:4px 0;"><strong>123456</strong></td>
          </tr>
        </table>
        <p style="font-size:12px;color:#718096;margin:12px 0 0;">
          💡 Recomendamos alterar sua senha após o primeiro acesso em
          <a href="${loginUrl}" style="color:#9B5DE5;">${loginUrl}</a>.
        </p>
      </div>` : '';

    // Template HTML do e-mail
    const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#7A3DC0 0%,#9B5DE5 100%);border-radius:16px 16px 0 0;padding:32px 36px 28px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">🎉</div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-.3px;">Pagamento confirmado!</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px;">Obrigada pela sua compra, ${customerName || 'cliente'}!</p>
    </div>

    <!-- Body -->
    <div style="background:#fff;padding:32px 36px;border-radius:0 0 16px 16px;box-shadow:0 4px 20px rgba(0,0,0,.08);">

      <p style="font-size:15px;color:#2d3748;margin:0 0 20px;">
      Seu pedido <strong style="color:#7A3DC0;">#${orderId}</strong> foi aprovado com sucesso.
        Clique no botão abaixo para acessar seus downloads imediatamente:
      </p>

      <!-- Download Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${downloadsUrl}" style="
          display:inline-block;
          background:linear-gradient(135deg,#9B5DE5 0%,#7A3DC0 100%);
          color:#fff;text-decoration:none;border-radius:10px;
          padding:14px 36px;font-size:16px;font-weight:700;
          box-shadow:0 4px 16px rgba(122,61,192,.35);
        ">
          ⬇️ Acessar Meus Downloads
        </a>
      </div>

      <!-- Produtos -->
      <h3 style="color:#2d3748;font-size:14px;font-weight:700;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.05em;">
        Produtos adquiridos
      </h3>
      <ul style="list-style:none;padding:0;margin:0 0 4px;">
        ${itemsHtml}
      </ul>
      ${totalAmount ? `<p style="text-align:right;font-weight:800;color:#7A3DC0;font-size:16px;margin:12px 0 0;">Total: ${totalAmount}</p>` : ''}

      ${credentialsBlock}

      <!-- Footer note -->
      <div style="border-top:1.5px solid #f0e8ff;padding-top:20px;margin-top:24px;font-size:12px;color:#a0aec0;text-align:center;">
        <p style="margin:0;">Ateli&ecirc; da Escola &mdash; Materiais gr&aacute;ficos para educa&ccedil;&atilde;o 🎨<br>
        Se tiver d&uacute;vidas, responda este e-mail ou acesse <a href="${appUrl}" style="color:#9B5DE5;">${appUrl}</a></p>
      </div>
    </div>

  </div>
</body>
</html>`;

    // ── Verifica se SMTP está configurado ───────────────────────────────────
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('[send-confirmation-email] SMTP não configurado — e-mail NÃO enviado.');
      console.log('[send-confirmation-email] Destinatário:', customerEmail);
      console.log('[send-confirmation-email] Link de download:', downloadsUrl);
      return res.status(200).json({ success: true, sent: false, reason: 'smtp_not_configured' });
    }

    // ── Configura transporter ───────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Ateliê da Escola" <${process.env.SMTP_USER}>`,
      to: customerEmail,
      subject: '🎉 Pagamento confirmado – Ateliê da Escola',
      html: htmlBody,
    });

    console.log('[send-confirmation-email] E-mail enviado para:', customerEmail);
    return res.status(200).json({ success: true, sent: true });

  } catch (error) {
    console.error('[send-confirmation-email] Erro:', error.message);
    // Não falha o checkout por causa do e-mail
    return res.status(200).json({ success: true, sent: false, error: error.message });
  }
};
