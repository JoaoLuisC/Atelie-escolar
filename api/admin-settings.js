const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const { logAdminAction } = require('../lib/admin-audit');
const {
  getSupabaseConfig,
  serviceRoleHelpers: {
    getTableRow,
    insertIntoTable,
    updateTable,
  },
} = require('../lib/supabase');

const ALLOWED_KEYS = new Set(['homeSections', 'adminConfig']);

const MIN_FALLBACK_PIN_LENGTH = 6;

/**
 * Valida a configuração do admin antes de persistir. Hoje só o PIN de
 * fallback de 2FA: um PIN curto/trivial é forçável por brute-force, então
 * exigimos um mínimo de tamanho e proibimos sequências óbvias.
 * @returns {string|null} mensagem de erro, ou null se válido.
 */
function validateAdminConfig(value) {
  if (!value || typeof value !== 'object') return null;

  const pin = String(value.fallbackPin ?? '').trim();
  if (!pin) return null; // sem PIN configurado — ok

  if (pin.length < MIN_FALLBACK_PIN_LENGTH) {
    return `O PIN de fallback deve ter ao menos ${MIN_FALLBACK_PIN_LENGTH} caracteres.`;
  }
  if (/^(\d)\1+$/.test(pin) || pin === '123456' || pin === '000000') {
    return 'O PIN de fallback é fraco demais (evite dígitos repetidos ou sequências óbvias).';
  }
  return null;
}

/**
 * Funde a config de admin que chega do painel com a já persistida. O GET redige
 * os segredos (totpSecret/fallbackPin), então o painel nunca os recebe: quando o
 * campo vem vazio/ausente, preservamos o valor já guardado — assim "Salvar" nunca
 * apaga o TOTP/PIN por acidente. As flags transitórias do GET (has2FA/hasPin)
 * nunca são persistidas.
 */
function mergeAdminConfig(incoming, existing) {
  const base = incoming && typeof incoming === 'object' ? { ...incoming } : {};
  delete base.has2FA;
  delete base.hasPin;

  const stick = (field) => {
    const incomingVal = String(base[field] ?? '').trim();
    if (incomingVal) {
      base[field] = incomingVal;
    } else if (existing && String(existing[field] ?? '').trim()) {
      base[field] = existing[field];
    } else {
      delete base[field];
    }
  };
  stick('totpSecret');
  stick('fallbackPin');
  return base;
}

/** Nunca gravar segredos em texto puro na trilha de auditoria. */
function redactForAudit(key, value) {
  if (key !== 'adminConfig' || !value || typeof value !== 'object') return value;
  const { totpSecret, fallbackPin, ...rest } = value;
  return {
    ...rest,
    ...(String(totpSecret ?? '').trim() ? { totpSecret: '[REDACTED]' } : {}),
    ...(String(fallbackPin ?? '').trim() ? { fallbackPin: '[REDACTED]' } : {}),
  };
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

async function readSetting(key) {
  const row = await getTableRow('settings', {
    select: 'setting_key,setting_value',
    filters: [{ column: 'setting_key', value: key }],
  });

  if (!row) {
    return null;
  }

  return safeJsonParse(row.setting_value, null);
}

async function writeSetting(key, value) {
  const payload = {
    setting_key: key,
    setting_value: value ?? null,
  };

  const existing = await getTableRow('settings', {
    select: 'setting_key',
    filters: [{ column: 'setting_key', value: key }],
  });

  if (existing) {
    await updateTable('settings', { setting_key: `eq.${key}` }, payload);
    return;
  }

  await insertIntoTable('settings', payload);
}

module.exports = async function adminSettingsHandler(req, res) {
  setAdminCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    if (!getSupabaseConfig()) {
      return res.status(500).json({ success: false, error: 'Supabase não configurado.' });
    }

    const key = String(req.query?.key || req.body?.key || '').trim();
    if (!ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ success: false, error: 'Chave de configuração inválida.' });
    }

    if (req.method === 'GET') {
      const value = await readSetting(key);
      // adminConfig guarda segredos (totpSecret, fallbackPin). NUNCA os
      // devolvemos no GET — o painel só precisa saber se estão configurados.
      if (key === 'adminConfig' && value && typeof value === 'object') {
        const { totpSecret, fallbackPin, ...safeConfig } = value;
        const sanitized = {
          ...safeConfig,
          has2FA: Boolean(String(totpSecret ?? '').trim()),
          hasPin: Boolean(String(fallbackPin ?? '').trim()),
        };
        return res.status(200).json({ success: true, key, value: sanitized });
      }
      return res.status(200).json({ success: true, key, value });
    }

    if (req.method === 'PUT') {
      let valueToWrite = req.body?.value ?? null;

      if (key === 'adminConfig') {
        const validationError = validateAdminConfig(valueToWrite);
        if (validationError) {
          return res.status(400).json({ success: false, error: validationError });
        }
        const existingConfig = (await readSetting('adminConfig')) || {};
        valueToWrite = mergeAdminConfig(valueToWrite, existingConfig);
      }

      const before = await readSetting(key);
      await writeSetting(key, valueToWrite);
      await logAdminAction({
        req,
        action: 'update',
        targetType: 'setting',
        targetId: key,
        before: before != null ? { value: redactForAudit(key, before) } : null,
        after: { value: redactForAudit(key, valueToWrite) },
      });
      return res.status(200).json({ success: true, key });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin settings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar configurações do admin.',
    });
  }
};
