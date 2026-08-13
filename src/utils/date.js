// ════════════════════════════════════════════════════════════════════
// Formatação de data para o browser (regra C4).
//
// Estava em `src/components/admin/utils/format.js`, junto de um helper que É
// específico do admin (`isSessionError`). Nada aqui tem a ver com o painel:
// `formatDateTime` formata um ISO qualquer, e a página de downloads do CLIENTE
// já tinha a própria versão inline da mesma coisa.
//
// A regra C4 é sobre isso: utilitário genérico morando dentro da pasta de um
// componente é utilitário que a próxima tela vai reescrever, porque ninguém
// procura por `formatDateTime` em `components/admin/`.
// ════════════════════════════════════════════════════════════════════

/**
 * `Date` válido, ou `null`. Nunca devolve "Invalid Date", que é o valor que
 * atravessa a formatação inteira e só aparece na tela como `NaN/NaN/NaN`.
 */
export function toDateSafe(value) {
  const dt = new Date(value || 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** `13/08/2026 09:47`. Devolve `-` quando a data não é legível. */
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

/** `13 de agosto de 2026`. Usado no cabeçalho do painel. */
export function formatToday() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
