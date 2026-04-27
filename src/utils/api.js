export function getApiBaseUrl() {
  return globalThis.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
}

export async function parseJson(response) {
  try {
    const data = await response.json();
    if (data && typeof data.error === 'object' && data.error && typeof data.error.message === 'string') {
      return {
        ...data,
        error: data.error.message,
      };
    }

    return data;
  } catch {
    return {};
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

function buildApiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${String(path || '')}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions = { ...options };
    delete fetchOptions.timeoutMs;
    const response = await fetch(buildApiUrl(path), {
      ...fetchOptions,
      signal: controller.signal,
    });
    const data = await parseJson(response);
    return { response, data };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Tempo de resposta da API excedido. Tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
