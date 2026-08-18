import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/admin-audit.js` — item P4.1.
//
// É a trilha de auditoria de escrita do painel (regra I1). Duas propriedades
// pagam este arquivo:
//
//   1. REDAÇÃO. O `after` gravado é o corpo que o admin enviou. Sem redação,
//      trocar o TOTP secret ou o PIN de fallback escreveria o segredo EM TEXTO
//      PURO numa tabela consultada em investigação — a auditoria viraria o
//      vazamento.
//   2. NUNCA LANÇA. Uma falha de auditoria não pode derrubar a operação que a
//      disparou; mas também não pode passar em silêncio, e por isso vira
//      evento de segurança.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { logAdminAction } = requireCjs('../admin-audit.js');
const { setSessionCookie } = requireCjs('../admin-session.js');

function reqComAdmin(email = 'dona@loja.test') {
  const carrier = { setHeader: (_k, v) => (carrier.value = v) };
  setSessionCookie(carrier, { email });
  return {
    headers: {
      cookie: String(carrier.value).split(';')[0],
      'x-real-ip': '203.0.113.9',
      'user-agent': 'painel',
    },
  };
}

function gravadoEm(tabela) {
  const chamada = globalThis.fetch.mock.calls.find(([url]) => String(url).includes(tabela));
  return chamada ? JSON.parse(chamada[1].body) : null;
}

describe('logAdminAction', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.ADMIN_SESSION_SECRET = 'segredo-fixo-para-testes';
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

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

  it('sem action ou sem targetType, não grava nada', async () => {
    await logAdminAction({ action: 'update' });
    await logAdminAction({ targetType: 'product' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('grava quem, o quê, sobre quem e de onde', async () => {
    await logAdminAction({
      req: reqComAdmin(),
      action: 'update',
      targetType: 'product',
      targetId: 'p1',
      after: { name: 'Kit' },
    });

    expect(gravadoEm('admin_audit_log')).toMatchObject({
      admin_id: 'dona@loja.test',
      action: 'update',
      target_type: 'product',
      target_id: 'p1',
      after: { name: 'Kit' },
      ip: '203.0.113.9',
    });
  });

  it('REDIGE os campos sensíveis do payload', async () => {
    // Sem isto, "admin trocou o segundo fator" gravaria o novo TOTP secret em
    // texto puro na tabela que se consulta justamente durante um incidente.
    await logAdminAction({
      req: reqComAdmin(),
      action: 'update',
      targetType: 'setting',
      targetId: 'adminConfig',
      after: {
        totpSecret: 'JBSWY3DPEHPK3PXP',
        password: 'senha123',
        factorCode: '123456',
        challengeToken: 'tok',
        token: 'tok',
        accessToken: 'tok',
        secret: 'shh',
        enabled: true,
      },
    });

    const gravado = gravadoEm('admin_audit_log');
    for (const chave of [
      'password',
      'factorCode',
      'challengeToken',
      'token',
      'accessToken',
      'secret',
    ]) {
      expect(gravado.after[chave], `${chave} não foi redigido`).toBe('[redacted]');
    }
    // Campo não sensível sobrevive — a auditoria precisa continuar dizendo o
    // que mudou.
    expect(gravado.after.enabled).toBe(true);
  });

  it('sessão sem e-mail cai na identidade genérica, não em `undefined`', async () => {
    await logAdminAction({
      req: { headers: {} },
      action: 'delete',
      targetType: 'coupon',
      targetId: 7,
    });

    expect(gravadoEm('admin_audit_log').admin_id).toBe('admin');
  });

  it('recorta action, targetType e targetId', async () => {
    await logAdminAction({
      req: reqComAdmin(),
      action: 'a'.repeat(100),
      targetType: 'b'.repeat(100),
      targetId: 'c'.repeat(300),
    });

    const gravado = gravadoEm('admin_audit_log');
    expect(gravado.action).toHaveLength(32);
    expect(gravado.target_type).toHaveLength(32);
    expect(gravado.target_id).toHaveLength(128);
  });

  it('targetId vazio vira null, não string vazia', async () => {
    await logAdminAction({
      req: reqComAdmin(),
      action: 'update',
      targetType: 'user',
      targetId: '',
    });
    expect(gravadoEm('admin_audit_log').target_id).toBeNull();
  });

  it('sem Supabase configurado, sai sem lançar', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(
      logAdminAction({ req: reqComAdmin(), action: 'update', targetType: 'product' }),
    ).resolves.toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('falha na escrita NÃO lança e vira evento de segurança', async () => {
    // Falha de auditoria não pode derrubar a operação — mas também não pode
    // passar em silêncio, senão a trilha some sem ninguém notar.
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('admin_audit_log')) throw new Error('sem espaço');
      return {
        ok: true,
        status: 201,
        headers: { get: () => 'application/json' },
        json: async () => [{}],
        text: async () => '[]',
      };
    });

    await expect(
      logAdminAction({ req: reqComAdmin(), action: 'update', targetType: 'product' }),
    ).resolves.toBeUndefined();

    const evento = gravadoEm('security_events');
    expect(evento.event_name).toBe('admin_audit_write_failed');
    expect(evento.severity).toBe('error');
  });
});
