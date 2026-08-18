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
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router')) return 'router';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('react-hook-form')) return 'forms';
            if (id.includes('react-dom') || id.includes('react/jsx') || id.includes('/react/'))
              return 'react';
            return 'vendor';
          }
          return undefined;
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
          include: ['api/**/*.test.js', 'lib/**/*.test.js'],
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
        'api/**/*.js',
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
        statements: 25,
        branches: 19,
        functions: 21,
        lines: 25,
      },
      // ─────────────────────────────────────────────────────────────
    },
  },
});
