import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHash } from 'node:crypto';

import { RATE_LIMITS, enforceRateLimit } from '../rate-limit.js';

// Mesma derivação de sub-chave do lib/rate-limit.js: o teste precisa afirmar
// que polling do MESMO pedido cai na MESMA chave, e que pedidos diferentes
// caem em chaves diferentes — sem depender do order_code aparecer em claro.
function scopeHash(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 24);
}

// NOTA sobre a estratégia de mock: lib/rate-limit.js é CommonJS e resolve
// lib/supabase.js / lib/security-logger.js por `require`, que o vi.mock do
// Vitest não intercepta. Em vez de reescrever o módulo para ser injetável só
// por causa do teste, mockamos o `fetch` global — a fronteira real de I/O.
// Efeito colateral desejável: o teste passa pelo lib/supabase.js DE VERDADE,
// então também cobre a URL da RPC, o uso da chave de service role e o corpo
// enviado ao PostgREST.

const SERVICE_KEY = 'service-role-stub-key';
const RPC_URL_FRAGMENT = '/rest/v1/rpc/rate_limit_hit';

function jsonResponse({ ok = true, status = 200, body = [] } = {}) {
  return {
    ok,
    status,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    headersSent: false,
    setHeader: vi.fn((name, value) => { res.headers[String(name).toLowerCase()] = value; }),
    status: vi.fn((code) => { res.statusCode = code; return res; }),
    json: vi.fn((payload) => { res.body = payload; return res; }),
    end: vi.fn(() => res),
  };
  return res;
}

function createReq(headers = {}, extra = {}) {
  return { headers, ...extra };
}

function rpcRow({ allowed = true, hitCount = 1, remaining = 4, limit = 5, retryAfter = 60 } = {}) {
  return [{
    allowed,
    hit_count: hitCount,
    remaining,
    limit_value: limit,
    reset_at: new Date(Date.now() + retryAfter * 1000).toISOString(),
    retry_after_seconds: retryAfter,
  }];
}

