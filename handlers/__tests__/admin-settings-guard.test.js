import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockRes,
  installModuleMock,
  installRateLimitPassthrough,
  installSecurityLoggerMock,
  loadHandler,
  resetModuleRegistry,
} from './money-path-harness.js';

import { createRequire } from 'node:module';

// Os segredos de 2º fator são guardados protegidos: `totpSecret` cifrado
// (AES-256-GCM) e `fallbackPin` com hash scrypt. As asserções abaixo
// perguntam pelo SEGREDO, não pelos bytes gravados — exigir bytes exatos
// prenderia o teste à embalagem e, pior, só passaria de novo se o segredo
// voltasse a ficar em texto puro.
const { decryptSecret, verifyPin } = createRequire(import.meta.url)('../../lib/admin-2fa.js');

// ════════════════════════════════════════════════════════════════════
// Gate de reautenticação de api/admin-settings.js.
//
// O QUE ESTÁ TRAVADO AQUI, e por quê:
//
// 1. **Achado M3** — antes da whitelist, o PUT persistia `{ ...incoming }`.
//    Qualquer sessão admin podia mandar `{"requireSecondFactor": false}` e
//    desligar o 2º fator, ou gravar um `totpSecret` próprio. O gate exige o
//    fator VIGENTE para mexer no mecanismo de autenticação.
//
// 2. **Regressão R5 (é o motivo deste arquivo existir)** — a primeira versão do
//    gate só sinalizava quando JÁ HAVIA segredo gravado (`if (stored && …)`).
//    Numa config com 2FA exigido via fallbackPin mas SEM totpSecret, plantar um
//    totpSecret inédito escapava do gate: o dono de uma sessão roubada (o cookie
//    HMAC de 8h não é revogável — achado A4) ganhava um segundo fator permanente
//    sem provar posse de nada. "Não havia valor anterior" é justamente como se
//    instala uma porta dos fundos, não uma atenuante.
//
// 3. **O outro lado da moeda** — endurecer o gate não pode transformar todo
//    "Salvar" do painel num pedido de código, senão a correção seria revertida
//    na primeira reclamação. O caso do round-trip do painel está travado abaixo.
//
// O 2º fator usado nos testes é o PIN e não o TOTP: `verifySecondFactorCode` é
// o de VERDADE (api/admin-login.js real, sem duplo), e o PIN o exercita sem
// depender do relógio. Um teste de gate que falha às 30 segundos por causa de
// uma janela TOTP não travaria nada.
// ════════════════════════════════════════════════════════════════════

const FALLBACK_PIN = '918273';
const STORED_TOTP = 'JBSWY3DPEHPK3PXP';
const ATTACKER_TOTP = 'MZXW6YTBOI2GC3TP';

/** Duplo de lib/supabase.js com UMA linha em `settings`, a que o handler lê. */
function installSettingsStore(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));

  const getTableRow = vi.fn(async (table, options = {}) => {
    if (table !== 'settings') throw new Error(`tabela inesperada "${table}"`);
    const key = options.filters?.[0]?.value;
    return rows.find((row) => row.setting_key === key) || null;
  });

  const updateTable = vi.fn(async (table, filters, payload) => {
    const key = String(filters.setting_key).replace(/^eq\./, '');
    const row = rows.find((item) => item.setting_key === key);
    if (row) Object.assign(row, payload);
    return row ? [{ ...row }] : [];
  });

  const insertIntoTable = vi.fn(async (table, payload) => {
    rows.push({ ...payload });
    return [payload];
  });

  const helpers = { getTableRow, updateTable, insertIntoTable };
  installModuleMock('../../lib/supabase', {
    getSupabaseConfig: () => ({
      url: 'https://projeto-teste.supabase.co',
      anonKey: 'anon-de-teste',
      serviceRoleKey: 'service-role-de-teste',
    }),
    serviceRoleHelpers: helpers,
    ...helpers,
    // api/admin-login.js importa supabaseRequest no topo; nunca é chamado aqui.
    supabaseRequest: vi.fn(async () => ({})),
  });

  return {
    rows,
    stored: (key) => rows.find((row) => row.setting_key === key)?.setting_value,
  };
}

