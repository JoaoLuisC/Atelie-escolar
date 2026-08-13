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

function getSupabaseRestUrl(pathname) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured');
  }

  const cleanPath = String(pathname || '').replace(/^\/+/, '');
  return `${config.url}/rest/v1/${cleanPath}`;
}

function getSupabaseStorageUrl(pathname) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured');
  }

  const cleanPath = String(pathname || '').replace(/^\/+/, '');
  const bucket = config.storageBucket || 'public';
  return `${config.url}/storage/v1/object/public/${bucket}/${cleanPath}`;
}

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

async function selectFromTable(tableName, query = '*', { useServiceRole = false } = {}) {
  const searchParams = new URLSearchParams({ select: query });
  return supabaseRequest(`${tableName}?${searchParams.toString()}`, {
    method: 'GET',
    useServiceRole,
  });
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

async function upsertIntoTable(tableName, rows, onConflict, { useServiceRole = false } = {}) {
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
        Prefer: 'return=representation,resolution=merge-duplicates',
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
  selectFromTable: (table, query) => selectFromTable(table, query, { useServiceRole: true }),
  listTableRows: (table, options = {}) =>
    listTableRows(table, { ...options, useServiceRole: true }),
  getTableRow: (table, options = {}) => getTableRow(table, { ...options, useServiceRole: true }),
  insertIntoTable: (table, rows) => insertIntoTable(table, rows, { useServiceRole: true }),
  upsertIntoTable: (table, rows, onConflict) =>
    upsertIntoTable(table, rows, onConflict, { useServiceRole: true }),
  updateTable: (table, filters, payload) =>
    updateTable(table, filters, payload, { useServiceRole: true }),
  deleteFromTable: (table, filters = {}) =>
    deleteFromTable(table, filters, { useServiceRole: true }),
};

module.exports = {
  buildTableQuery,
  buildSupabaseHeaders,
  deleteFromTable,
  getSupabaseConfig,
  getSupabaseRestUrl,
  getSupabaseStorageUrl,
  getTableRow,
  insertIntoTable,
  listTableRows,
  selectFromTable,
  serviceRoleHelpers,
  supabaseRequest,
  upsertIntoTable,
  updateTable,
};
