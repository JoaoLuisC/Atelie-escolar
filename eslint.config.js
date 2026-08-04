// Flat config mínimo do ESLint — objetivo é ter a base, não impor regras
// agressivas que quebrem o código existente. Escrito em CommonJS porque o
// projeto não declara "type": "module" no package.json (api/ e lib/ usam
// require/module.exports).
//
// Requer devDeps ainda NÃO instaladas (rode `npm i -D` antes de `npx eslint`):
//   eslint  eslint-plugin-react-hooks  globals
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...(reactHooks.configs.recommended && reactHooks.configs.recommended.rules),
    },
  },
];
