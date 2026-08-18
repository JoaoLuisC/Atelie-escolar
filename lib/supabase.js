function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const storageBucket = String(process.env.SUPABASE_STORAGE_BUCKET || '').trim();

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
    storageBucket,
  };
}

// ════════════════════════════════════════════════════════════════════
// REMOVIDOS EM 18/08/2026 (§4 do doc de otimização): `getSupabaseRestUrl` e
// `getSupabaseStorageUrl`, ambos com ZERO consumidores em todo o repositório.
//
// O segundo merece a nota: ele montava URL **pública** de objeto do Storage. O
// projeto entrega arquivo pago por URL **assinada** (`lib/storage-signed-url.js`),
// e `api/download.js` só aceita `download_url` que resolva para o Storage,
// falhando fechado caso contrário. Deixar uma função de URL pública exportada,
// ao lado da assinada, era o convite para alguém "simplificar" o download um
// dia e publicar o catálogo inteiro. Remover foi ganho de segurança, não de
// linhas.
// ════════════════════════════════════════════════════════════════════

function buildTableQuery({
  select = '*',
  filters = [],
  orderBy,
  ascending = true,
  limit,
  offset,
} = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set('select', select);

  for (const filter of filters) {
    if (!filter || !filter.column) continue;
    const operator = String(filter.operator || 'eq').trim();
    const value = filter.value;

    if (value === undefined || value === null) {
      continue;
    }

    searchParams.set(filter.column, `${operator}.${String(value)}`);
  }

  if (orderBy) {
    searchParams.set('order', `${orderBy}.${ascending ? 'asc' : 'desc'}`);
  }

  if (Number.isFinite(limit)) {
    searchParams.set('limit', String(limit));
  }

  if (Number.isFinite(offset)) {
    searchParams.set('offset', String(offset));
  }

  return searchParams;
}

function buildSupabaseHeaders({ useServiceRole = true } = {}) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured');
  }

  return {
    apikey: useServiceRole ? config.serviceRoleKey : config.anonKey,
    Authorization: `Bearer ${useServiceRole ? config.serviceRoleKey : config.anonKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Teto de tempo para qualquer chamada ao PostgREST. Sem isto, um Supabase lento
// ou uma conexão pendurada prende a função serverless até o timeout da
// plataforma, consumindo a invocação inteira e travando o checkout/webhook.
const REQUEST_TIMEOUT_MS = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS || 10_000);

async function supabaseRequest(pathname, options = {}) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured');
  }

  const { useServiceRole = false, headers: extraHeaders, signal, ...fetchOptions } = options;
  const url = `${config.url}/rest/v1/${String(pathname || '').replace(/^\/+/, '')}`;

  let response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      // Um signal explícito do chamador tem precedência; senão, o teto padrão.
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...buildSupabaseHeaders({ useServiceRole }),
        ...(extraHeaders || {}),
      },
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      const timeoutError = new Error(`Supabase request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw err;
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === 'string'
        ? data
        : data?.message || data?.error || `Supabase request failed with status ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function listTableRows(tableName, options = {}) {
  const { useServiceRole = false, ...queryOptions } = options;
  const searchParams = buildTableQuery(queryOptions);
  return supabaseRequest(`${tableName}?${searchParams.toString()}`, {
    method: 'GET',
    useServiceRole,
  });
}

async function getTableRow(tableName, options = {}) {
  const rows = await listTableRows(tableName, { ...options, limit: 1 });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertIntoTable(tableName, rows, { useServiceRole = false } = {}) {
  return supabaseRequest(tableName, {
    method: 'POST',
    useServiceRole,
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  });
}

/**
 * INSERT com tratamento de conflito, em LOTE.
 *
 * ⚠️ `resolution` NÃO é detalhe: com `merge-duplicates` (o padrão do
 * PostgREST) a linha existente é ATUALIZADA com todas as colunas enviadas. Em
 * `download_tokens` isso reescreveria o `token` de um link já enviado por
 * e-mail e — pior — devolveria `used: false` para um token JÁ CONSUMIDO,
 * transformando o download de uso único em reutilizável. Ali o correto é
 * `ignore-duplicates`. Ver §2.3.a do doc de otimização e
 * `api/__tests__/download-single-use.test.js`.
 *
 * @param {string} tableName
 * @param {object|object[]} rows
 * @param {string} [onConflict]  colunas da constraint, ex.: 'order_id,product_id'
 * @param {object} [options]
 * @param {boolean} [options.useServiceRole=false]
 * @param {'merge-duplicates'|'ignore-duplicates'} [options.resolution='merge-duplicates']
 */
async function upsertIntoTable(
  tableName,
  rows,
  onConflict,
  { useServiceRole = false, resolution = 'merge-duplicates' } = {},
) {
  const searchParams = new URLSearchParams();
  if (onConflict) {
    searchParams.set('on_conflict', onConflict);
  }

  return supabaseRequest(
    `${tableName}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
    {
      method: 'POST',
      useServiceRole,
      headers: {
        Prefer: `return=representation,resolution=${resolution}`,
      },
      body: JSON.stringify(rows),
    },
  );
}

async function updateTable(tableName, filters, payload, { useServiceRole = false } = {}) {
  const searchParams = new URLSearchParams(filters || {});
  return supabaseRequest(`${tableName}?${searchParams.toString()}`, {
    method: 'PATCH',
    useServiceRole,
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
}

async function deleteFromTable(tableName, filters = {}, { useServiceRole = false } = {}) {
  const searchParams = new URLSearchParams(filters || {});
  return supabaseRequest(`${tableName}?${searchParams.toString()}`, {
    method: 'DELETE',
    useServiceRole,
    headers: {
      Prefer: 'return=representation',
    },
  });
}

// Wrappers explícitos para handlers que precisam bypassar RLS (admin, webhook, downloads).
// O default das helpers acima é anon, garantindo defesa em profundidade: handlers novos só
// veem dados privados se importarem deste namespace.
const serviceRoleHelpers = {
  listTableRows: (table, options = {}) =>
    listTableRows(table, { ...options, useServiceRole: true }),
  getTableRow: (table, options = {}) => getTableRow(table, { ...options, useServiceRole: true }),
  insertIntoTable: (table, rows) => insertIntoTable(table, rows, { useServiceRole: true }),
  // As opções do chamador são REPASSADAS — `resolution` decide se um conflito
  // atualiza a linha existente ou a preserva, e em `download_tokens` a
  // diferença é entre manter um link de download válido e invalidá-lo (ver
  // §2.3.a). Engolir o 4º argumento aqui tornaria a escolha silenciosamente
  // inerte, que é a pior forma de um parâmetro de segurança falhar.
  upsertIntoTable: (table, rows, onConflict, options = {}) =>
    upsertIntoTable(table, rows, onConflict, { ...options, useServiceRole: true }),
  updateTable: (table, filters, payload) =>
    updateTable(table, filters, payload, { useServiceRole: true }),
  deleteFromTable: (table, filters = {}) =>
    deleteFromTable(table, filters, { useServiceRole: true }),
};

// `buildTableQuery` e `buildSupabaseHeaders` continuam existindo e são usados
// aqui dentro (por `listTableRows` e `supabaseRequest`), mas deixaram de ser
// superfície pública: ninguém os importava, e export sem consumidor é convite a
// montar consulta por fora das helpers que já aplicam RLS e teto de tempo.
module.exports = {
  deleteFromTable,
  getSupabaseConfig,
  getTableRow,
  insertIntoTable,
  listTableRows,
  serviceRoleHelpers,
  supabaseRequest,
  upsertIntoTable,
  updateTable,
};
