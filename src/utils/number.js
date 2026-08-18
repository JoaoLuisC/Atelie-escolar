// ════════════════════════════════════════════════════════════════════
// FORMATAÇÃO DE NÚMERO E PERCENTUAL — regra C3, item P5.2.
//
// A regra C3 ("todo valor formatado sai de uma função nomeada") foi aplicada
// em 13/08/2026 SÓ para dinheiro. Número e percentual continuaram soltos: a
// remedição de 18/08 achou 15 expressões inline em 5 abas do admin, nos dois
// mesmos padrões repetidos — `toFixed(1)` para percentual e
// `toLocaleString('pt-BR')` para contagem.
//
// ── POR QUE ISTO NÃO É "ORGANIZAÇÃO PELA ORGANIZAÇÃO" ───────────────
// Um dos 15 sites, `AnalysisTab.jsx:455`, já REIMPLEMENTAVA o
// `.replace('.', ',')` de `src/utils/currency.js`. Quando a mesma conversão
// aparece escrita à mão em dois arquivos, a próxima pessoa escreve a terceira
// versão — e é aí que uma delas passa a arredondar diferente da outra na
// mesma tela.
//
// Fica em `src/utils/number.js` e não em `currency.js` porque não é dinheiro:
// misturar os dois convidaria a formatar contagem com `formatPrice` e a
// aparecer "R$ 1.234" onde deveria estar o número de sessões.
// ════════════════════════════════════════════════════════════════════

/**
 * PERCENTUAL para tela. `12,3%` — uma casa decimal, vírgula, com o sinal.
 *
 * O `%` faz parte da função de propósito: sem ele, cada chamada decidia se o
 * símbolo vinha no JSX ou não, e é assim que uma aba mostra "12,3" e a vizinha
 * "12,3%" para o mesmo dado.
 *
 * @param {number} value        valor JÁ em percentual (12.34, não 0.1234)
 * @param {object} [options]
 * @param {number} [options.decimals=1]
 * @param {boolean} [options.withSign=false]  prefixa `+` em valores positivos,
 *   para variação percentual, onde a direção é a informação principal
 * @param {string} [options.fallback='—']     o que mostrar quando não há número
 */
export function formatPercent(value, { decimals = 1, withSign = false, fallback = '—' } = {}) {
  const numero = Number(value);
  if (!Number.isFinite(numero)) return fallback;

  const corpo = `${Math.abs(numero).toFixed(decimals).replace('.', ',')}%`;

  if (numero < 0) return `-${corpo}`;
  return withSign ? `+${corpo}` : corpo;
}

/**
 * CONTAGEM para tela. `1.234` — separador de milhar pt-BR, sem decimais.
 *
 * `fallback` existe porque contagem ausente e contagem ZERO são coisas
 * diferentes: "—" diz "não medimos", "0" diz "medimos e não houve". Mostrar 0
 * para dado ausente é inventar informação num painel de decisão.
 */
export function formatCount(value, { fallback = '—' } = {}) {
  const numero = Number(value);
  if (!Number.isFinite(numero)) return fallback;

  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(numero);
}

/**
 * RAZÃO / múltiplo. `1,8x` — usada em LTV/CAC e afins.
 *
 * Separada de `formatPercent` porque o sufixo muda o significado: `1,8%` e
 * `1,8x` são leituras completamente diferentes do mesmo número.
 */
export function formatRatio(value, { decimals = 1, fallback = '—' } = {}) {
  const numero = Number(value);
  if (!Number.isFinite(numero)) return fallback;

  return `${numero.toFixed(decimals).replace('.', ',')}x`;
}

/**
 * PERCENTUAL para CSV. `12,3` — vírgula decimal, SEM o símbolo.
 *
 * Mesma razão de `formatCsvNumber` em `currency.js`: o `%` faz o Excel pt-BR
 * tratar a célula como texto, e a coluna deixa de somar.
 */
export function formatCsvPercent(value, { decimals = 1 } = {}) {
  const numero = Number(value);
  if (!Number.isFinite(numero)) return '';

  return numero.toFixed(decimals).replace('.', ',');
}
