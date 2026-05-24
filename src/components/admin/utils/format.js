export function toDateSafe(value) {
  const dt = new Date(value || 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function formatDateTime(value) {
  const dt = toDateSafe(value);
  if (!dt) return '-';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatToday() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function isSessionError(error) {
  return String(error?.message || '').toLowerCase().includes('sessao admin');
}
