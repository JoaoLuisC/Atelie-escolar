import { createRequire } from 'node:module';
import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  expectApiError,
  installModuleMock,
  installPartialMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// `handlers/admin/login.js` — a porta do painel.
//
// POR QUE ESTA SUÍTE EXISTE
// 586 linhas, o arquivo mais complexo de auth do repositório, e até
// 01/09/2026 sem suíte própria. O que passava por cobertura era indireto: o
// gate de `admin-settings` exercitava `verifySecondFactorCode`, e
// `rate-limit.test.js` exercitava os perfis dos baldes. Nada cobria o desenho
// que só existe AQUI — a máquina de duas etapas, o desafio assinado que carrega
// "a senha já foi conferida", o consumo único que impede replay, e a resposta
// deliberadamente ambígua para conta não-admin.
//
// São justamente as partes onde um erro não aparece: um anti-replay que parou
// de funcionar continua deixando o login legítimo passar, e ninguém nota.
//
// O QUE É MOCKADO, E O QUE NÃO É
// Fica REAL tudo que é a decisão sob teste: o desafio HMAC, o TOTP, a leitura
// da config, a escolha do balde. É substituído só o I/O — Supabase Auth, a RPC
// do contador, e o logger de segurança.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const { encryptSecret, hashPin, generateTotpCode, decodeBase32, TOTP_STEP_SECONDS } =
  requireCjs('../../lib/admin-2fa.js');

const EMAIL = 'dona@ateliedaescola.com.br';
const SENHA = 'senha-correta-da-dona';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const PIN = '918273';
const IP = '203.0.113.7';

let res;
let handler;
let enforceRateLimit;
let recordSecurityEvent;
let signInWithPassword;
let getProfileRoleByEmail;
let rpcRespostas;
let rpcChamadas;
let adminConfig;
let originalEnv;

/** Requisição mínima que o handler entende. */
function createReq(body = {}, headers = {}) {
  return {
    method: 'POST',
    body: { email: EMAIL, password: SENHA, ...body },
    headers: { 'user-agent': 'vitest', 'x-real-ip': IP, ...headers },
    socket: { remoteAddress: IP },
  };
}

/** Código TOTP válido para a janela corrente, como o app geraria. */
function codigoAtual(offset = 0) {
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + offset;
  return generateTotpCode(decodeBase32(TOTP_SECRET), counter);
}

/**
 * Roda o handler e devolve a resposta. Quando `body` traz `challengeToken`,
 * é a 2ª etapa; sem ele, a 1ª.
 */
async function login(body = {}, headers = {}) {
  res = createMockRes();
  await handler(createReq(body, headers), res);
  return res;
}

/** 1ª etapa: senha aceita, desafio emitido. Devolve o challengeToken. */
async function obterDesafio() {
  const primeira = await login();
  return primeira.body?.challengeToken;
}

beforeEach(() => {
  resetModuleRegistry();

  originalEnv = {
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    ADMIN_2FA_ENC_KEY: process.env.ADMIN_2FA_ENC_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_URL: process.env.APP_URL,
  };
  process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.ADMIN_2FA_ENC_KEY = crypto.randomBytes(32).toString('hex');
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-stub';
  process.env.APP_URL = 'http://localhost:5173';

  // Por padrão: 2FA desligado. Cada describe ajusta.
  adminConfig = {};

  // A RPC de uso único responde "inédito" por padrão; a fila permite simular
  // a segunda apresentação do mesmo código.
  rpcRespostas = [];
  rpcChamadas = [];

  // Mock proprio em vez de installSecurityLoggerMock: aquele devolve um IP
  // FIXO, e o desafio de 2o fator amarra o IP assinado ao IP da requisicao —
  // com IP constante o teste de "desafio de outro IP" passaria por vacuidade,
  // afirmando exatamente nada.
  recordSecurityEvent = vi.fn(async () => {});
  installModuleMock('../../lib/security-logger', {
    recordSecurityEvent,
    extractClientIp: (req) => String(req?.headers?.['x-real-ip'] || IP),
  });

  enforceRateLimit = vi.fn(async () => ({ blocked: false, failOpen: false }));
  installPartialMock('../../lib/rate-limit', { enforceRateLimit });

  signInWithPassword = vi.fn(async () => ({
    data: { user: { id: 'uid-1', email: EMAIL } },
    error: null,
  }));
  getProfileRoleByEmail = vi.fn(async () => 'ADMIN');
  installModuleMock('../../services/supabase-auth', {
    getAnonClient: () => ({ auth: { signInWithPassword } }),
    getProfileRoleByEmail,
  });

  installPartialMock('../../lib/supabase', {
    getSupabaseConfig: () => ({ url: 'https://stub.supabase.co', serviceRoleKey: 'k' }),
    supabaseRequest: vi.fn(async (path, options) => {
      rpcChamadas.push({ path, body: JSON.parse(options.body) });
      const proxima = rpcRespostas.shift();
      return proxima === undefined ? [{ allowed: true }] : proxima;
    }),
    serviceRoleHelpers: {
      getTableRow: vi.fn(async () => ({ setting_value: adminConfig })),
    },
  });

  handler = loadHandler('../admin/login.js');
});

