import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/security-logger.js` — item P4.1, PRIMEIRO da ordem de risco.
//
// Duas razões para ser o primeiro:
//   1. é ele que registra evento de segurança — se falhar em silêncio, o
//      projeto perde a única trilha de detecção que tem;
//   2. foi a origem do `fetch` que instabilizava a suíte inteira (P0.3): ele
//      chama o Supabase durante o teste, e o tempo de cada asserção passava a
//      depender de quanto o DNS demorava para falhar.
//
// `extractClientIp` tem peso próprio: é ele que decide qual header vale como
// identidade do cliente. Confiar no PRIMEIRO valor de `X-Forwarded-For` — o
// erro clássico — deixaria qualquer um forjar o IP e, com isso, escapar de
// todo balde de rate limit e poluir a trilha de segurança com endereços
// inventados.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { extractClientIp, recordSecurityEvent } = requireCjs('../security-logger.js');

/** Chamadas de rede que saíram, por destino. */
function chamadasPara(fragmento) {
  return globalThis.fetch.mock.calls.filter(([url]) => String(url).includes(fragmento));
}

describe('extractClientIp', () => {
  it('prefere req.ip, que o Express já resolveu com trust proxy', () => {
    expect(extractClientIp({ ip: '203.0.113.9', headers: { 'x-real-ip': '198.51.100.1' } })).toBe(
      '203.0.113.9',
    );
  });

  it('usa headers ANCORADOS pela borda quando não há req.ip', () => {
    // No runtime serverless não existe `req.ip`. `x-real-ip` e
    // `x-vercel-forwarded-for` são postos pela borda e o cliente não os
    // controla.
    expect(extractClientIp({ headers: { 'x-real-ip': '198.51.100.1' } })).toBe('198.51.100.1');
    expect(extractClientIp({ headers: { 'x-vercel-forwarded-for': '198.51.100.2' } })).toBe(
      '198.51.100.2',
    );
  });

  it('em X-Forwarded-For usa o ÚLTIMO valor, não o primeiro', () => {
    // O cliente prepende o que quiser na cadeia; o último elemento é o que o
    // proxy mais próximo acrescentou. Pegar o primeiro é o bug clássico, e
    // aqui ele valeria um bypass de rate limit de graça.
    expect(
      extractClientIp({
        headers: { 'x-forwarded-for': '10.0.0.1 , 192.0.2.44, 198.51.100.7' },
      }),
    ).toBe('198.51.100.7');
  });

  it('cai para o socket quando não há header nenhum', () => {
    expect(extractClientIp({ headers: {}, socket: { remoteAddress: '203.0.113.5' } })).toBe(
      '203.0.113.5',
    );
    expect(extractClientIp({ headers: {}, connection: { remoteAddress: '203.0.113.6' } })).toBe(
      '203.0.113.6',
    );
  });

  it('sem req e sem nada, devolve null em vez de lançar', () => {
    expect(extractClientIp(null)).toBeNull();
    expect(extractClientIp({})).toBeNull();
  });
});

describe('recordSecurityEvent', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    delete process.env.SECURITY_ALERT_WEBHOOK_URL;

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 201,
      headers: { get: () => 'application/json' },
      json: async () => [{}],
      text: async () => '[]',
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ambienteOriginal;
    vi.restoreAllMocks();
  });

  it('sem eventName, não faz nada — nem log, nem escrita', async () => {
    await recordSecurityEvent({});
    await recordSecurityEvent({ eventName: 123 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('persiste o evento em security_events com os campos recortados', async () => {
    await recordSecurityEvent({
      eventName: 'webhook_invalid_signature',
      severity: 'error',
      ip: '203.0.113.7',
      userAgent: 'a'.repeat(900),
      requestId: 'req-1',
      properties: { payment_id: 'MP-1' },
    });

    const [chamada] = chamadasPara('security_events');
    const gravado = JSON.parse(chamada[1].body);

    expect(gravado.event_name).toBe('webhook_invalid_signature');
    expect(gravado.severity).toBe('error');
    expect(gravado.ip).toBe('203.0.113.7');
    // Teto de 500: um user-agent gigante é entrada do cliente, e a tabela de
    // segurança não pode virar depósito de payload arbitrário.
    expect(gravado.user_agent).toHaveLength(500);
    expect(gravado.properties).toEqual({ payment_id: 'MP-1' });
  });

  it('severity fora da lista cai em `warn` em vez de gravar lixo', async () => {
    await recordSecurityEvent({ eventName: 'evento', severity: 'catastrofico' });

    const [chamada] = chamadasPara('security_events');
    expect(JSON.parse(chamada[1].body).severity).toBe('warn');
  });

  it('falha ao gravar NÃO derruba o handler que disparou o evento', async () => {
    // Esta é a propriedade central: o evento de segurança é best-effort. Se
    // gravá-lo pudesse lançar, uma indisponibilidade do Postgres derrubaria
    // justamente o caminho que detectou o ataque.
    globalThis.fetch = vi.fn(async () => {
      throw new Error('rede caiu');
    });

    await expect(recordSecurityEvent({ eventName: 'evento' })).resolves.toBeUndefined();
  });

  it('sem Supabase configurado, ainda emite o log e não tenta gravar', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await recordSecurityEvent({ eventName: 'evento' });

    expect(chamadasPara('security_events')).toHaveLength(0);
  });

  it('dispara o alerta externo quando há webhook configurado', async () => {
    process.env.SECURITY_ALERT_WEBHOOK_URL = 'https://alertas.test/hook';

    await recordSecurityEvent({ eventName: 'evento', properties: { x: 1 } });

    const [alerta] = chamadasPara('alertas.test');
    expect(alerta).toBeDefined();
    expect(JSON.parse(alerta[1].body).event).toBe('evento');
  });

  it('alerta externo que falha também não derruba nada', async () => {
    process.env.SECURITY_ALERT_WEBHOOK_URL = 'https://alertas.test/hook';
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('alertas.test')) throw new Error('coletor caiu');
      return {
        ok: true,
        status: 201,
        headers: { get: () => 'application/json' },
        json: async () => [{}],
        text: async () => '[]',
      };
    });

    await expect(recordSecurityEvent({ eventName: 'evento' })).resolves.toBeUndefined();
  });
});
