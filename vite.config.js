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
            if (id.includes('react-dom') || id.includes('react/jsx') || id.includes('/react/')) return 'react';
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setupTests.js'],
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
      include: ['src/**/*.{js,jsx}', 'api/**/*.js', 'lib/**/*.js', 'services/**/*.js', 'validation/**/*.js'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.{js,jsx}',
        'src/test/**',
        'src/main.jsx',
        '**/node_modules/**',
      ],

      // ─────────────────────────────────────────────────────────────
      // THRESHOLDS — DESLIGADOS PROPOSITALMENTE.
      //
      // O pacote `@vitest/coverage-v8` NÃO está instalado neste repo
      // (nem como dependência transitiva do vitest 4), então não foi
      // possível medir a cobertura real para calibrar números honestos.
      // Ligar threshold no chute quebraria o CI sem informação nenhuma.
      //
      // Para ativar:
      //   1. npm i -D @vitest/coverage-v8
      //   2. npm run test:coverage   → anote os % de "All files"
      //   3. descomente o bloco abaixo com os números MEDIDOS menos ~2pp
      //      de folga. A intenção é TRAVAR REGRESSÃO, não forçar salto:
      //      o piso deve ser o que já existe hoje, e sobe junto com os
      //      testes do caminho do dinheiro (webhook approved, reentrega,
      //      download de uso único) descritos na §5 da revisão.
      //
      // thresholds: {
      //   lines: 0,
      //   functions: 0,
      //   branches: 0,
      //   statements: 0,
      // },
      // ─────────────────────────────────────────────────────────────
    },
  },
});