describe('enforceRateLimit', () => {
  let originalEnv;
  let originalFetch;
  let warnSpy;
  // Resposta que o "PostgREST" devolve para a RPC do rate limit.
  let rpcResult;
  // Sobrescrita por balde: verify-payment agora faz DUAS chamadas (o balde
  // por pedido e o teto por IP), e cada cenário precisa controlá-las em
  // separado. Chave = p_bucket; valor = mesmo formato de `rpcResult`.
  let rpcResultByBucket;

  beforeEach(() => {
    originalEnv = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SECURITY_ALERT_WEBHOOK_URL: process.env.SECURITY_ALERT_WEBHOOK_URL,
      RATE_LIMIT_ALERT_INTERVAL_MS: process.env.RATE_LIMIT_ALERT_INTERVAL_MS,
    };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-stub-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    delete process.env.SECURITY_ALERT_WEBHOOK_URL;
    // Desliga o anti-amplificação de alertas: o throttle é estado de módulo e
    // esconderia os eventos dos casos seguintes.
    process.env.RATE_LIMIT_ALERT_INTERVAL_MS = '0';

    rpcResult = { kind: 'resolve', value: rpcRow() };
    rpcResultByBucket = {};

    originalFetch = global.fetch;
    global.fetch = vi.fn(async (url, options) => {
      if (String(url).includes(RPC_URL_FRAGMENT)) {
        let bucket = '';
        try {
          bucket = JSON.parse(options.body).p_bucket;
        } catch {
          bucket = '';
        }
        const result = rpcResultByBucket[bucket] || rpcResult;
        if (result.kind === 'reject') throw result.value;
        if (result.kind === 'http') return jsonResponse(result.value);
        return jsonResponse({ body: result.value });
      }
      // Insert de security_events (best-effort do lib/security-logger.js).
      return jsonResponse({ body: [] });
    });

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function rpcCalls() {
    return global.fetch.mock.calls.filter((call) => String(call[0]).includes(RPC_URL_FRAGMENT));
  }

  function lastRpcBody() {
    const call = rpcCalls().at(-1);
    return call ? JSON.parse(call[1].body) : null;
  }

  function loggedEvents() {
    return warnSpy.mock.calls
      .map(([first]) => {
        try {
          return JSON.parse(String(first));
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.event);
  }

  describe('contagem dentro do limite', () => {
    it('libera a requisição e expõe os headers RateLimit-*', async () => {
      rpcResult = { kind: 'resolve', value: rpcRow({ allowed: true, remaining: 4, retryAfter: 600 }) };
      const res = createMockRes();

      const gate = await enforceRateLimit(createReq({ 'x-real-ip': '203.0.113.9' }), res, RATE_LIMITS.adminLogin);

      expect(gate.blocked).toBe(false);
      expect(gate.failOpen).toBe(false);
      expect(gate.remaining).toBe(4);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(res.headers['ratelimit-limit']).toBe('5');
      expect(res.headers['ratelimit-remaining']).toBe('4');
      expect(res.headers['ratelimit-reset']).toBe('600');
      expect(res.headers['retry-after']).toBeUndefined();
    });

    it('chama a RPC certa, com service role e os parâmetros do preset', async () => {
      const res = createMockRes();

      await enforceRateLimit(createReq({ 'x-real-ip': '203.0.113.9' }), res, RATE_LIMITS.validateCoupon);

      expect(rpcCalls()).toHaveLength(1);
      const [url, options] = rpcCalls()[0];
      expect(String(url)).toBe(`https://stub.supabase.co${RPC_URL_FRAGMENT}`);
      expect(options.method).toBe('POST');
      // Sem a chave de service role a função (revogada de anon) responderia 403.
      expect(options.headers.apikey).toBe(SERVICE_KEY);
      expect(options.headers.Authorization).toBe(`Bearer ${SERVICE_KEY}`);
      expect(JSON.parse(options.body)).toEqual({
        p_bucket: 'validate-coupon',
        p_identifier: '203.0.113.9',
        p_limit: 20,
        p_window_seconds: 60,
      });
    });

    it('uma chamada do handler = um único incremento', async () => {
      await enforceRateLimit(createReq({ 'x-real-ip': '203.0.113.9' }), createMockRes(), RATE_LIMITS.subscribe);
      expect(rpcCalls()).toHaveLength(1);
    });

    it('aceita o objeto solto (sem array) que alguns proxies devolvem', async () => {
      rpcResult = { kind: 'resolve', value: rpcRow({ remaining: 7 })[0] };

      const gate = await enforceRateLimit(
        createReq({ 'x-real-ip': '203.0.113.9' }),
        createMockRes(),
        RATE_LIMITS.verifyPayment,
      );

      expect(gate.failOpen).toBe(false);
      expect(gate.remaining).toBe(7);
    });

    it('mantém os limites herdados do Express de dev (paridade dev/prod)', () => {
      expect(RATE_LIMITS.adminLogin).toMatchObject({ bucket: 'admin-login', limit: 5, windowSeconds: 600 });
      expect(RATE_LIMITS.validateCoupon).toMatchObject({ bucket: 'validate-coupon', limit: 20, windowSeconds: 60 });
      expect(RATE_LIMITS.subscribe).toMatchObject({ bucket: 'subscribe', limit: 5, windowSeconds: 60 });
      expect(RATE_LIMITS.createPayment).toMatchObject({ bucket: 'create-payment', limit: 20, windowSeconds: 60 });
    });

    it('dimensiona verify-payment para o polling real (4s × ~10min × N compradores)', () => {
      // CheckoutPage: 150 tentativas × 4s ≈ 10 min. DownloadsPage: +12 a cada
      // 10s. Mais recargas de página e cliques em "Atualizar" ≈ 170 req por
      // PEDIDO numa janela de 10 min. O balde por pedido precisa caber isso
      // com folga; o teto por IP precisa caber N compradores num CGNAT.
      const { verifyPayment } = RATE_LIMITS;
      expect(verifyPayment.scope).toBe('orderCode');
      expect(verifyPayment.windowSeconds).toBe(600);

      const pollsPorPedidoPorJanela = (600 / 4) + (600 / 10);
      expect(verifyPayment.limit).toBeGreaterThan(pollsPorPedidoPorJanela * 2);

      // O teto por IP conta PEDIDOS distintos, não requisições: precisa caber
      // uma escola inteira comprando junto, e ainda assim ser mais apertado
      // que as 600 tentativas/10min que o limite plano de 60/min permitia.
      expect(verifyPayment.distinctScope.bucket).toBe('verify-payment-scan');
      expect(verifyPayment.distinctScope.limit).toBeGreaterThanOrEqual(20);
      expect(verifyPayment.distinctScope.limit).toBeLessThan(60 * 10);
      expect(verifyPayment.distinctScope.windowSeconds).toBe(600);
    });
  });

  describe('estouro do limite', () => {
    it('responde 429 com o envelope padrão, Retry-After e blocked=true', async () => {
      rpcResult = {
        kind: 'resolve',
        value: rpcRow({ allowed: false, hitCount: 6, remaining: 0, retryAfter: 420 }),
      };
      const res = createMockRes();

      const gate = await enforceRateLimit(createReq({ 'x-real-ip': '203.0.113.9' }), res, RATE_LIMITS.adminLogin);

      expect(gate.blocked).toBe(true);
      expect(gate.failOpen).toBe(false);
      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({
        success: false,
        error: 'Muitas tentativas. Aguarde 10 minutos e tente novamente.',
        code: 'rate_limited',
        retryAfterSeconds: 420,
      });
      expect(res.headers['retry-after']).toBe('420');
      expect(res.headers['ratelimit-remaining']).toBe('0');
    });

    it('registra rate_limit_exceeded com bucket e IP (sem PII do corpo)', async () => {
      rpcResult = { kind: 'resolve', value: rpcRow({ allowed: false, hitCount: 21, remaining: 0 }) };

      await enforceRateLimit(
        createReq({ 'x-real-ip': '198.51.100.7', 'user-agent': 'curl/8' }),
        createMockRes(),
        RATE_LIMITS.validateCoupon,
      );

      const events = loggedEvents().filter((entry) => entry.event === 'rate_limit_exceeded');
      expect(events).toHaveLength(1);
      expect(events[0].ip).toBe('198.51.100.7');
      expect(events[0].properties).toMatchObject({ bucket: 'validate-coupon', limit: 20, hitCount: 21 });
    });
  });

  describe('fail-open em falha de infraestrutura', () => {
    it('libera quando a RPC rejeita (rede caída) e alerta', async () => {
      rpcResult = { kind: 'reject', value: new Error('ECONNRESET') };
      const res = createMockRes();

      const gate = await enforceRateLimit(createReq({ 'x-real-ip': '203.0.113.9' }), res, RATE_LIMITS.adminLogin);

      expect(gate.blocked).toBe(false);
      expect(gate.failOpen).toBe(true);
      expect(gate.reason).toBe('rpc_failed');
      expect(res.status).not.toHaveBeenCalled();
      expect(loggedEvents().some((entry) => entry.event === 'rate_limit_unavailable')).toBe(true);
    });

    it('libera quando o PostgREST devolve erro HTTP (ex.: função ausente)', async () => {
      rpcResult = { kind: 'http', value: { ok: false, status: 404, body: { message: 'function does not exist' } } };

      const gate = await enforceRateLimit(
        createReq({ 'x-real-ip': '203.0.113.9' }),
        createMockRes(),
        RATE_LIMITS.adminLogin,
      );

      expect(gate.blocked).toBe(false);
      expect(gate.failOpen).toBe(true);
    });

    it('libera quando o Supabase não está configurado, sem chamar a RPC', async () => {
      delete process.env.SUPABASE_URL;
      const res = createMockRes();

      const gate = await enforceRateLimit(createReq({ 'x-real-ip': '203.0.113.9' }), res, RATE_LIMITS.verifyPayment);

      expect(gate.blocked).toBe(false);
      expect(gate.failOpen).toBe(true);
      expect(rpcCalls()).toHaveLength(0);
      expect(res.status).not.toHaveBeenCalled();
    });

    it.each([
      ['array vazio', []],
      ['null', null],
      ['objeto sem allowed', { hit_count: 3 }],
      ['allowed não booleano', [{ allowed: 'no' }]],
    ])('libera quando a resposta da RPC vem em formato inesperado: %s', async (_label, body) => {
      rpcResult = { kind: 'resolve', value: body };
      const res = createMockRes();

      const gate = await enforceRateLimit(createReq({ 'x-real-ip': '203.0.113.9' }), res, RATE_LIMITS.adminLogin);

      // Formato estranho NUNCA vira bloqueio: um parser confuso não pode
      // derrubar o checkout nem trancar o admin.
      expect(gate.blocked).toBe(false);
      expect(gate.failOpen).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('não deixa uma falha do próprio logger derrubar o handler protegido', async () => {
      rpcResult = { kind: 'reject', value: new Error('down') };
      warnSpy.mockImplementation(() => { throw new Error('logger quebrado'); });

      const gate = await enforceRateLimit(
        createReq({ 'x-real-ip': '203.0.113.9' }),
        createMockRes(),
        RATE_LIMITS.adminLogin,
      );

      expect(gate.blocked).toBe(false);
      expect(gate.failOpen).toBe(true);
    });
  });

  describe('derivação do identificador', () => {
    async function identifierFor(req) {
      await enforceRateLimit(req, createMockRes(), RATE_LIMITS.validateCoupon);
      return lastRpcBody().p_identifier;
    }

    it('usa req.ip quando o Express já resolveu (trust proxy)', async () => {
      const identifier = await identifierFor(
        createReq({ 'x-forwarded-for': '1.2.3.4' }, { ip: '203.0.113.10' }),
      );
      expect(identifier).toBe('203.0.113.10');
    });

    it('usa o header ancorado pela borda em vez do X-Forwarded-For cru', async () => {
      const identifier = await identifierFor(
        createReq({ 'x-real-ip': '203.0.113.11', 'x-forwarded-for': '9.9.9.9, 203.0.113.11' }),
      );
      expect(identifier).toBe('203.0.113.11');
    });

    it('ignora o IP forjado no início da cadeia X-Forwarded-For', async () => {
      // Sem header ancorado vale o ÚLTIMO salto (o proxy mais próximo). Usar o
      // primeiro daria ao atacante um balde novo por requisição.
      const identifier = await identifierFor(
        createReq({ 'x-forwarded-for': '66.66.66.66, 198.51.100.20' }),
      );
      expect(identifier).toBe('198.51.100.20');
    });

    it('cai em socket.remoteAddress e, sem nada, no balde "unknown"', async () => {
      expect(await identifierFor(createReq({}, { socket: { remoteAddress: '203.0.113.12' } })))
        .toBe('203.0.113.12');
      expect(await identifierFor(createReq({}))).toBe('unknown');
    });

    it('normaliza (trim + lowercase) e limita o tamanho da chave', async () => {
      expect(await identifierFor(createReq({ 'x-real-ip': '  2001:DB8::AB  ' }))).toBe('2001:db8::ab');
      expect(await identifierFor(createReq({ 'x-real-ip': 'a'.repeat(500) }))).toHaveLength(200);
    });

    it('aceita identificador explícito no lugar do IP', async () => {
      await enforceRateLimit(
        createReq({ 'x-real-ip': '203.0.113.9' }),
        createMockRes(),
        { ...RATE_LIMITS.adminLogin, identifier: 'session-abc' },
      );
      expect(lastRpcBody().p_identifier).toBe('session-abc');
    });

    it('mantém baldes separados por endpoint para o mesmo IP', async () => {
      const req = createReq({ 'x-real-ip': '203.0.113.9' });
      await enforceRateLimit(req, createMockRes(), RATE_LIMITS.adminLogin);
      await enforceRateLimit(req, createMockRes(), RATE_LIMITS.adminLoginSecondFactor);

      const buckets = rpcCalls().map((call) => JSON.parse(call[1].body).p_bucket);
      expect(buckets).toEqual(['admin-login', 'admin-login-2fa']);
    });
  });

  // ── Regressão de disponibilidade: o polling do checkout ────────────
  // /api/verify-payment é consultado em polling (4s no CheckoutPage, 10s no
  // DownloadsPage). Um balde plano por IP fazia 4 compradores num CGNAT
  // somarem o teto e o quinto poll levava 429. O escopo por order_code separa
  // "consultar MUITO o mesmo pedido" (legítimo) de "tentar MUITOS pedidos"
  // (enumeração) — e é só o segundo que consome o teto por IP.
  describe('verify-payment: escopo por order_code + teto de varredura por IP', () => {
    const IP = '203.0.113.44';

    function verifyReq(orderId, headers = {}) {
      return createReq({ 'x-real-ip': IP, ...headers }, { method: 'POST', body: { orderId, email: 'a@b.com' } });
    }

    function bodiesByBucket() {
      const map = {};
      for (const call of rpcCalls()) {
        const body = JSON.parse(call[1].body);
        (map[body.p_bucket] ||= []).push(body);
      }
      return map;
    }

    it('usa (IP + hash do order_code) como chave, nunca o order_code em claro', async () => {
      await enforceRateLimit(verifyReq('ORD-CAP-128BITS'), createMockRes(), RATE_LIMITS.verifyPayment);

      const [primary] = bodiesByBucket()['verify-payment'];
      expect(primary.p_identifier).toBe(`${IP}|${scopeHash('ORD-CAP-128BITS')}`);
      // O order_code é uma capability (dá PII + tokens de download): não pode
      // ficar guardado em claro na tabela do rate limit por 24h.
      expect(primary.p_identifier).not.toContain('ORD-CAP-128BITS');
    });

    it('lê o order_code também do GET (req.query), que o handler mantém por compatibilidade', async () => {
      await enforceRateLimit(
        createReq({ 'x-real-ip': IP }, { method: 'GET', query: { orderId: 'ORD-GET' } }),
        createMockRes(),
        RATE_LIMITS.verifyPayment,
      );

      expect(bodiesByBucket()['verify-payment'][0].p_identifier).toBe(`${IP}|${scopeHash('ORD-GET')}`);
    });

    it('polling do MESMO pedido não consome o teto por IP', async () => {
      // hit_count > 1 = par (IP, pedido) já visto nesta janela: é polling,
      // não um pedido novo. O balde de varredura não pode ser tocado.
      rpcResult = { kind: 'resolve', value: rpcRow({ allowed: true, hitCount: 37, remaining: 563 }) };

      const gate = await enforceRateLimit(verifyReq('ORD-A'), createMockRes(), RATE_LIMITS.verifyPayment);

      expect(gate.blocked).toBe(false);
      expect(Object.keys(bodiesByBucket())).toEqual(['verify-payment']);
    });

    it('só o PRIMEIRO toque em cada pedido novo cobra um ponto do teto por IP', async () => {
      rpcResult = { kind: 'resolve', value: rpcRow({ allowed: true, hitCount: 1, remaining: 599 }) };

      await enforceRateLimit(verifyReq('ORD-A'), createMockRes(), RATE_LIMITS.verifyPayment);

      const buckets = bodiesByBucket();
      expect(buckets['verify-payment']).toHaveLength(1);
      // O teto por IP é contado com o IP CRU (sem escopo): é ele que mede
      // quantos order_codes DISTINTOS aquela conexão tentou.
      expect(buckets['verify-payment-scan']).toHaveLength(1);
      expect(buckets['verify-payment-scan'][0].p_identifier).toBe(IP);
      expect(buckets['verify-payment-scan'][0].p_limit).toBe(RATE_LIMITS.verifyPayment.distinctScope.limit);
    });

    it('compradores diferentes no mesmo IP não dividem o orçamento de polling', async () => {
      rpcResult = { kind: 'resolve', value: rpcRow({ allowed: true, hitCount: 90, remaining: 510 }) };

      await enforceRateLimit(verifyReq('ORD-PROF-1'), createMockRes(), RATE_LIMITS.verifyPayment);
      await enforceRateLimit(verifyReq('ORD-PROF-2'), createMockRes(), RATE_LIMITS.verifyPayment);

      const identifiers = bodiesByBucket()['verify-payment'].map((body) => body.p_identifier);
      expect(new Set(identifiers).size).toBe(2);
      // Nenhum dos dois tocou o balde compartilhado: 90 polls do professor 1
      // não aproximam o professor 2 do 429. Era exatamente essa a regressão.
      expect(bodiesByBucket()['verify-payment-scan']).toBeUndefined();
    });

    it('corta a varredura: teto por IP estourado devolve 429 mesmo com o balde do pedido liberado', async () => {
      rpcResultByBucket['verify-payment'] = {
        kind: 'resolve',
        value: rpcRow({ allowed: true, hitCount: 1, remaining: 599 }),
      };
      rpcResultByBucket['verify-payment-scan'] = {
        kind: 'resolve',
        value: rpcRow({ allowed: false, hitCount: 41, remaining: 0, retryAfter: 300 }),
      };
      const res = createMockRes();

      const gate = await enforceRateLimit(verifyReq('ORD-ENUM-999'), res, RATE_LIMITS.verifyPayment);

      expect(gate.blocked).toBe(true);
      expect(gate.bucket).toBe('verify-payment-scan');
      expect(res.statusCode).toBe(429);
      expect(res.body).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 300 });
      expect(res.headers['retry-after']).toBe('300');

      // Evento de alta relevância: estouro deste balde é sinal de enumeração
      // quase sem falso positivo (polling honesto nunca chega aqui).
      const events = loggedEvents().filter((entry) => entry.event === 'rate_limit_exceeded');
      expect(events).toHaveLength(1);
      expect(events[0].properties).toMatchObject({ bucket: 'verify-payment-scan', limit: 40 });
      expect(events[0].ip).toBe(IP);
    });

    it('o balde do pedido ainda corta abuso concentrado num único order_code', async () => {
      rpcResult = { kind: 'resolve', value: rpcRow({ allowed: false, hitCount: 601, remaining: 0, retryAfter: 120 }) };
      const res = createMockRes();

      const gate = await enforceRateLimit(verifyReq('ORD-A'), res, RATE_LIMITS.verifyPayment);

      expect(gate.blocked).toBe(true);
      expect(gate.bucket).toBe('verify-payment');
      expect(res.statusCode).toBe(429);
      expect(res.body.retryAfterSeconds).toBe(120);
      // Bloqueado no primário: não faz sentido gastar uma RPC no teto por IP.
      expect(bodiesByBucket()['verify-payment-scan']).toBeUndefined();
    });

    it('requisição sem orderId cai numa sub-chave fixa e continua contada contra o IP', async () => {
      await enforceRateLimit(
        createReq({ 'x-real-ip': IP }, { method: 'POST', body: {} }),
        createMockRes(),
        RATE_LIMITS.verifyPayment,
      );

      const buckets = bodiesByBucket();
      expect(buckets['verify-payment'][0].p_identifier).toBe(`${IP}|sem-escopo`);
      expect(buckets['verify-payment-scan']).toHaveLength(1);
    });

    it('falha do teto por IP é fail-open, com evento — nunca 429 por infra', async () => {
      rpcResultByBucket['verify-payment'] = {
        kind: 'resolve',
        value: rpcRow({ allowed: true, hitCount: 1, remaining: 599 }),
      };
      rpcResultByBucket['verify-payment-scan'] = { kind: 'reject', value: new Error('ECONNRESET') };
      const res = createMockRes();

      const gate = await enforceRateLimit(verifyReq('ORD-A'), res, RATE_LIMITS.verifyPayment);

      expect(gate.blocked).toBe(false);
      expect(res.status).not.toHaveBeenCalled();
      const events = loggedEvents().filter((entry) => entry.event === 'rate_limit_unavailable');
      expect(events.some((entry) => entry.properties?.bucket === 'verify-payment-scan')).toBe(true);
    });

    it('escopo não vaza para outros endpoints: sem `scope`, a chave continua sendo só o IP', async () => {
      await enforceRateLimit(verifyReq('ORD-A'), createMockRes(), RATE_LIMITS.validateCoupon);
      expect(lastRpcBody().p_identifier).toBe(IP);
    });
  });

  // ── /api/auth/customer/login ──────────────────────────────────────
  // Mesma forma de dois baldes do verify-payment, aplicada ao problema
  // oposto: aqui o valor do escopo é o E-MAIL, escolhido pelo cliente. Isso
  // só é seguro por causa do teto por IP, que cobra justamente a TROCA de
  // e-mail — sem ele, "5 por conta" viraria "5 por conta inventada", que é
  // ilimitado. Estes testes travam as duas metades juntas.
  describe('customer-login: escopo por e-mail + teto de varredura por IP', () => {
    const IP = '198.51.100.20';

    function loginReq(email) {
      return createReq({ 'x-real-ip': IP }, { method: 'POST', body: { email, password: 'x' } });
    }

    function bucketsOf() {
      const map = {};
      for (const call of rpcCalls()) {
        const body = JSON.parse(call[1].body);
        (map[body.p_bucket] ||= []).push(body);
      }
      return map;
    }

    it('usa (IP + hash do e-mail) como chave, nunca o e-mail em claro', async () => {
      await enforceRateLimit(loginReq('professora@escola.com'), createMockRes(), RATE_LIMITS.customerLogin);

      const [primary] = bucketsOf()['customer-login'];
      expect(primary.p_identifier).toBe(`${IP}|${scopeHash('professora@escola.com')}`);
      // rate_limit_hit é tabela operacional que sobrevive 24h à requisição:
      // gravar e-mail de cliente ali seria transformar o contador de
      // segurança em cadastro de PII.
      expect(primary.p_identifier).not.toContain('professora@escola.com');
    });

    it('variar a CAIXA do e-mail não ganha balde novo', async () => {
      // Sem o lowercase no resolver, `Ana@X.com` e `ana@x.com` seriam chaves
      // distintas e as 5 tentativas por conta virariam 5 por GRAFIA da conta
      // — força bruta de graça, só alternando maiúsculas.
      await enforceRateLimit(loginReq('Ana@Escola.COM'), createMockRes(), RATE_LIMITS.customerLogin);
      await enforceRateLimit(loginReq('  ana@escola.com  '), createMockRes(), RATE_LIMITS.customerLogin);

      const identifiers = bucketsOf()['customer-login'].map((body) => body.p_identifier);
      expect(new Set(identifiers).size).toBe(1);
      expect(identifiers[0]).toBe(`${IP}|${scopeHash('ana@escola.com')}`);
    });

    it('duas pessoas no mesmo IP não dividem o orçamento de tentativas', async () => {
      // O cenário que um teto por IP puro quebrava: quatro professoras na
      // mesma escola somavam 5 tentativas e a quinta não conseguia nem tentar.
      rpcResult = { kind: 'resolve', value: rpcRow({ allowed: true, hitCount: 3, remaining: 2 }) };

      await enforceRateLimit(loginReq('a@escola.com'), createMockRes(), RATE_LIMITS.customerLogin);
      await enforceRateLimit(loginReq('b@escola.com'), createMockRes(), RATE_LIMITS.customerLogin);

      const identifiers = bucketsOf()['customer-login'].map((body) => body.p_identifier);
      expect(new Set(identifiers).size).toBe(2);
      // hit_count > 1 nos dois: nenhum e-mail é inédito, então o teto por IP
      // não é tocado — errar a própria senha não conta como varredura.
      expect(bucketsOf()['customer-login-scan']).toBeUndefined();
    });

    it('corta credential stuffing: cada e-mail INÉDITO cobra um ponto do teto por IP', async () => {
      rpcResultByBucket['customer-login'] = {
        kind: 'resolve',
        value: rpcRow({ allowed: true, hitCount: 1, remaining: 4 }),
      };
      rpcResultByBucket['customer-login-scan'] = {
        kind: 'resolve',
        value: rpcRow({ allowed: false, hitCount: 21, remaining: 0, retryAfter: 420 }),
      };
      const res = createMockRes();

      const gate = await enforceRateLimit(loginReq('vitima-21@escola.com'), res, RATE_LIMITS.customerLogin);

      // Stuffing não repete conta — ele varre MUITAS contas com uma senha
      // vazada cada, então o balde primário (por conta) nunca estoura e só
      // este segundo o detecta.
      expect(gate.blocked).toBe(true);
      expect(gate.bucket).toBe('customer-login-scan');
      expect(res.statusCode).toBe(429);
      expect(bucketsOf()['customer-login-scan'][0].p_identifier).toBe(IP);

      const events = loggedEvents().filter((entry) => entry.event === 'rate_limit_exceeded');
      expect(events[0].properties).toMatchObject({ bucket: 'customer-login-scan', limit: 20 });
    });

    it('o balde por conta ainda corta força bruta concentrada num único e-mail', async () => {
      rpcResult = { kind: 'resolve', value: rpcRow({ allowed: false, hitCount: 6, remaining: 0, retryAfter: 600 }) };
      const res = createMockRes();

      const gate = await enforceRateLimit(loginReq('alvo@escola.com'), res, RATE_LIMITS.customerLogin);

      expect(gate.blocked).toBe(true);
      expect(gate.bucket).toBe('customer-login');
      expect(res.statusCode).toBe(429);
      expect(res.body).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 600 });
      expect(bucketsOf()['customer-login-scan']).toBeUndefined();
    });

    it('corpo sem e-mail cai na sub-chave fixa e continua contado contra o IP', async () => {
      await enforceRateLimit(
        createReq({ 'x-real-ip': IP }, { method: 'POST', body: {} }),
        createMockRes(),
        RATE_LIMITS.customerLogin,
      );

      expect(bucketsOf()['customer-login'][0].p_identifier).toBe(`${IP}|sem-escopo`);
    });
  });

  describe('saneamento das opções', () => {
    it('usa fallbacks seguros quando bucket/limite/janela vêm inválidos', async () => {
      await enforceRateLimit(
        createReq({ 'x-real-ip': '203.0.113.9' }),
        createMockRes(),
        { bucket: '   ', limit: -3, windowSeconds: 'abc' },
      );

      expect(lastRpcBody()).toEqual({
        p_bucket: 'default',
        p_identifier: '203.0.113.9',
        p_limit: 60,
        p_window_seconds: 60,
      });
    });
  });
});