let auditCalls = [];
let securityEvents;

function installSupportMocks() {
  auditCalls = [];
  installModuleMock('../../lib/admin-audit', {
    logAdminAction: vi.fn(async (entry) => {
      auditCalls.push(entry);
    }),
  });
  installModuleMock('../../lib/admin-session', {
    // A sessão é considerada VÁLIDA em todos os testes: o ponto é justamente
    // que "ser admin" não basta para mexer no 2º fator.
    ensureAdminSession: () => true,
    setAdminCorsHeaders: () => {},
    getAdminIdentity: () => 'admin@teste.com',
    safeCompare: (a, b) => String(a) === String(b) && String(a).length > 0,
  });
  securityEvents = installSecurityLoggerMock();
  installRateLimitPassthrough();
}

function putRequest(value, extra = {}) {
  return {
    method: 'PUT',
    query: { key: 'adminConfig' },
    headers: { 'user-agent': 'vitest' },
    body: { key: 'adminConfig', value, ...extra },
  };
}

async function runHandler(req) {
  const res = createMockRes();
  const handler = loadHandler('../admin/settings.js');
  await handler(req, res);
  return res;
}

beforeEach(() => {
  resetModuleRegistry();
  installSupportMocks();
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('gate de reautenticação do adminConfig', () => {
  it('R5: plantar um totpSecret INÉDITO exige reautenticação', async () => {
    // Cenário exato do achado: 2FA exigido, PIN cadastrado, totpSecret VAZIO.
    const store = installSettingsStore([
      {
        setting_key: 'adminConfig',
        setting_value: { requireSecondFactor: true, fallbackPin: FALLBACK_PIN },
      },
    ]);

    const res = await runHandler(
      putRequest({
        requireSecondFactor: true,
        totpSecret: ATTACKER_TOTP,
      }),
    );

    expect(res.statusCode).toBe(403);
    // Item P1.5: SCREAMING_SNAKE e DENTRO do objeto `error`, senão o
    // `parseJson` do cliente devolve `errorCode: null`.
    expect(res.body.error.code).toBe('SECOND_FACTOR_REQUIRED');
    // E, sobretudo: NADA foi gravado.
    expect(store.stored('adminConfig').totpSecret).toBeUndefined();
    expect(securityEvents.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'admin_2fa_settings_reauth_failed' }),
    );
    // O evento aponta QUAL campo foi tocado, sem revelar o valor tentado.
    const event = securityEvents.recordSecurityEvent.mock.calls[0][0];
    expect(event.properties.fields).toContain('totpSecret');
    expect(JSON.stringify(event)).not.toContain(ATTACKER_TOTP);
  });

  it('R5: com o código correto, plantar o totpSecret inédito é permitido', async () => {
    // O gate não pode virar um bloqueio absoluto: o admin legítimo, de posse do
    // fator vigente, continua conseguindo acrescentar um fator novo.
    const store = installSettingsStore([
      {
        setting_key: 'adminConfig',
        setting_value: { requireSecondFactor: true, fallbackPin: FALLBACK_PIN },
      },
    ]);

    const res = await runHandler(
      putRequest(
        { requireSecondFactor: true, totpSecret: ATTACKER_TOTP },
        { confirmationCode: FALLBACK_PIN },
      ),
    );

    expect(res.statusCode).toBe(200);
    expect(decryptSecret(store.stored('adminConfig').totpSecret)).toBe(ATTACKER_TOTP);
    // O PIN vigente sobrevive: segredo não enviado é preservado, não apagado.
    expect(verifyPin(store.stored('adminConfig').fallbackPin, FALLBACK_PIN)).toBe(true);
  });

  it('M3: desligar requireSecondFactor exige reautenticação', async () => {
    const store = installSettingsStore([
      {
        setting_key: 'adminConfig',
        setting_value: {
          requireSecondFactor: true,
          totpSecret: STORED_TOTP,
          fallbackPin: FALLBACK_PIN,
        },
      },
    ]);

    const res = await runHandler(putRequest({ requireSecondFactor: false }));

    expect(res.statusCode).toBe(403);
    expect(store.stored('adminConfig').requireSecondFactor).toBe(true);
  });

  it('M3: OMITIR requireSecondFactor também exige reautenticação', async () => {
    // O campo ausente volta ao default `false` na gravação — desligar por
    // omissão tem exatamente o mesmo efeito que desligar explicitamente, e a
    // detecção compara valores EFETIVOS justamente para não cair nisso.
    const store = installSettingsStore([
      {
        setting_key: 'adminConfig',
        setting_value: { requireSecondFactor: true, fallbackPin: FALLBACK_PIN },
      },
    ]);

    const res = await runHandler(putRequest({ allowPinFallback: true }));

    expect(res.statusCode).toBe(403);
    expect(store.stored('adminConfig').requireSecondFactor).toBe(true);
  });

  it('reabrir o fallback por PIN exige reautenticação', async () => {
    const store = installSettingsStore([
      {
        setting_key: 'adminConfig',
        setting_value: {
          requireSecondFactor: true,
          totpSecret: STORED_TOTP,
          fallbackPin: FALLBACK_PIN,
          allowPinFallback: false,
        },
      },
    ]);

    const res = await runHandler(
      putRequest({
        requireSecondFactor: true,
        allowPinFallback: true,
      }),
    );

    expect(res.statusCode).toBe(403);
    expect(store.stored('adminConfig').allowPinFallback).toBe(false);
  });

  it('round-trip do painel (nenhum campo de segurança muda) NÃO exige código', async () => {
    // Este é o contrapeso: o GET redige os segredos, então o painel devolve no
    // PUT as flags iguais e os segredos ausentes. Se isso pedisse código, todo
    // "Salvar" da tela de configurações quebraria.
    const store = installSettingsStore([
      {
        setting_key: 'adminConfig',
        setting_value: {
          requireSecondFactor: true,
          allowPinFallback: true,
          totpSecret: STORED_TOTP,
          fallbackPin: FALLBACK_PIN,
        },
      },
    ]);

    const res = await runHandler(
      putRequest({
        requireSecondFactor: true,
        allowPinFallback: true,
        has2FA: true, // flags transitórias que o GET adicionou
        hasPin: true,
        corDoBotao: 'azul', // campo fora da whitelist: descartado, não 400
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.ignoredFields).toEqual(['corDoBotao']);
    expect(securityEvents.recordSecurityEvent).not.toHaveBeenCalled();
    // Os segredos continuam intactos e as flags transitórias não vazam para o banco.
    const saved = store.stored('adminConfig');
    expect(decryptSecret(saved.totpSecret)).toBe(STORED_TOTP);
    expect(verifyPin(saved.fallbackPin, FALLBACK_PIN)).toBe(true);
    expect(saved).not.toHaveProperty('has2FA');
    expect(saved).not.toHaveProperty('corDoBotao');
  });

  it('config inicial (sem 2FA em vigor) cadastra o primeiro fator sem código', async () => {
    // Sem método funcionando não há código que o admin POSSA apresentar; exigir
    // um aqui tornaria a configuração inicial impossível. É por isso que o gate
    // mora atrás de `enforcedNow`, e não dentro da detecção de mudança.
    const store = installSettingsStore([]);

    const res = await runHandler(
      putRequest({
        requireSecondFactor: true,
        totpSecret: STORED_TOTP,
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(decryptSecret(store.stored('adminConfig').totpSecret)).toBe(STORED_TOTP);
  });

  it('chave não sensível (homeSections) segue livre', async () => {
    const store = installSettingsStore([]);
    const res = await runHandler({
      method: 'PUT',
      query: { key: 'homeSections' },
      headers: {},
      body: { key: 'homeSections', value: { sections: [{ key: 'novidades' }] } },
    });

    expect(res.statusCode).toBe(200);
    expect(store.stored('homeSections')).toEqual({ sections: [{ key: 'novidades' }] });
  });
});

describe('vazamento de segredo', () => {
  it('o audit log não registra segredo em claro (nem no before, nem no after)', async () => {
    installSettingsStore([
      {
        setting_key: 'adminConfig',
        setting_value: {
          requireSecondFactor: true,
          fallbackPin: FALLBACK_PIN,
          // Sobra legada: chave que a whitelist nunca aceitaria, mas que está
          // gravada e entra no `before` do audit cru.
          totpSecretBackup: 'OLDSECRETVALUE234',
        },
      },
    ]);

    const res = await runHandler(
      putRequest(
        { requireSecondFactor: true, totpSecret: STORED_TOTP },
        { confirmationCode: FALLBACK_PIN },
      ),
    );

    expect(res.statusCode).toBe(200);
    expect(auditCalls).toHaveLength(1);
    // Só `before`/`after` são serializados: é o que lib/admin-audit.js grava na
    // tabela. O `req` também é passado, mas de lá só saem admin_id e IP — o
    // corpo (que carrega o confirmationCode) não é persistido.
    const { before, after } = auditCalls[0];
    const serialized = JSON.stringify({ before, after });
    expect(serialized).not.toContain(FALLBACK_PIN);
    expect(serialized).not.toContain(STORED_TOTP);
    expect(serialized).not.toContain('OLDSECRETVALUE234');
    expect(auditCalls[0].after.value.totpSecret).toBe('[REDACTED]');
    expect(auditCalls[0].before.value.totpSecretBackup).toBe('[REDACTED]');
  });

  it('o GET devolve flags de "configurado", nunca os segredos', async () => {
    installSettingsStore([
      {
        setting_key: 'adminConfig',
        setting_value: {
          requireSecondFactor: true,
          totpSecret: STORED_TOTP,
          fallbackPin: FALLBACK_PIN,
          totpSecretBackup: 'OLDSECRETVALUE234',
        },
      },
    ]);

    const res = await runHandler({
      method: 'GET',
      query: { key: 'adminConfig' },
      headers: {},
      body: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.value).toMatchObject({ requireSecondFactor: true, has2FA: true, hasPin: true });
    expect(JSON.stringify(res.body)).not.toContain(STORED_TOTP);
    expect(JSON.stringify(res.body)).not.toContain(FALLBACK_PIN);
    expect(JSON.stringify(res.body)).not.toContain('OLDSECRETVALUE234');
  });
});

describe('validação de entrada', () => {
  it('totpSecret fora de Base32 é rejeitado com 400, não gravado', async () => {
    const store = installSettingsStore([]);
    const res = await runHandler(putRequest({ totpSecret: 'nao-e-base32-!!!' }));

    expect(res.statusCode).toBe(400);
    expect(store.stored('adminConfig')).toBeUndefined();
  });

  it('PIN fraco é rejeitado com 400', async () => {
    installSettingsStore([]);
    const res = await runHandler(putRequest({ fallbackPin: '111111' }));
    expect(res.statusCode).toBe(400);
  });

  it('chave de prototype no corpo é descartada, não derruba o handler', async () => {
    // `ADMIN_CONFIG_FIELDS['constructor']` é truthy pela cadeia de protótipos:
    // com o acesso cru, o handler tentaria coagir com um coercer inexistente e
    // devolveria 500 em vez de tratar a chave como qualquer desconhecida.
    const store = installSettingsStore([]);
    const res = await runHandler(
      putRequest({
        constructor: 'x',
        toString: 'y',
        requireSecondFactor: true,
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.ignoredFields).toEqual(expect.arrayContaining(['constructor', 'toString']));
    expect(store.stored('adminConfig')).toEqual({ requireSecondFactor: true });
  });
});
