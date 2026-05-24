const { ensureAdminSession, setAdminCorsHeaders } = require('../lib/admin-session');
const {
  getSupabaseConfig,
  serviceRoleHelpers: {
    getTableRow,
    insertIntoTable,
    updateTable,
  },
} = require('../lib/supabase');

const ALLOWED_KEYS = new Set(['homeSections', 'adminConfig']);

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
      return res.status(200).json({ success: true, key, value });
    }

    if (req.method === 'PUT') {
      await writeSetting(key, req.body?.value ?? null);
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
