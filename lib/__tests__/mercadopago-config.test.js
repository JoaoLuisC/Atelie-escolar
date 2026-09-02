import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/mercadopago-config.js` — item P4.1.
//
// A verificação de assinatura do webhook mora aqui: é o controle que separa
// "o Mercado Pago disse que foi pago" de "alguém disse que foi pago".
//
// ── O QUE ESTA SUÍTE ACRESCENTA ─────────────────────────────────────
// `handlers/__tests__/webhook-signature.test.js` já cobre o handler ponta a ponta
// (401 em assinatura inválida, ausência de bypass em test, 405 em GET). O que
// falta é a JANELA — a lógica de frescor, que é onde estão as decisões
// delicadas e nenhuma delas aparece pelo status code do handler:
//
//   • o HMAC vem ANTES do frescor (até a assinatura conferir, o `ts` é um
//     número escolhido pelo atacante);
//   • a janela é ASSIMÉTRICA: mais tolerante com o passado que com o futuro;
//   • a folga de futuro nunca pode ser maior que a do passado;
//   • `ts` em milissegundos é discriminado por ordem de grandeza — tratá-lo
//     como segundos daria uma idade de ~54 mil anos e recusaria uma
//     notificação legítima, travando a entrega de produto pago.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const {
  inspectWebhookSignature,
  validateWebhookSignature,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  MAX_WEBHOOK_TOLERANCE_SECONDS,
  DEFAULT_FUTURE_SKEW_SECONDS,
} = requireCjs('../mercadopago-config.js');

const SEGREDO = 'segredo-de-webhook-fixo-para-teste';
const PAYMENT_ID = 'MP-1';
const REQUEST_ID = 'req-1';

/** Requisição assinada de verdade, com `ts` controlado. */
function reqAssinada({
  tsSeconds = Math.floor(Date.now() / 1000),
  secret = SEGREDO,
  paymentId = PAYMENT_ID,
  requestId = REQUEST_ID,
} = {}) {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${tsSeconds};`;
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  return {
    headers: {
      'x-signature': `ts=${tsSeconds},v1=${hash}`,
      'x-request-id': requestId,
    },
    body: { type: 'payment', data: { id: paymentId } },
  };
}

