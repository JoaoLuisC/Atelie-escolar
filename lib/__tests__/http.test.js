import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const {
  ERROR_CODES,
  CACHE_POLICIES,
  preflight,
  ok,
  fail,
  methodNotAllowed,
  guardMethod,
  setCachePolicy,
} = requireCjs('../http.js');

// ════════════════════════════════════════════════════════════════════
// Regra A1/A2/A4. Este módulo é a porta única de resposta da API — se ele
// errar a forma, os 44 handlers erram junto. Os testes abaixo afirmam o
// CONTRATO (forma do envelope, política de `details`, header `Allow`), não a
// redação das mensagens.
// ════════════════════════════════════════════════════════════════════

function createRes() {
  const res = {
    statusCode: 0,
    body: undefined,
    headers: {},
    headersSent: false,
    setHeader: vi.fn((k, v) => {
      res.headers[k] = v;
    }),
    status: vi.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload) => {
      res.body = payload;
      return res;
    }),
    end: vi.fn(() => res),
  };
  return res;
}

describe('preflight', () => {
  it('responde 204 sem corpo', () => {
    const res = createRes();
    preflight(res);
    expect(res.statusCode).toBe(204);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('ok', () => {
  it('espalha o payload ao lado de success: true', () => {
    const res = createRes();
    ok(res, { products: [1, 2], total: 2 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, products: [1, 2], total: 2 });
  });

  it('aceita status alternativo', () => {
    const res = createRes();
    ok(res, { id: 'x' }, { status: 201 });
    expect(res.statusCode).toBe(201);
  });

  it('sem payload ainda carrega o flag', () => {
    const res = createRes();
    ok(res);
    expect(res.body).toEqual({ success: true });
  });
});

describe('fail', () => {
  it('aninha o erro com code e message', () => {
    const res = createRes();
    fail(res, { status: 422, code: ERROR_CODES.COUPON_EXPIRED, message: 'Este cupom expirou.' });
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'COUPON_EXPIRED', message: 'Este cupom expirou.' },
    });
  });

  it('deriva o code do status quando ele não é informado', () => {
    for (const [status, code] of [
      [400, 'VALIDATION_FAILED'],
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [405, 'METHOD_NOT_ALLOWED'],
      [429, 'RATE_LIMITED'],
      [500, 'INTERNAL_ERROR'],
      [502, 'INTERNAL_ERROR'],
    ]) {
      const res = createRes();
      fail(res, { status });
      expect(res.body.error.code).toBe(code);
    }
  });

  it('recusa code fora do formato SCREAMING_SNAKE e cai no derivado', () => {
    // Sem isto, um `code: 'not_found'` (a grafia antiga) entraria no contrato
    // e conviveria com `NOT_FOUND` — duas grafias para a mesma condição, que é
    // exatamente o que a regra A2 existe para impedir.
    const res = createRes();
    fail(res, { status: 404, code: 'not_found' });
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('nunca deixa a mensagem virar "undefined" na tela', () => {
    const res = createRes();
    fail(res, { status: 404 });
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.message.length).toBeGreaterThan(0);
    expect(res.body.error.message).not.toMatch(/undefined/);
  });

  it('status fora de 4xx/5xx cai em 500 em vez de emitir 2xx com erro', () => {
    for (const status of [200, 302, 999, null, undefined, NaN]) {
      const res = createRes();
      fail(res, { status, message: 'x' });
      expect(res.statusCode).toBe(500);
    }
  });

  describe('details', () => {
    const originalEnv = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('emite details fora de produção', () => {
      process.env.NODE_ENV = 'development';
      const res = createRes();
      fail(res, { status: 400, details: [{ path: 'email', message: 'obrigatório' }] });
      expect(res.body.error.details).toHaveLength(1);
    });

    it('NUNCA emite details em produção', () => {
      // Nomear campo interno e ecoar o valor recebido ajuda quem sonda a API,
      // não o cliente — que já recebeu a mensagem em português.
      process.env.NODE_ENV = 'production';
      const res = createRes();
      fail(res, { status: 400, details: [{ path: 'customer.cpf', message: 'inválido' }] });
      expect(res.body.error.details).toBeUndefined();
    });
  });
});

describe('methodNotAllowed', () => {
  it('emite 405 com o header Allow', () => {
    const res = createRes();
    methodNotAllowed(res, ['GET', 'OPTIONS']);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, OPTIONS');
    expect(res.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('não quebra quando a resposta já foi encerrada', () => {
    const res = createRes();
    res.setHeader = vi.fn(() => {
      throw new Error('headers already sent');
    });
    expect(() => methodNotAllowed(res, ['GET'])).not.toThrow();
    expect(res.statusCode).toBe(405);
  });
});

describe('guardMethod', () => {
  it('responde o preflight e sinaliza para o handler retornar', () => {
    const res = createRes();
    expect(guardMethod({ method: 'OPTIONS' }, res, ['GET'])).toBe(true);
    expect(res.statusCode).toBe(204);
  });

  it('recusa método fora da lista, incluindo OPTIONS no Allow', () => {
    const res = createRes();
    expect(guardMethod({ method: 'DELETE' }, res, ['GET', 'POST'])).toBe(true);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST, OPTIONS');
  });

  it('deixa passar o método permitido sem tocar na resposta', () => {
    const res = createRes();
    expect(guardMethod({ method: 'GET' }, res, ['GET'])).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('setCachePolicy', () => {
  it('aplica a política nomeada', () => {
    const res = createRes();
    setCachePolicy(res, 'catalog');
    expect(res.headers['Cache-Control']).toBe(CACHE_POLICIES.catalog);
  });

  it('política desconhecida não emite header nenhum', () => {
    // Errar o nome não pode virar "sem cache" silencioso com header errado.
    const res = createRes();
    setCachePolicy(res, 'inexistente');
    expect(res.headers['Cache-Control']).toBeUndefined();
  });

  it('a política de entrega de arquivo é no-store', () => {
    expect(CACHE_POLICIES.sensitive).toMatch(/no-store/);
  });
});

describe('ERROR_CODES', () => {
  it('é congelado — o catálogo não muda em runtime', () => {
    expect(Object.isFrozen(ERROR_CODES)).toBe(true);
  });
});
