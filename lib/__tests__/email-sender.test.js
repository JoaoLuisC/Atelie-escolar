import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/email-sender.js` — item P4.1 (terceiro módulo na ordem de risco) e a
// prova do §2.2.
//
// Por que importa: falha silenciosa aqui é PEDIDO PAGO SEM ENTREGA. E é o
// módulo onde o teto de escala do cron mora — cada e-mail pagava TCP + TLS +
// AUTH do zero, sob o `maxDuration: 60` do vercel.json.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);

const {
  MARKETING_KINDS,
  TRANSACTIONAL_KINDS,
  buildMarketingFooter,
  getAppUrl,
  getTransporter,
  isSmtpConfigured,
  resetTransporter,
  sendEmail,
} = requireCjs('../email-sender.js');

describe('email-sender', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    resetTransporter();
    // Sem Supabase: a idempotência é best-effort e não deve ser exercitada
    // aqui. Este arquivo testa transporte e conteúdo.
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    resetTransporter();
    process.env = ambienteOriginal;
  });

  describe('getTransporter (§2.2)', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.exemplo.test';
      process.env.SMTP_USER = 'user@exemplo.test';
      process.env.SMTP_PASS = 'senha';
      process.env.SMTP_PORT = '587';
    });

    it('devolve a MESMA instância entre chamadas', () => {
      // A regressão que isto trava: `buildTransporter()` era chamado dentro de
      // `sendEmail`, então cada e-mail abria TCP + TLS + AUTH do zero.
      expect(getTransporter()).toBe(getTransporter());
    });

    it('usa pool, com teto de conexões e de mensagens por conexão', () => {
      const { options } = getTransporter();

      expect(options.pool).toBe(true);
      expect(options.maxConnections).toBe(3);
      expect(options.maxMessages).toBe(100);
    });

    it('respeita SMTP_MAX_CONNECTIONS', () => {
      process.env.SMTP_MAX_CONNECTIONS = '7';
      expect(getTransporter().options.maxConnections).toBe(7);
    });

    it('porta 465 liga TLS implícito; 587 não', () => {
      process.env.SMTP_PORT = '465';
      expect(getTransporter().options.secure).toBe(true);

      resetTransporter();
      process.env.SMTP_PORT = '587';
      expect(getTransporter().options.secure).toBe(false);
    });
  });

  describe('isSmtpConfigured', () => {
    it('exige host, usuário e senha — os três', () => {
      process.env.SMTP_HOST = 'smtp.exemplo.test';
      process.env.SMTP_USER = 'user@exemplo.test';
      delete process.env.SMTP_PASS;
      expect(isSmtpConfigured()).toBe(false);

      process.env.SMTP_PASS = 'senha';
      expect(isSmtpConfigured()).toBe(true);
    });
  });

  describe('sendEmail', () => {
    beforeEach(() => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    });

    it('sem SMTP configurado, não envia e diz por quê — sem lançar', async () => {
      // Falhar aqui com exceção derrubaria o webhook de pagamento, que é quem
      // chama isto depois de confirmar a compra.
      const resultado = await sendEmail({
        to: 'cliente@exemplo.test',
        subject: 'Assunto',
        html: '<p>Oi</p>',
        kind: 'order_confirmation',
      });

      expect(resultado).toMatchObject({ sent: false, reason: 'smtp_not_configured' });
    });
  });

  describe('classificação de kind', () => {
    it('marketing e transacional são conjuntos DISJUNTOS', () => {
      // A sobreposição seria silenciosa e cara: um kind nos dois receberia (ou
      // deixaria de receber) rodapé de descadastro por ordem de checagem, e
      // e-mail de marketing sem unsubscribe é o que derruba a reputação do
      // domínio inteiro.
      const intersecao = [...MARKETING_KINDS].filter((kind) => TRANSACTIONAL_KINDS.has(kind));
      expect(intersecao).toEqual([]);
    });

    it('confirmação de pedido é transacional; carrinho abandonado é marketing', () => {
      expect(TRANSACTIONAL_KINDS.has('order_confirmation')).toBe(true);
      expect(MARKETING_KINDS.has('abandoned_cart_1h')).toBe(true);
    });
  });

  describe('buildMarketingFooter', () => {
    beforeEach(() => {
      process.env.APP_URL = 'https://loja.test/';
    });

    it('usa o token do assinante quando existe', () => {
      const html = buildMarketingFooter({
        email: 'cliente@exemplo.test',
        unsubscribeToken: 'tok-123',
      });
      expect(html).toContain('https://loja.test/desinscrever?token=tok-123');
    });

    it('sem token, cai para a página que pede o e-mail de novo', () => {
      const html = buildMarketingFooter({ email: 'cliente+tag@exemplo.test' });
      // O e-mail vai ENCODADO: `+` cru na query string vira espaço, e o
      // descadastro passaria a procurar um endereço que não existe.
      expect(html).toContain('desinscrever?email=cliente%2Btag%40exemplo.test');
    });
  });

  describe('getAppUrl', () => {
    it('remove a barra final para não gerar URL com barra dupla', () => {
      process.env.APP_URL = 'https://loja.test///';
      expect(getAppUrl()).toBe('https://loja.test');
    });

    it('cai no localhost quando APP_URL não está definida', () => {
      delete process.env.APP_URL;
      expect(getAppUrl()).toBe('http://localhost:3000');
    });
  });
});