describe('inspectWebhookSignature', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.WEBHOOK_SECRET = SEGREDO;
    delete process.env.WEBHOOK_TOLERANCE_SECONDS;
    delete process.env.WEBHOOK_FUTURE_SKEW_SECONDS;
  });

  afterEach(() => {
    process.env = ambienteOriginal;
  });

  it('assinatura correta e recente é aceita', () => {
    expect(inspectWebhookSignature(reqAssinada())).toMatchObject({ valid: true });
  });

  describe('rejeições estruturais', () => {
    it('sem headers', () => {
      expect(inspectWebhookSignature({ headers: {}, body: {} })).toMatchObject({
        valid: false,
        reason: 'missing_headers',
      });
    });

    it('assinatura sem ts ou sem v1', () => {
      expect(
        inspectWebhookSignature({
          headers: { 'x-signature': 'lixo', 'x-request-id': REQUEST_ID },
          body: { data: { id: PAYMENT_ID } },
        }),
      ).toMatchObject({ valid: false, reason: 'malformed_signature' });
    });

    it('sem payment id no corpo', () => {
      const req = reqAssinada();
      req.body = { type: 'payment' };
      expect(inspectWebhookSignature(req)).toMatchObject({ reason: 'malformed_signature' });
    });

    it('sem WEBHOOK_SECRET, FALHA FECHADA', () => {
      // Nunca cair no MERCADOPAGO_ACCESS_TOKEN como chave HMAC: é outro
      // segredo, e validar contra o errado é pior que não validar.
      delete process.env.WEBHOOK_SECRET;
      expect(inspectWebhookSignature(reqAssinada())).toMatchObject({
        valid: false,
        reason: 'missing_secret',
      });
    });

    it('hash assinado com outro segredo é recusado', () => {
      expect(inspectWebhookSignature(reqAssinada({ secret: 'outro-segredo' }))).toMatchObject({
        valid: false,
        reason: 'hash_mismatch',
      });
    });

    it('hash de tamanho diferente também é hash_mismatch, sem lançar', () => {
      // `crypto.timingSafeEqual` LANÇA com buffers de tamanhos diferentes: sem
      // a comparação de comprimento antes, um `v1` curto derrubaria o webhook
      // com exceção em vez de 401.
      const req = reqAssinada();
      req.headers['x-signature'] = `ts=${Math.floor(Date.now() / 1000)},v1=abc`;
      expect(inspectWebhookSignature(req)).toMatchObject({ reason: 'hash_mismatch' });
    });
  });

  describe('janela de frescor', () => {
    it('o HMAC é verificado ANTES do frescor', () => {
      // Um `ts` antiquíssimo COM assinatura errada precisa reprovar por
      // `hash_mismatch`, não por idade: decidir pela idade primeiro deixaria
      // qualquer um da internet escolher qual evento de segurança aparece no
      // nosso alerta.
      const antigo = Math.floor(Date.now() / 1000) - MAX_WEBHOOK_TOLERANCE_SECONDS * 10;
      const resultado = inspectWebhookSignature(
        reqAssinada({ tsSeconds: antigo, secret: 'outro-segredo' }),
      );
      expect(resultado.reason).toBe('hash_mismatch');
    });

    it('dentro da janela do passado é aceito', () => {
      const dentro =
        Math.floor(Date.now() / 1000) - Math.floor(DEFAULT_WEBHOOK_TOLERANCE_SECONDS / 2);
      expect(inspectWebhookSignature(reqAssinada({ tsSeconds: dentro }))).toMatchObject({
        valid: true,
      });
    });

    it('além da janela do passado é recusado', () => {
      const fora = Math.floor(Date.now() / 1000) - (DEFAULT_WEBHOOK_TOLERANCE_SECONDS + 60);
      expect(inspectWebhookSignature(reqAssinada({ tsSeconds: fora })).valid).toBe(false);
    });

    it('a janela é ASSIMÉTRICA: o futuro tolera menos que o passado', () => {
      // Notificação atrasada é normal (fila do provedor); notificação do
      // futuro é relógio errado ou manipulação.
      expect(DEFAULT_FUTURE_SKEW_SECONDS).toBeLessThan(DEFAULT_WEBHOOK_TOLERANCE_SECONDS);

      const futuroDemais = Math.floor(Date.now() / 1000) + DEFAULT_FUTURE_SKEW_SECONDS + 60;
      expect(inspectWebhookSignature(reqAssinada({ tsSeconds: futuroDemais })).valid).toBe(false);
    });

    it('a folga de futuro nunca supera a do passado, mesmo com env apertada', () => {
      // Apertar a tolerância para 30s com folga de futuro de 120s deixaria a
      // janela MAIS permissiva para frente do que para trás — o contrário
      // exato da assimetria pretendida.
      process.env.WEBHOOK_TOLERANCE_SECONDS = '30';
      process.env.WEBHOOK_FUTURE_SKEW_SECONDS = '120';

      const futuro = Math.floor(Date.now() / 1000) + 60;
      expect(inspectWebhookSignature(reqAssinada({ tsSeconds: futuro })).valid).toBe(false);
    });

    it('tolerância acima do teto é limitada, não obedecida', () => {
      process.env.WEBHOOK_TOLERANCE_SECONDS = String(MAX_WEBHOOK_TOLERANCE_SECONDS * 100);
      const foraDoTeto = Math.floor(Date.now() / 1000) - (MAX_WEBHOOK_TOLERANCE_SECONDS + 3600);
      expect(inspectWebhookSignature(reqAssinada({ tsSeconds: foraDoTeto })).valid).toBe(false);
    });

    it('env inválida cai no default em vez de virar NaN', () => {
      process.env.WEBHOOK_TOLERANCE_SECONDS = 'muitos';
      expect(inspectWebhookSignature(reqAssinada()).valid).toBe(true);
    });

    it('`ts` em MILISSEGUNDOS é reconhecido pela ordem de grandeza', () => {
      // Tratá-lo como segundos daria idade de ~54 mil anos e recusaria uma
      // notificação legítima — falha de DISPONIBILIDADE no fluxo que entrega o
      // produto pago, que é pior que a falha de segurança que ela imita.
      const req = reqAssinada({ tsSeconds: Date.now() });
      expect(inspectWebhookSignature(req)).toMatchObject({ valid: true });
    });
  });

  describe('validateWebhookSignature', () => {
    it('é o booleano do inspect — mesma decisão, sem o diagnóstico', () => {
      expect(validateWebhookSignature(reqAssinada())).toBe(true);
      expect(validateWebhookSignature(reqAssinada({ secret: 'outro' }))).toBe(false);
    });
  });
});
