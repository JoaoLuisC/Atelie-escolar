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

function buildTableQuery({ select = '*', filters = [], orderBy, ascending = true, limit, offset } = {}) {
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

async function supabaseRequest(pathname, options = {}) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured');
  }

  const url = `${config.url}/rest/v1/${String(pathname || '').replace(/^\/+/, '')}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildSupabaseHeaders({ useServiceRole: true }),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : data?.message || data?.error || `Supabase request failed with status ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function selectFromTable(tableName, query = '*') {
  const searchParams = new URLSearchParams({ select: query });
  return supabaseRequest(`${tableName}?${searchParams.toString()}`, {
    method: 'GET',
  });
}

async function listTableRows(tableName, options = {}) {
  const searchParams = buildTableQuery(options);
  return supabaseRequest(`${tableName}?${searchParams.toString()}`, {
    method: 'GET',
  });
}

async function getTableRow(tableName, options = {}) {
  const rows = await listTableRows(tableName, { ...options, limit: 1 });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertIntoTable(tableName, rows) {
  return supabaseRequest(tableName, {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  });
}

async function upsertIntoTable(tableName, rows, onConflict) {
  const searchParams = new URLSearchParams();
  if (onConflict) {
    searchParams.set('on_conflict', onConflict);
  }

  return supabaseRequest(`${tableName}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`, {
    method: 'POST',
    headers: {
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
}

async function updateTable(tableName, filters, payload) {
  const searchParams = new URLSearchParams(filters || {});
  return supabaseRequest(`${tableName}?${searchParams.toString()}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
}

async function deleteFromTable(tableName, filters = {}) {
  const searchParams = new URLSearchParams(filters || {});
  return supabaseRequest(`${tableName}?${searchParams.toString()}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=representation',
    },
  });
}

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
  supabaseRequest,
  upsertIntoTable,
  updateTable,
};