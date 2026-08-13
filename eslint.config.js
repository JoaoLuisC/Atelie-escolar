// ════════════════════════════════════════════════════════════════════
// Flat config do ESLint — separado POR AMBIENTE DE EXECUÇÃO.
//
// Por que separar (achado §5 da revisão 2026-08-12): a config anterior
// fundia `globals.browser` e `globals.node` num único bloco. Com os dois
// conjuntos ligados ao mesmo tempo, `window`/`document` num handler de
// `api/` (que roda em Node, sem DOM) passava batido, e `process`/`require`
// num componente de `src/` (que roda no browser, sem CommonJS) também.
// Justamente os dois erros que o runtime dual dev/prod deste projeto
// convida a cometer. Agora cada árvore só enxerga os globais que realmente
// existem no seu runtime.
//
// Escrito em CommonJS porque o package.json não declara "type": "module"
// (api/, lib/, routes/, middleware/ e server.js usam require/module.exports).
//
// SOBRE `js.configs.recommended`: o pacote `@eslint/js` NÃO está instalado
// neste repositório (nem como dependência transitiva do eslint 10) e a
// diretriz é não adicionar dependência nova sem necessidade real. Então as
// regras da categoria "problem" que interessam estão listadas manualmente
// em BASE_RULES abaixo. Se um dia `@eslint/js` entrar no projeto, dá para
// trocar BASE_RULES por `require('@eslint/js').configs.recommended.rules`.
// ════════════════════════════════════════════════════════════════════

const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

// ── Stubs para plugins que o código referencia mas que nunca foram
// instalados ────────────────────────────────────────────────────────
// Há comentários `// eslint-disable-next-line sonarjs/cognitive-complexity`
// (api/admin-dashboard.js, api/admin-login.js, src/pages/CustomerAuthPage.jsx,
// src/pages/DownloadsPage.jsx) e `jsx-a11y/img-redundant-alt`
// (src/components/ProductWizard.jsx) herdados de uma configuração antiga.
// Desde o ESLint 9, citar uma regra inexistente num disable vira ERRO
// ("Definition for rule ... was not found") e derruba o lint inteiro.
// Registrar os nomes como no-op mantém o lint utilizável sem puxar
// eslint-plugin-sonarjs/eslint-plugin-jsx-a11y só por causa de comentários.
// Efeito colateral desejado: o ESLint passa a apontar esses disables como
// "Unused eslint-disable directive" (warning), o que é o convite para
// apagá-los — a correção definitiva é remover os comentários.
const noopRule = { meta: { schema: [] }, create: () => ({}) };
const legacyDisableStubs = {
  sonarjs: { rules: { 'cognitive-complexity': noopRule } },
  'jsx-a11y': { rules: { 'img-redundant-alt': noopRule } },
};

// Subconjunto de `eslint:recommended` — só regras que apontam BUG, nunca
// estilo (estilo é responsabilidade do Prettier, ver .prettierrc.json).
const BASE_RULES = {
  // Referência a identificador inexistente. É a regra que dá sentido à
  // separação de globals acima.
  'no-undef': 'error',

  // Variável/import/parâmetro morto. `_` como prefixo é a convenção já
  // usada no repo para parâmetro exigido pela assinatura mas não lido
  // (ex.: `(_req, res)` em server.js).
  'no-unused-vars': [
    'error',
    {
      args: 'after-used',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    },
  ],

  // Erros de digitação que o runtime só mostra em produção.
  'no-const-assign': 'error',
  'no-class-assign': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-global-assign': 'error',
  'no-obj-calls': 'error',
  'no-this-before-super': 'error',
  'no-setter-return': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-unsafe-finally': 'error',
  'no-unreachable': 'error',

  // Objeto/estrutura com chave ou caso duplicado — costuma ser merge mal
  // resolvido e silenciosamente descarta metade da configuração.
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-else-if': 'error',
  'no-duplicate-case': 'error',
  'no-redeclare': 'error',

  // Comparações e regex que não fazem o que parecem.
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-compare-neg-zero': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-invalid-regexp': 'error',
  'no-control-regex': 'error',
  'no-useless-backreference': 'error',
  'no-misleading-character-class': 'error',

  // Fluxo suspeito.
  'no-cond-assign': ['error', 'always'],
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-fallthrough': 'error',
  'no-sparse-arrays': 'error',
  'no-unexpected-multiline': 'error',
  'no-shadow-restricted-names': 'error',
  'no-ex-assign': 'error',
  'no-useless-catch': 'error',
  'require-yield': 'error',

  // Nunca deve chegar a um deploy.
  'no-debugger': 'error',
  'no-with': 'error',

  // Aviso, não erro: aparecem em código legítimo com alguma frequência e
  // não queremos que o `npm run lint` do CI vire ruído.
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-useless-escape': 'warn',
  'no-prototype-builtins': 'warn',
  'no-irregular-whitespace': 'warn',
};

