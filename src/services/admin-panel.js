import { apiRequest } from '../utils/api';

async function request(path, options = {}) {
  const { response, data } = await apiRequest(path, {
    credentials: 'include',
    ...options,
  });

  if (response.status === 401) {
    throw new Error('Sessao admin expirada. Faca login novamente.');
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || 'Falha na operacao admin.');
  }

  return data;
}

export async function fetchAdminDashboardData() {
  return request('/admin-dashboard');
}

export async function fetchAdminCategories() {
  return request('/admin-categories');
}

export async function createAdminCategory(payload) {
  return request('/admin-categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateAdminCategory(payload) {
  return request('/admin-categories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminCategory(id) {
  return request(`/admin-categories?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchAdminUsers() {
  return request('/admin/users');
}

export async function updateAdminUser(payload) {
  return request('/admin/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminUser(id) {
  return request(`/admin/users?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchAdminOrders(status = '') {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/admin-orders${query}`);
}

export async function updateAdminOrder(payload) {
  return request('/admin-orders', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminOrder(id) {
  return request(`/admin-orders?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function patchAdminProduct(payload) {
  return request('/admin-products', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminSetting(key) {
  return request(`/admin-settings?key=${encodeURIComponent(key)}`);
}

export async function saveAdminSetting({ key, value }) {
  return request('/admin-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
}

export async function fetchAdminFunnel(days = 30) {
  const query = Number.isFinite(Number(days)) ? `?days=${encodeURIComponent(days)}` : '';
  return request(`/admin-funnel${query}`);
}

export async function fetchAdminSegments() {
  return request('/admin-segments');
}

export async function fetchAdminAbcProducts({ period = 'month', categoryId = null } = {}) {
  const params = new URLSearchParams({ period });
  if (categoryId) params.set('categoryId', String(categoryId));
  return request(`/admin-abc-products?${params.toString()}`);
}

export async function fetchAdminAbcCustomers({ period = 'quarter' } = {}) {
  return request(`/admin-abc-customers?period=${encodeURIComponent(period)}`);
}

export async function fetchAdminCohort({ months = 12 } = {}) {
  return request(`/admin-cohort?months=${encodeURIComponent(months)}`);
}

export async function fetchAdminKpis({ window = 12 } = {}) {
  return request(`/admin-kpis?window=${encodeURIComponent(window)}`);
}
