# 0001 — CommonJS no backend, ESM no frontend

**Status:** aceito · **Data:** 2026-08-13 (registro de decisão já vigente no código)

## Contexto

O repositório mistura dois sistemas de módulo, e isso costuma ser sintoma de descuido — o que
faz um leitor novo querer "unificar". Aqui não é: são dois **runtimes** diferentes no mesmo
repositório.

- `api/`, `lib/`, `routes/`, `middleware/`, `services/`, `utils/`, `validation/`, `server.js`
  rodam em **Node** (funções serverless da Vercel e o Express de desenvolvimento). Usam
  `require`/`module.exports` — 70 arquivos.
- `src/` roda no **browser**, empacotado pelo Vite. Usa `import`/`export` — o padrão da
  plataforma e o que permite tree-shaking.
- `vite.config.js` é ESM; os demais arquivos de configuração na raiz são CommonJS.
- Os testes são ESM e importam módulos CommonJS — o Vite transpila, então funciona.

O `package.json` **não** declara `"type": "module"`, o que torna `.js` = CommonJS por padrão.

## Decisão

Manter os dois. A fronteira é a pasta, não o gosto:

- código que roda em Node → CommonJS;
- código que roda no browser → ESM;
- `eslint.config.js` reflete isso com blocos separados, cada um enxergando **apenas** os
  globais do seu runtime.

## Consequências

**Boas.** A separação de globais no ESLint pega a classe de erro que este layout convida:
`window`/`document` num handler de `api/` (que roda sem DOM) e `process`/`require` num
componente de `src/` (que roda sem CommonJS). Enquanto os dois conjuntos ficavam ligados no
mesmo bloco, os dois erros passavam batido.

**Ruins.** Um utilitário que serviria aos dois lados precisa ser escrito duas vezes ou
duplicado — é o caso de `ERROR_CODES`, que existe em `lib/http.js` (Node) e é espelhado em
`src/constants/error-codes.js` (browser). A duplicação é contida por um teste que falha se o
espelho citar um código que o backend não emite.

Também impede adotar `"type": "module"` sem renomear ~70 arquivos para `.cjs`.

## Alternativas descartadas

**Tudo ESM (`"type": "module"`).** Seria mais moderno e resolveria a duplicação. Custa
renomear ~70 arquivos ou reescrever todos os `require` — inclusive os `require` dinâmicos que
o harness de teste usa para interceptar módulos via `require.cache` (ver
`api/__tests__/money-path-harness.js`, cuja técnica inteira depende de CommonJS). Não é uma
mudança de sintaxe; é uma mudança de estratégia de teste junto.

**Tudo CommonJS.** Impossível no `src/`: o Vite e o React 19 assumem ESM.