// Árvores que rodam em Node (funções serverless da Vercel, Express de dev,
// scripts de manutenção). Tudo CommonJS.
const NODE_FILES = [
  'api/**/*.js',
  'lib/**/*.js',
  'routes/**/*.js',
  'middleware/**/*.js',
  'services/**/*.js',
  'utils/**/*.js',
  'validation/**/*.js',
  'scripts/**/*.js',
  'server.js',
];

module.exports = [
  {
    // `dist/` e `tcc-build/` são artefatos gerados; `public/` é servido
    // como está e pode conter snippets de terceiros.
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'tcc-build/**',
      'public/**',
      '.vercel/**',
    ],
  },

  // ── Frontend (browser, ESM, JSX) ────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        // `import.meta.env` do Vite não é global; já é sintaxe de módulo.
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      ...legacyDisableStubs,
    },
    rules: {
      ...BASE_RULES,
      ...(reactHooks.configs.recommended && reactHooks.configs.recommended.rules),

      // O `recommended` do eslint-plugin-react-hooks 7 já embute os
      // diagnósticos do React Compiler em nível de ERRO. Eles apontam
      // oportunidades de performance/pureza, não quebra funcional, e o
      // código atual dispara ~18 deles. Subir isso para bloqueante numa
      // primeira introdução de lint só ensinaria a rodar `--no-verify`.
      // Ficam como WARNING para virar backlog visível; as regras clássicas
      // (rules-of-hooks) seguem em ERROR, e as demais regras do compiler
      // que hoje não disparam seguem em ERROR para barrar código novo.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/incompatible-library': 'warn',
    },
  },

  // ── Backend (Node, CommonJS) ────────────────────────────────────────
  {
    files: NODE_FILES,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      ...legacyDisableStubs,
    },
    rules: {
      ...BASE_RULES,
      // `console` é o canal de log das funções serverless (Vercel Function
      // Logs) — não é debug esquecido.
      'no-console': 'off',
    },
  },

  // ── Configs na raiz ─────────────────────────────────────────────────
  // vite.config.js é ESM (usa import/export); os demais são CommonJS.
  {
    files: ['vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: BASE_RULES,
  },
  {
    files: ['eslint.config.js', 'postcss.config.js', 'tailwind.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: BASE_RULES,
  },

  // ── Testes (Vitest) ─────────────────────────────────────────────────
  // Aplicado DEPOIS dos blocos acima para somar os globais do Vitest
  // (describe/it/expect/vi/beforeEach/...) ao ambiente já definido —
  // `globals: true` no vite.config.js os injeta sem import explícito.
  // Testes de api/ e lib/ também precisam dos globais de Node.
  {
    files: ['**/__tests__/**/*.{js,jsx}', '**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      // sourceType 'module' mesmo para os testes de api/ e lib/: eles são
      // executados pelo Vitest (Vite transpila), então usam `import` para
      // carregar módulos CommonJS. Sem isto o parser morre na 1ª linha de
      // 12 suítes de backend.
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      // Fixtures e mocks frequentemente declaram mais do que usam num
      // caso específico; erro aqui atrapalha mais do que ajuda.
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
