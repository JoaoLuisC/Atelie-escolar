// ════════════════════════════════════════════════════════════════════
// DONA DA LOJA — a professora que administra a loja white label.
//
// Hoje a plataforma tem uma loja só (professoramarcia.ateliedaescola.com.br).
// Quem a administra é uma PROFESSORA (perfil SELLER), não o admin da
// plataforma: ela cuida de produtos, pedidos, cupons, vendas e da página; o
// admin fica com usuários, segurança e professores.
//
// A escolha mora em `settings.storeOwner = { sellerId }`, gravada pelo admin
// (handlers/admin/store-owner.js). O login consulta aqui e assina o resultado
// no cookie (`storeOwner: true`), e os endpoints da loja aceitam essa sessão
// por `ensureStoreSession` — sem ida ao banco a cada requisição.
//
// Outro professor (perfil SELLER sem ser a dona) continua só com a área
// simples de /professores: não vê pedidos nem clientes da loja.
// ════════════════════════════════════════════════════════════════════

const {
  serviceRoleHelpers: { getTableRow },
} = require('./supabase');

const SETTING_KEY = 'storeOwner';

function parseValue(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw || 'null'));
  } catch {
    return null;
  }
}

/** Id (uuid) da dona da loja, ou `null` se ninguém foi definido. */
async function getStoreOwnerId() {
  const row = await getTableRow('settings', {
    select: 'setting_value',
    filters: [{ column: 'setting_key', value: SETTING_KEY }],
  });
  const sellerId = String(parseValue(row?.setting_value)?.sellerId || '').trim();
  return sellerId || null;
}

/**
 * A conta é a dona da loja? Só professor(a) pode ser. Falha de leitura conta
 * como "não": o login segue, só que sem o painel da loja.
 */
async function isStoreOwner({ role, userId }) {
  if (String(role || '').toLowerCase() !== 'seller' || !userId) return false;
  try {
    return (await getStoreOwnerId()) === String(userId).toLowerCase();
  } catch {
    return false;
  }
}

module.exports = { SETTING_KEY, getStoreOwnerId, isStoreOwner };