afterEach(() => {
  for (const [chave, valor] of Object.entries(originalEnv)) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
  resetModuleRegistry();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────

describe('contrato de entrada', () => {
  it('recusa método diferente de POST com 405', async () => {
    res = createMockRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);

    expect(res.statusCode).toBe(405);
  });

  it('exige e-mail e senha', async () => {
    res = createMockRes();
    await handler(createReq({ email: '', password: '' }), res);

    expectApiError(res, { status: 400, code: 'VALIDATION_FAILED' });
    // Validação ANTES de qualquer trabalho caro: não toca o Supabase.
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('normaliza o e-mail (trim + minúsculas) antes de autenticar', async () => {
    await login({ email: '  DONA@AtelieDaEscola.com.BR  ' });

    expect(signInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: EMAIL.toLowerCase() }),
    );
  });
});

describe('credenciais', () => {
  it('senha correta e papel admin abre a sessão', async () => {
    const resposta = await login();

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).toMatchObject({ success: true, user: { role: 'admin' } });
    expect(String(resposta.headers['Set-Cookie'])).toContain('admin_session=');
  });

  it('senha errada devolve 401 e registra o motivo real no log', async () => {
    signInWithPassword.mockResolvedValueOnce({ data: null, error: { message: 'invalid' } });

    const resposta = await login();

    expectApiError(resposta, { status: 401, code: 'UNAUTHORIZED' });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'admin_login_failed',
        properties: expect.objectContaining({ reason: 'invalid_credentials' }),
      }),
    );
  });

  it('não emite cookie quando a senha falha', async () => {
    signInWithPassword.mockResolvedValueOnce({ data: null, error: { message: 'invalid' } });

    const resposta = await login();

    expect(resposta.headers['Set-Cookie']).toBeUndefined();
  });
});

describe('gate de papel — a resposta não pode vazar que a senha estava certa', () => {
  it.each([['CUSTOMER'], ['SELLER'], [''], [null]])(
    'papel %s recebe 401 com a MESMA resposta de senha errada',
    async (papel) => {
      getProfileRoleByEmail.mockResolvedValueOnce(papel);
      const naoAdmin = await login();

      signInWithPassword.mockResolvedValueOnce({ data: null, error: { message: 'invalid' } });
      const senhaErrada = await login();

      // A comparação é o teste: qualquer diferença observável entre as duas
      // respostas diz ao atacante que a senha daquela conta está correta.
      expect(naoAdmin.statusCode).toBe(senhaErrada.statusCode);
      expect(naoAdmin.body).toEqual(senhaErrada.body);
      expect(naoAdmin.headers['Set-Cookie']).toBeUndefined();
    },
  );

  it('o motivo verdadeiro fica só no log de segurança', async () => {
    getProfileRoleByEmail.mockResolvedValueOnce('CUSTOMER');

    await login();

    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ reason: 'non_admin_role', role: 'customer' }),
      }),
    );
  });

  it.each([['admin'], ['ADMIN'], ['master'], ['Master']])('papel %s é aceito', async (papel) => {
    getProfileRoleByEmail.mockResolvedValueOnce(papel);

    const resposta = await login();

    expect(resposta.statusCode).toBe(200);
  });
});

