// ════════════════════════════════════════════════════════════════════
// LOG ESTRUTURADO — porta única do backend (regra F1).
//
// ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────
// A medição de 13/08/2026 encontrou 79 chamadas de `console.*` no backend,
// das quais 22 sem nem o prefixo `[modulo]` que as outras adotaram por
// convenção. Em paralelo, `lib/security-logger.js` já emitia JSON estruturado
// adequado. Ou seja: dois formatos de log na mesma stack, e só um deles
// filtrável nos Vercel Function Logs.
//
// A diferença não é estética. `console.error('[download] falha:', err.message)`
// vira uma linha de texto: para responder "quantas falhas de download houve
// hoje, e em quais pedidos?" é preciso escrever regex sobre log. Com
// `log.error('falha_ao_devolver_o_claim_do_token', { orderId, reason })` a mesma
// pergunta é um filtro por campo.
//
// ── POR QUE NÃO É O security-logger ─────────────────────────────────
// `recordSecurityEvent` PERSISTE em `public.security_events` e dispara alerta
// externo — ele é para evento de SEGURANÇA, que alguém vai investigar. Usá-lo
// para log operacional encheria a tabela (e o webhook de alerta) de ruído, e a
// primeira consequência seria alguém desligar o alerta.
//
// Este módulo é o outro lado: só stdout, sem I/O, sem poder derrubar o handler.
// A regra prática:
//   • "um humano precisa ser avisado disto?"        → recordSecurityEvent
//   • "preciso conseguir investigar isto depois?"   → este logger
//
// ── FORMATO ─────────────────────────────────────────────────────────
//   { level, event, ts, ...contexto }
//
// `event` é um slug snake_case estável — o análogo do `code` da regra A2 para
// o lado do log. Mensagem em prosa é para humano e muda; o slug é o que se
// filtra.
// ════════════════════════════════════════════════════════════════════

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

const DEFAULT_LEVEL = 'info';

/**
 * Nível mínimo emitido. `LOG_LEVEL` permite subir ou baixar o volume numa
 * investigação sem redeploy de código (a Vercel aplica env var em runtime).
 *
 * ── POR QUE NÃO HÁ EXCEÇÃO PARA `NODE_ENV=test` ─────────────────────
 * A primeira versão elevava o piso para `error` durante os testes, para não
 * poluir o relatório do Vitest com os warns que as suítes disparam de
 * propósito. Foi revertido: `lib/__tests__/rate-limit.test.js` AFIRMA sobre o
 * evento `rate_limit_exceeded` lendo a saída de log, e o piso o apagava — o
 * teste passou a verificar o silêncio em vez do comportamento.
 *
 * O problema maior é de princípio: um logger que se comporta diferente em
 * teste é a mesma classe de divergência que já custou caro neste projeto (o
 * rate limit que só existia no Express de dev — ver lib/rate-limit.js). Ruído
 * no relatório é incômodo; teste que valida um caminho que não existe em
 * produção é armadilha. Quem quiser silêncio numa suíte específica define
 * `LOG_LEVEL=error` naquele arquivo.
 */
function minimumLevel() {
  const configured = String(process.env.LOG_LEVEL || '')
    .trim()
    .toLowerCase();
  if (LEVELS[configured]) return LEVELS[configured];
  return LEVELS[DEFAULT_LEVEL];
}

/**
 * Campos que nunca podem ir para o log, em nenhum nível.
 *
 * Não é paranoia: `download_tokens.token` entrega o produto pago e
 * `order_code` é a capability que libera PII em verify-payment. Um log é lido
 * por mais gente (e guardado por mais tempo) que o banco.
 */
const REDACTED_KEYS = new Set([
  'token',
  'password',
  'senha',
  'secret',
  'authorization',
  'cookie',
  'access_token',
  'refresh_token',
  'service_role_key',
  'apikey',
]);

const MAX_VALUE_LENGTH = 500;

// Profundidade além da qual o valor vira string. Existe só para conter ciclo e
// payload gigante — não para achatar objeto de contexto legítimo.
const MAX_DEPTH = 4;

/**
 * Sanitiza um valor PRESERVANDO a estrutura.
 *
 * ── POR QUE NÃO SE SERIALIZA OBJETO AQUI ────────────────────────────
 * A primeira versão fazia `JSON.stringify(value)` para qualquer objeto, o que
 * transformava `{ properties: { bucket, limit } }` em
 * `"properties": "{\"bucket\":…}"` — uma string com JSON dentro, no meio de uma
 * linha que já é JSON. Isso derrota o motivo da regra F1: quem consulta o log
 * precisaria reparsear o campo para filtrar por `properties.bucket`.
 *
 * `lib/__tests__/rate-limit.test.js` pegou isso ao afirmar
 * `expect(events[0].properties).toMatchObject({ bucket: … })`.
 *
 * Agora a recursão desce até MAX_DEPTH aplicando a redação em CADA nível — o
 * que também conserta um buraco da versão anterior: um segredo aninhado
 * (`{ auth: { token } }`) escapava da redação, porque ela só olhava as chaves
 * do primeiro nível antes de serializar o resto inteiro.
 */
function sanitizeValue(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return value.message;

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[array(${value.length})]`;
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '[object]';
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase())
        ? '[redacted]'
        : sanitizeValue(nested, depth + 1);
    }
    return out;
  }

  return String(value).slice(0, MAX_VALUE_LENGTH);
}

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : sanitizeValue(value);
  }
  return out;
}

function emit(level, event, context) {
  if (LEVELS[level] < minimumLevel()) return;

  const line = JSON.stringify({
    level,
    event: String(event || 'unknown_event'),
    ts: new Date().toISOString(),
    ...sanitizeContext(context),
  });

  // `console.error` para error, `console.warn` para warn: a Vercel separa os
  // streams, e um erro que sai em stdout não aparece no filtro de erro dela.
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Logger com escopo de módulo. O `module` entra em todo evento, então o filtro
 * "tudo do download" não depende de ninguém lembrar de prefixar a mensagem.
 *
 * @example
 *   const log = createLogger('download');
 *   log.error('falha_ao_devolver_o_claim_do_token', { orderId, reason: err.message });
 *   // {"level":"error","event":"falha_ao_devolver_o_claim_do_token","module":"download","orderId":42,…}
 */
function createLogger(moduleName) {
  const base = { module: String(moduleName || 'app') };
  return {
    debug: (event, context) => emit('debug', event, { ...base, ...context }),
    info: (event, context) => emit('info', event, { ...base, ...context }),
    warn: (event, context) => emit('warn', event, { ...base, ...context }),
    error: (event, context) => emit('error', event, { ...base, ...context }),
  };
}

module.exports = {
  LEVELS,
  createLogger,
  // Exportados para teste.
  sanitizeContext,
};
