import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/email-templates.js` — item P4.1.
//
// É o conteúdo de todo e-mail transacional e de marketing. Duas classes de
// defeito pagam esta suíte, e nenhuma delas é "o texto ficou feio":
//
//   1. INJEÇÃO DE HTML. Nome de cliente e nome de produto entram no corpo e
//      vêm, em última instância, de formulário. Sem escape, um nome com `<` e
//      `>` injeta markup no e-mail — e e-mail é lido em cliente que renderiza
//      HTML sem CSP nenhuma.
//   2. REGRA DE COPY C9/D5: personalização nominal NUNCA no assunto. É regra
//      declarada no topo do módulo, e regra que ninguém verifica é sugestão.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const templates = requireCjs('../email-templates.js');

const NOME_MALICIOSO = '<script>alert(1)</script>Ana';
const ITENS = [{ name: 'Kit "A"', quantity: 2, price: 49.9 }];

describe('email-templates', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.APP_URL = 'https://loja.test';
  });

  afterEach(() => {
    process.env = ambienteOriginal;
  });

  it('todos os templates devolvem { subject, html }', () => {
    const gerados = [
      templates.orderConfirmation({ orderId: 'ORD-1', customerName: 'Ana', items: ITENS }),
      templates.optInConfirmation({ confirmationToken: 'tok' }),
      templates.postPurchaseD3({ orderId: 'ORD-1', customerName: 'Ana', items: ITENS }),
      templates.postPurchaseD15({ customerName: 'Ana', category: 'Alfabetização' }),
      templates.postPurchaseD45({ customerName: 'Ana', category: 'Alfabetização' }),
      templates.abandonedCart({ items: ITENS }),
      templates.reactivation90({ customerName: 'Ana' }),
      templates.unsubscribeSuccess(),
    ];

    for (const { subject, html } of gerados) {
      expect(typeof subject).toBe('string');
      expect(subject.trim().length).toBeGreaterThan(0);
      expect(html).toContain('<!DOCTYPE html>');
    }
  });

  describe('escape de HTML', () => {
    it('nome do cliente é escapado no corpo', () => {
      const { html } = templates.orderConfirmation({
        orderId: 'ORD-1',
        customerName: NOME_MALICIOSO,
        items: ITENS,
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('nome de produto é escapado', () => {
      const { html } = templates.orderConfirmation({
        orderId: 'ORD-1',
        customerName: 'Ana',
        items: [{ name: '<img src=x onerror=1>', quantity: 1, price: 10 }],
      });

      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img');
    });

    it('aspas viram entidade — senão escapam de atributo HTML', () => {
      const { html } = templates.orderConfirmation({
        orderId: 'ORD-1',
        customerName: 'Ana "A" B',
        items: ITENS,
      });
      expect(html).toContain('&quot;');
    });

    it('o número do pedido também é escapado', () => {
      // Ele vem da query string em alguns fluxos.
      const { html } = templates.postPurchaseD3({
        orderId: '<b>ORD</b>',
        customerName: 'Ana',
        items: ITENS,
      });
      expect(html).not.toContain('<b>ORD</b>');
    });
  });

  describe('regra de copy C9/D5 — nome nunca no assunto', () => {
    const nomeRaro = 'Zorpaxina';

    it.each([
      [
        'orderConfirmation',
        () =>
          templates.orderConfirmation({ orderId: 'ORD-1', customerName: nomeRaro, items: ITENS }),
      ],
      [
        'postPurchaseD3',
        () => templates.postPurchaseD3({ orderId: 'ORD-1', customerName: nomeRaro, items: ITENS }),
      ],
      [
        'postPurchaseD15',
        () => templates.postPurchaseD15({ customerName: nomeRaro, category: 'X' }),
      ],
      [
        'postPurchaseD45',
        () => templates.postPurchaseD45({ customerName: nomeRaro, category: 'X' }),
      ],
      ['reactivation90', () => templates.reactivation90({ customerName: nomeRaro })],
    ])('%s não põe o nome no assunto', (_nome, gerar) => {
      const { subject, html } = gerar();
      expect(subject).not.toContain(nomeRaro);
      // Mas o corpo personaliza — é lá que a regra permite.
      expect(html).toContain(nomeRaro);
    });
  });

  describe('conteúdo', () => {
    it('confirmação de pedido lista os itens com preço em pt-BR', () => {
      const { html } = templates.orderConfirmation({
        orderId: 'ORD-1',
        customerName: 'Ana',
        items: [{ name: 'Kit', quantity: 2, price: 49.9 }],
        totalAmount: 99.8,
      });

      expect(html).toContain('R$ 49,90');
      expect(html).toContain('R$ 99,80');
    });

    it('opt-in aponta para o link de confirmação com o token', () => {
      const { html } = templates.optInConfirmation({ confirmationToken: 'tok-123' });
      expect(html).toContain('https://loja.test/confirmar-inscricao?token=tok-123');
    });

    it('reativação carrega o cupom e o percentual', () => {
      const { html } = templates.reactivation90({
        customerName: 'Ana',
        couponCode: 'VOLTEI20',
        discountPct: 20,
      });
      expect(html).toContain('VOLTEI20');
      expect(html).toContain('20');
    });

    it('carrinho abandonado muda o texto entre 1h e 24h', () => {
      const uma = templates.abandonedCart({ items: ITENS, step: '1h' });
      const vinteQuatro = templates.abandonedCart({ items: ITENS, step: '24h' });
      expect(uma.subject).not.toBe(vinteQuatro.subject);
    });

    it('lista vazia não quebra nem gera item fantasma', () => {
      const { html } = templates.abandonedCart({ items: [] });
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('campos ausentes nunca produzem "undefined" no ASSUNTO', () => {
      // É o defeito clássico de template, e no assunto ele é o mais visível:
      // a caixa de entrada mostra a palavra "undefined" antes de a pessoa
      // abrir o e-mail.
      const gerados = [
        templates.orderConfirmation({}),
        templates.postPurchaseD3({}),
        templates.postPurchaseD15({}),
        templates.postPurchaseD45({}),
        templates.reactivation90({}),
        templates.abandonedCart({}),
        templates.unsubscribeSuccess(),
      ];

      for (const { subject } of gerados) {
        expect(subject).not.toContain('undefined');
      }
    });

    it.each([
      ['postPurchaseD15', () => templates.postPurchaseD15({})],
      ['postPurchaseD45', () => templates.postPurchaseD45({})],
      ['reactivation90', () => templates.reactivation90({})],
      ['abandonedCart', () => templates.abandonedCart({})],
    ])('%s: corpo sem "undefined" mesmo com contexto vazio', (_nome, gerar) => {
      expect(gerar().html).not.toContain('undefined');
    });

    it('ACHADO REGISTRADO: orderConfirmation sem orderId gera link ?order=undefined', () => {
      // Comportamento ATUAL, travado aqui de propósito e NÃO corrigido: está
      // fora dos dois documentos que esta rodada executa.
      //
      // Na prática nenhum chamador omite `orderId` (webhook e verify-payment
      // sempre o passam), então é defeito latente, não bug ativo. Mas o
      // template não tem guarda, e o dia em que um chamador novo esquecer o
      // campo o comprador recebe um botão "Acessar meus downloads" que abre
      // uma página vazia — sem erro em lugar nenhum.
      //
      // Se for corrigido, este teste falha e a correção é deliberada, que é o
      // ponto de travá-lo.
      const { html } = templates.orderConfirmation({});
      expect(html).toContain('/downloads?order=undefined');
    });
  });
});
