import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envPrefix: ['VITE_'],
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // ─────────────────────────────────────────────────────────
        // CONFIGURAÇÃO DE CHUNK SE VALIDA CONTRA O ARTEFATO, NUNCA CONTRA A
        // INTENÇÃO (§1.2 do doc de otimização).
        //
        // A versão anterior classificava CERTO — instrumentada durante um
        // build real, ela devolvia `forms` para react-hook-form e `react`
        // para o jsx-runtime. Mesmo assim o `forms-*.js` emitido continha as
        // DUAS coisas, e como todo mundo precisa do jsx-runtime, os 17
        // chunks importavam o `forms` e levavam o react-hook-form de carona —
        // uma biblioteca usada em UM arquivo (CheckoutPage.jsx). O rolldown
        // reagrupa por cima da dica, e ninguém vai olhar o `dist`.
        //
        // Daí a regra: os dois `grep` abaixo são o teste. Rodar depois de
        // toda atualização do Vite/rolldown.
        //
        //   npm run build
        //   grep -l "shouldUnregister"   dist/assets/*.js   # só CheckoutPage-*.js
        //   grep -l "react.transitional" dist/assets/*.js   # só react-*.js
        // ─────────────────────────────────────────────────────────
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // O id chega com barras normais e com o prefixo `node_modules/`
          // mesmo no Windows (medido, não suposto). Casar por FRONTEIRA DE
          // PACOTE evita que `react-hook-form` e `react-helmet-async` caiam
          // no bucket do React por substring, que é o que
          // `id.includes('/react/')` fazia por acidente.
          const pkg = id.split('node_modules/').pop();

          // react + react-dom + scheduler juntos: o scheduler é dependência
          // dura do react-dom e caía no `vendor`, espalhando o runtime do
          // React por três arquivos do caminho crítico.
          if (/^(react|react-dom|scheduler)\//.test(pkg)) return 'react';
          if (pkg.startsWith('react-router')) return 'router';
          if (pkg.startsWith('@supabase/')) return 'supabase';

          // ⚠️ MEDIDO, e diferente do que o §1.2 previa: só TIRAR o bucket
          // `forms` não bastava. Com o `return 'vendor'` genérico do fim, o
          // react-hook-form caía no `vendor` — que também está no caminho
          // crítico —, e os 9,4 KB gz só trocavam de chunk compartilhado.
          // `undefined` é o que devolve a decisão ao rolldown, que então o
          // co-loca com o único importador real (CheckoutPage.jsx:3).
          if (pkg.startsWith('react-hook-form/')) return undefined;

          return 'vendor';
        },
      },
    },
  },
  test: {
    // ─────────────────────────────────────────────────────────────
    // DOIS RUNTIMES, DOIS PROJETOS (item P0.3 / §5.1).
    //
    // Antes: `environment: 'jsdom'` global para os 30 arquivos. Os testes
    // de `api/` e `lib/` são Node puro — HMAC, centavos, parsing de
    // webhook — e montavam um jsdom completo só para existir. O relatório
    // do vitest acusava `environment` agregado na casa das centenas de
    // segundos contra ~24s de teste de verdade.
    //
    // `environmentMatchGlobs` NÃO existe mais no Vitest 4 (conferido em
    // node_modules/vitest/): `test.projects` é o mecanismo atual.
    //
    // ⚠️ `coverage` fica na RAIZ, fora de `projects` — é opção de execução
    // (non-project option) e movê-la para dentro de um projeto desliga os
    // thresholds da regra D2, que é o que trava regressão hoje.
    // ─────────────────────────────────────────────────────────────
    projects: [
      {
        // Sem `extends`: nenhum plugin de browser, nenhum jsdom.
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          // Corta a rede por padrão. Ver o cabeçalho do arquivo.
          setupFiles: ['./src/test/setupNodeTests.js'],
          // Mesma lista de árvores Node do `NODE_FILES` em eslint.config.js:
          // é o mesmo recorte de runtime, e mantê-los alinhados evita que uma
          // suíte nova (routes/, middleware/…) caia sem querer no jsdom.
          include: [
            'handlers/**/*.test.js',
            'lib/**/*.test.js',
            'routes/**/*.test.js',
            'middleware/**/*.test.js',
            'services/**/*.test.js',
            'utils/**/*.test.js',
            'validation/**/*.test.js',
            'scripts/**/*.test.js',
          ],
        },
      },
      {
        // `extends: true` herda os plugins da raiz — o plugin react é o
        // que transforma o JSX das suítes de página.
        extends: true,
        test: {
          name: 'browser',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setupTests.js'],
          include: ['src/**/*.test.{js,jsx}'],
        },
      },
    ],
    coverage: {
      // v8 (e não istanbul): não precisa instrumentar o código, então não
      // altera o que roda no teste — importante aqui porque as funções de
      // api/ são CommonJS carregadas por import dentro do Vitest.
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',

      // Medir só o código de aplicação. Sem isto o relatório mistura
      // configs de build, artefatos e os próprios testes, e qualquer
      // threshold vira número sem significado.
      include: [
        'src/**/*.{js,jsx}',
        'handlers/**/*.js',
        'lib/**/*.js',
        'services/**/*.js',
        'validation/**/*.js',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.{js,jsx}',
        'src/test/**',
        'src/main.jsx',
        '**/node_modules/**',
      ],

      // ─────────────────────────────────────────────────────────────
      // THRESHOLDS — PISO MEDIDO, NÃO META (regra D2).
      //
      // O roteiro de 3 passos que ficava comentado aqui foi executado em
      // 13/08/2026: `@vitest/coverage-v8` instalado, `npm run test:coverage`
      // rodado, e os números abaixo são os MEDIDOS menos ~2pp de folga.
      //
      //   medido            piso
      //   statements 27.30%  25
      //   branches   21.01%  19
      //   functions  23.30%  21
      //   lines      27.78%  25
      //
      // Recalibrado em 13/08/2026 depois das suítes da regra D3 (money, http,
      // logger, coupons, abc-classification, error-codes e o invariante de
      // dinheiro do checkout): 274 → 368 testes.
      //
      // Remedido em 18/08/2026 depois de `test.projects` separar node de jsdom
      // (item P0.3): o número caiu ~1pp, porque com `environment: 'node'` os
      // ramos que só existem sob DOM deixam de ser executados pelas suítes de
      // api/ e lib/. Os pisos não foram baixados então — baixar piso para
      // acomodar queda de medição é o que transforma gate em enfeite.
      //
      // RECALIBRADO em 18/08/2026 com as levas de teste dos itens P4.1 e P4.2
      // (387 → 642 testes: as 11 suítes de lib/ que faltavam, os serviços do
      // front, o cliente HTTP e as páginas). Duas execuções seguidas deram o
      // MESMO número, então a oscilação que motivava a folga de 2pp sumiu
      // junto — a suíte deixou de depender de ordem de execução e de rede:
      //
      //   medida         medido     piso    folga
      //   statements     41,46%      39      2,4pp
      //   branches       31,75%      29      2,7pp
      //   functions      34,63%      32      2,6pp
      //   lines          42,87%      40      2,8pp
      //
      // A intenção é TRAVAR REGRESSÃO, não forçar salto: quem apagar um teste
      // ou acrescentar um módulo grande sem cobertura derruba o CI, mas
      // ninguém é obrigado a escrever teste que não ia escrever. Os números
      // SOBEM junto com as suítes — quando uma leva de testes entrar, recalibre
      // para o novo medido menos a folga, no mesmo commit.
      //
      // A folga de 2pp não é superstição: a cobertura de branches oscila com a
      // ordem de execução em código que lê env (`process.env.NODE_ENV`), e um
      // piso colado no medido transforma essa oscilação em CI vermelho
      // intermitente — que é a forma mais rápida de ensinar o time a ignorar
      // o gate.
      thresholds: {
        statements: 39,
        branches: 29,
        functions: 32,
        lines: 40,
      },
      // ─────────────────────────────────────────────────────────────
    },
  },
});
