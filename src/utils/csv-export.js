/**
 * Export CSV minimalista (regra I4 — Export CSV em qualquer relatório).
 *
 * Sem dependência externa. Lida com:
 * - escape de aspas duplas e vírgulas (RFC 4180)
 * - BOM UTF-8 para Excel abrir com acento correto
 * - download via Blob no browser
 */

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * @param {Array<{key, label}>} columns
 * @param {Array<object>} rows
 * @returns {string}
 */
export function buildCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.label || c.key)).join(',');
  const body = (rows || [])
    .map((row) =>
      columns
        .map((c) => {
          const value = typeof c.format === 'function' ? c.format(row[c.key], row) : row[c.key];
          return escapeCell(value);
        })
        .join(','),
    )
    .join('\n');
  return `${header}\n${body}`;
}

/**
 * Dispara download de CSV no browser. Adiciona BOM (U+FEFF) para Excel
 * abrir com codificação UTF-8 corretamente — sem isso, acentos quebram.
 */
export function downloadCsv({ columns, rows, filename = 'export.csv' }) {
  const csv = buildCsv(columns, rows);
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = globalThis.document?.createElement('a');
  if (!link) return;
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  globalThis.document.body?.appendChild(link);
  link.click();
  globalThis.document.body?.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