describe('escolha do balde de rate limit', () => {
  it('sem desafio válido, conta no balde da SENHA', async () => {
    await login();

    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ bucket: 'admin-login' }),
    );
  });

  it('com desafio válido, conta no balde do 2º FATOR, por IP+conta', async () => {
    adminConfig = { requireSecondFactor: true, fallbackPin: hashPin(PIN) };
    const challengeToken = await obterDesafio();
    enforceRateLimit.mockClear();

    await login({ challengeToken, factorCode: PIN });

    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        bucket: 'admin-login-2fa',
        // IP + hash do e-mail: trocar de conta não esvazia o balde, e um admin
        // não tranca o outro.
        identifier: expect.stringContaining('|'),
      }),
    );
  });

  it('desafio FORJADO cai no balde da senha — não há como fugir do limite', async () => {
    adminConfig = { requireSecondFactor: true, fallbackPin: hashPin(PIN) };

    await login({ challengeToken: 'inventado.assinatura', factorCode: PIN });

    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ bucket: 'admin-login' }),
    );
  });

  it('balde estourado interrompe antes de tocar o Supabase Auth', async () => {
    enforceRateLimit.mockResolvedValueOnce({ blocked: true });

    await login();

    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('desafio de 2º fator', () => {
  beforeEach(() => {
    adminConfig = { requireSecondFactor: true, fallbackPin: hashPin(PIN) };
  });

  it('1ª etapa devolve requiresSecondFactor e um desafio, sem cookie', async () => {
    const resposta = await login();

    expect(resposta.body).toMatchObject({ success: false, requiresSecondFactor: true });
    expect(resposta.body.methods).toEqual(['pin']);
    expect(typeof resposta.body.challengeToken).toBe('string');
    // O ponto: senha certa NÃO abre sessão enquanto o 2º fator não vier.
    expect(resposta.headers['Set-Cookie']).toBeUndefined();
  });

  it('2ª etapa com o código correto abre a sessão', async () => {
    const challengeToken = await obterDesafio();

    const resposta = await login({ challengeToken, factorCode: PIN });

    expect(resposta.statusCode).toBe(200);
    expect(String(resposta.headers['Set-Cookie'])).toContain('admin_session=');
  });

  it('desafio sem código devolve 401', async () => {
    const challengeToken = await obterDesafio();

    const resposta = await login({ challengeToken, factorCode: '' });

    expectApiError(resposta, { status: 401, code: 'UNAUTHORIZED' });
  });

  it('código errado devolve 401 e registra admin_2fa_failed', async () => {
    const challengeToken = await obterDesafio();

    const resposta = await login({ challengeToken, factorCode: '000000' });

    expectApiError(resposta, { status: 401, code: 'UNAUTHORIZED' });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'admin_2fa_failed' }),
    );
  });

  it('assinatura adulterada não vale — reemite o desafio em vez de aceitar', async () => {
    const challengeToken = await obterDesafio();
    const adulterado = `${challengeToken.split('.')[0]}.${'A'.repeat(43)}`;

    const resposta = await login({ challengeToken: adulterado, factorCode: PIN });

    // Cai para a 1ª etapa: senha estava certa, então reemitir é seguro.
    expect(resposta.body).toMatchObject({ requiresSecondFactor: true });
    expect(resposta.headers['Set-Cookie']).toBeUndefined();
  });

  it('payload adulterado (outro e-mail) não vale', async () => {
    const challengeToken = await obterDesafio();
    const [payload, assinatura] = challengeToken.split('.');
    const decodificado = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decodificado.email = 'outro@exemplo.com';
    const forjado = `${Buffer.from(JSON.stringify(decodificado)).toString('base64url')}.${assinatura}`;

    const resposta = await login({ challengeToken: forjado, factorCode: PIN });

    expect(resposta.body).toMatchObject({ requiresSecondFactor: true });
  });

  it('desafio de OUTRO IP não vale', async () => {
    const challengeToken = await obterDesafio();

    const resposta = await login(
      { challengeToken, factorCode: PIN },
      { 'x-real-ip': '198.51.100.4' },
    );

    // O IP entra assinado no payload; de outro endereço o desafio é ignorado.
    expect(resposta.body).toMatchObject({ requiresSecondFactor: true });
  });

  it('desafio EXPIRADO não vale (TTL de 120s)', async () => {
    const challengeToken = await obterDesafio();

    // 121s adiante: fora da janela.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 121_000);
    const resposta = await login({ challengeToken, factorCode: PIN });

    expect(resposta.body).toMatchObject({ requiresSecondFactor: true });
    expect(resposta.headers['Set-Cookie']).toBeUndefined();
  });

  it('desafio assinado com OUTRO segredo não vale', async () => {
    const challengeToken = await obterDesafio();
    process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

    const resposta = await login({ challengeToken, factorCode: PIN });

    expect(resposta.body).toMatchObject({ requiresSecondFactor: true });
  });

  it('2FA ligado sem método configurado falha fechado, com 500', async () => {
    adminConfig = { requireSecondFactor: true };

    const resposta = await login();

    expectApiError(resposta, { status: 500, code: 'INTERNAL_ERROR' });
    expect(resposta.headers['Set-Cookie']).toBeUndefined();
  });
});

