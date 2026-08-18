// ════════════════════════════════════════════════════════════════════
// Setup do projeto de testes `node` (api/ e lib/) — item P0.3.
//
// POR QUE ESTE ARQUIVO EXISTE
// A suíte fazia rede de verdade: `lib/security-logger.js` chama o Supabase
// dentro de `recordSecurityEvent`, e como vários testes definem
// `process.env.SUPABASE_URL` para um host que não existe, cada asserção
// esperava o DNS falhar antes de continuar. O tempo do teste passava a
// depender da rede da máquina — que é o motivo de os arquivos que falhavam
// por `Test timed out in 5000ms` MUDAREM entre execuções.
//
// Aumentar o `testTimeout` mascararia o sintoma e manteria a causa: uma
// suíte cujo tempo depende de DNS não é determinística em nenhum teto.
//
// O padrão passa a ser "sem rede". Teste que precisa de rede declara isso
// explicitamente, substituindo `global.fetch` no próprio `beforeEach` —
// que é o que `rate-limit.test.js`, `customer-auth-handlers.test.js` e
// `query-authz-regression.test.js` já fazem.
// ════════════════════════════════════════════════════════════════════
import { vi } from 'vitest';

vi.stubGlobal(
  'fetch',
  vi.fn(async (input) => {
    throw new Error(
      `[setupNodeTests] fetch bloqueado: ${String(input)}. ` +
        'Se este teste precisa de rede, defina global.fetch no beforeEach.',
    );
  }),
);
