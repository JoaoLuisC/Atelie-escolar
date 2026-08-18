#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Subset da fonte bootstrap-icons — §1.4 do doc de otimização.
//
// ── O QUE ISTO RESOLVE ──────────────────────────────────────────────
// O `index.html` carregava `bootstrap-icons.min.css` do `cdn.jsdelivr.net`:
// uma folha RENDER-BLOCKING, de um terceiro, que puxa a família inteira
// (~134 KB de woff2 para ~2.000 glifos). Três custos somados: DNS+TLS extra
// para um host a mais no caminho crítico, ~131 KB de fonte para usar 5% dela,
// e uma dependência de disponibilidade externa em cima da primeira pintura.
//
// ── A ARMADILHA QUE ESTE SCRIPT EXISTE PARA EVITAR ──────────────────
// O doc contou 66 ícones varrendo `bi bi-*` no código. Esse grep vê só as
// classes ESCRITAS POR EXTENSO. Metade do painel monta o ícone dinamicamente:
//
//     <i className={`bi bi-${icon}`} />        // AdminLayout, MiniStat, KpiCard…
//     { icon: 'bar-chart-line-fill', … }       // configuração de aba
//
// A varredura completa (literais + valores de `icon` em configuração e props)
// dá 107. Um subset com 66 glifos teria apagado ~40 ícones do painel — e sem
// erro nenhum: a fonte simplesmente não desenha, e o `<i>` fica em branco.
//
// Por isso a lista é GERADA e versionada em `scripts/icons-usados.json`, e o
// teste `scripts/__tests__/icon-subset.test.js` falha se o código passar a usar
// um ícone que não está nela.
//
// ── COMO RODAR ──────────────────────────────────────────────────────
//     npm run icons:subset
//
// Regenera `public/fonts/bootstrap-icons-subset.woff2` e a folha
// `public/fonts/bootstrap-icons-subset.css`. Os dois são VERSIONADOS: assim o
// build de produção não depende de ferramenta de subsetting nem de rede.
// ════════════════════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');

const subsetFont = require('subset-font');

const RAIZ = path.resolve(__dirname, '..');
const FONTE_ORIGINAL = path.join(
  RAIZ,
  'node_modules',
  'bootstrap-icons',
  'font',
  'fonts',
  'bootstrap-icons.woff2',
);
const MAPA_CODEPOINTS = path.join(
  RAIZ,
  'node_modules',
  'bootstrap-icons',
  'font',
  'bootstrap-icons.json',
);
const LISTA_USADOS = path.join(__dirname, 'icons-usados.json');
const DESTINO_DIR = path.join(RAIZ, 'public', 'fonts');
const DESTINO_FONTE = path.join(DESTINO_DIR, 'bootstrap-icons-subset.woff2');
const DESTINO_CSS = path.join(DESTINO_DIR, 'bootstrap-icons-subset.css');

function lerJson(arquivo) {
  return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
}

async function main() {
  const codepoints = lerJson(MAPA_CODEPOINTS);
  const usados = lerJson(LISTA_USADOS);

  const desconhecidos = usados.filter((nome) => codepoints[nome] === undefined);
  if (desconhecidos.length) {
    // FALHA FECHADA: gerar um subset sem o glifo pedido produziria um ícone
    // invisível em produção, sem erro em lugar nenhum.
    console.error(
      `[icons] ícone(s) inexistente(s) no bootstrap-icons: ${desconhecidos.join(', ')}`,
    );
    process.exit(1);
  }

  const texto = usados.map((nome) => String.fromCodePoint(codepoints[nome])).join('');
  const original = fs.readFileSync(FONTE_ORIGINAL);
  const subset = await subsetFont(original, texto, { targetFormat: 'woff2' });

  fs.mkdirSync(DESTINO_DIR, { recursive: true });
  fs.writeFileSync(DESTINO_FONTE, subset);

  const regras = usados
    .map((nome) => `.bi-${nome}::before { content: "\\${codepoints[nome].toString(16)}"; }`)
    .join('\n');

  fs.writeFileSync(
    DESTINO_CSS,
    `/* GERADO por scripts/build-icon-subset.js — não edite à mão.
 * ${usados.length} ícones, extraídos de src/ e index.html (literais + dinâmicos).
 * Regenerar: npm run icons:subset
 */
@font-face {
  font-family: 'bootstrap-icons';
  /* font-display: block — o mesmo do bootstrap-icons original, e é o certo
   * para fonte de ÍCONE: os glifos vivem em codepoints de uso privado, e com
   * \`swap\` o navegador pintaria a fonte de fallback nesse intervalo, o que
   * para PUA é uma caixa vazia (tofu). \`block\` segura o \`::before\` invisível
   * por até 3s e troca sem piscar. Com 8,7 KB da mesma origem, o intervalo é
   * imperceptível na prática. */
  font-display: block;
  src: url('./bootstrap-icons-subset.woff2') format('woff2');
}

.bi::before,
[class^='bi-']::before,
[class*=' bi-']::before {
  display: inline-block;
  font-family: 'bootstrap-icons' !important;
  font-style: normal;
  font-weight: normal !important;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  vertical-align: -0.125em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

${regras}
`,
    'utf8',
  );

  const antes = original.length;
  const depois = subset.length;
  console.log(
    `[icons] ${usados.length} glifos · ${(antes / 1024).toFixed(1)} KB → ` +
      `${(depois / 1024).toFixed(1)} KB (−${(100 - (depois / antes) * 100).toFixed(1)}%)`,
  );
}

main().catch((error) => {
  console.error('[icons] falhou:', error.message);
  process.exit(1);
});
