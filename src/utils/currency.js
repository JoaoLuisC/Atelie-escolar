// ════════════════════════════════════════════════════════════════════
// FORMATAÇÃO DE VALOR — três destinos, três funções nomeadas (regra C3).
//
// ── A CORREÇÃO DE 13/08/2026 ────────────────────────────────────────
// A primeira redação da regra C3 dizia "dinheiro na tela só através de
// formatPrice" e apontava 7 sites como violação. A varredura estava errada:
// nenhum dos 7 era tela.
//
//   • 6 estavam em colunas de CSV (AnalysisTab) — e `R$ 1.234,56` num CSV
//     QUEBRA a leitura numérica do Excel pt-BR, que espera vírgula decimal
//     sem símbolo e sem separador de milhar.
//   • 1 estava no JSON-LD de produto (ProductDetailsPage) — `schema.org/Offer`
//     exige `price` com PONTO decimal e sem símbolo; formatar como moeda ali
//     invalida o rich snippet no Google.
//
// Ou seja: os três formatos são diferentes porque os três DESTINOS são
// diferentes, e unificar teria sido uma regressão. O problema real era outro
// e continua valendo: só o formato de tela tinha nome. Os outros dois eram
// expressões inline repetidas, sem nada dizendo por que divergem — o que é
// exatamente o convite para alguém "consertar" a divergência.
//
// Regra corrigida: todo valor formatado sai de uma destas três funções. Qual
// delas usar é decidido pelo DESTINO, não pelo gosto.
// ════════════════════════════════════════════════════════════════════

/**
 * TELA. `R$ 1.234,56` — com símbolo e separador de milhar.
 * Use em qualquer lugar que uma pessoa lê o valor.
 */
export function formatPrice(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

/**
 * CSV para Excel pt-BR. `1234,56` — vírgula decimal, sem símbolo, sem milhar.
 *
 * Sem separador de milhar de propósito: o ponto seria lido como decimal por
 * planilhas configuradas em locale diferente, transformando 1.234,56 em 1,23.
 * Serve tanto para dinheiro quanto para percentual (mesma forma numérica).
 */
export function formatCsvNumber(value) {
  return (Number(value) || 0).toFixed(2).replace('.', ',');
}

/**
 * DADO ESTRUTURADO (JSON-LD, APIs). `1234.56` — ponto decimal, sem símbolo.
 *
 * `schema.org/Offer.price` exige este formato; qualquer outra coisa faz o
 * Google descartar o rich snippet em silêncio.
 */
export function formatMachinePrice(value) {
  return (Number(value) || 0).toFixed(2);
}