describe('TOTP', () => {
  beforeEach(() => {
    adminConfig = { requireSecondFactor: true, totpSecret: encryptSecret(TOTP_SECRET) };
  });

  it('funciona com o segredo CIFRADO em repouso', async () => {
    const challengeToken = await obterDesafio();

    const resposta = await login({ challengeToken, factorCode: codigoAtual() });

    expect(resposta.statusCode).toBe(200);
  });

  it('aceita a janela anterior e a próxima (drift de ±1)', async () => {
    for (const offset of [-1, 0, 1]) {
      const challengeToken = await obterDesafio();
      const resposta = await login({ challengeToken, factorCode: codigoAtual(offset) });

      expect(resposta.statusCode, `offset ${offset}`).toBe(200);
    }
  });

  it('recusa código fora da janela', async () => {
    const challengeToken = await obterDesafio();

    const resposta = await login({ challengeToken, factorCode: codigoAtual(5) });

    expectApiError(resposta, { status: 401, code: 'UNAUTHORIZED' });
  });

  it('aceita o segredo em texto puro (formato legado)', async () => {
    // Instalação viva antes da migração: o login não pode quebrar no deploy.
    adminConfig = { requireSecondFactor: true, totpSecret: TOTP_SECRET };
    const challengeToken = await obterDesafio();

    const resposta = await login({ challengeToken, factorCode: codigoAtual() });

    expect(resposta.statusCode).toBe(200);
  });
});

describe('anti-replay (a parte que falha em silêncio)', () => {
  beforeEach(() => {
    adminConfig = { requireSecondFactor: true, totpSecret: encryptSecret(TOTP_SECRET) };
  });

  it('marca o contador do TOTP como consumido, e não o código', async () => {
    const challengeToken = await obterDesafio();
    await login({ challengeToken, factorCode: codigoAtual() });

    const marca = rpcChamadas.find((c) => c.body.p_bucket === 'admin-2fa-totp');
    expect(marca).toBeDefined();
    expect(marca.body.p_limit).toBe(1);
    // O código NUNCA vai para o banco — só o contador da janela.
    expect(marca.body.p_identifier).not.toContain(codigoAtual());
  });

  it('o MESMO código não passa duas vezes', async () => {
    const codigo = codigoAtual();

    const primeiro = await obterDesafio();
    const um = await login({ challengeToken: primeiro, factorCode: codigo });
    expect(um.statusCode).toBe(200);

    // Segunda apresentação: a RPC responde "já visto".
    const segundo = await obterDesafio();
    rpcRespostas = [[{ allowed: false }]];
    const dois = await login({ challengeToken: segundo, factorCode: codigo });

    expectApiError(dois, { status: 401, code: 'UNAUTHORIZED' });
    expect(dois.headers['Set-Cookie']).toBeUndefined();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'admin_2fa_code_replayed' }),
    );
  });

  it('o desafio é consumido DEPOIS do código, não antes', async () => {
    // Consumir antes faria um código digitado errado queimar o desafio e
    // obrigar a refazer a senha — o oposto do que o TTL curto pretende.
    const challengeToken = await obterDesafio();
    await login({ challengeToken, factorCode: '000000' });

    expect(rpcChamadas.some((c) => c.body.p_bucket === 'admin-2fa-challenge')).toBe(false);
  });

  it('o mesmo desafio não é reutilizável', async () => {
    const challengeToken = await obterDesafio();
    await login({ challengeToken, factorCode: codigoAtual() });

    rpcRespostas = [[{ allowed: true }], [{ allowed: false }]];
    const segunda = await login({ challengeToken, factorCode: codigoAtual() });

    expect(segunda.headers['Set-Cookie']).toBeUndefined();
  });

  it('contador indisponível DEGRADA com alerta em vez de trancar o admin', async () => {
    // A escolha: sem a marca de uso único o login legítimo ainda entra, mas o
    // evento registra que a proteção ficou ausente. Trancar aqui deixaria a
    // dona fora do painel durante um incidente do Postgres.
    const challengeToken = await obterDesafio();
    rpcRespostas = [Promise.reject(new Error('down'))];

    const resposta = await login({ challengeToken, factorCode: codigoAtual() });

    expect(resposta.statusCode).toBe(200);
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'admin_2fa_replay_guard_degraded' }),
    );
  });
});

describe('PIN de emergência', () => {
  it('aceita o PIN hasheado', async () => {
    adminConfig = { requireSecondFactor: true, fallbackPin: hashPin(PIN) };
    const challengeToken = await obterDesafio();

    expect((await login({ challengeToken, factorCode: PIN })).statusCode).toBe(200);
  });

  it('aceita o PIN em texto puro (formato legado)', async () => {
    adminConfig = { requireSecondFactor: true, fallbackPin: PIN };
    const challengeToken = await obterDesafio();

    expect((await login({ challengeToken, factorCode: PIN })).statusCode).toBe(200);
  });

  it('allowPinFallback: false remove o PIN dos métodos aceitos', async () => {
    adminConfig = {
      requireSecondFactor: true,
      totpSecret: encryptSecret(TOTP_SECRET),
      fallbackPin: hashPin(PIN),
      allowPinFallback: false,
    };
    const primeira = await login();

    expect(primeira.body.methods).toEqual(['totp']);

    const resposta = await login({ challengeToken: primeira.body.challengeToken, factorCode: PIN });
    expectApiError(resposta, { status: 401, code: 'UNAUTHORIZED' });
  });
});
