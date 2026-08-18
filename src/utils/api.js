export function getApiBaseUrl() {
  return globalThis.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
}

/**
 * Corpo da resposta, tal como o backend o emitiu.
 *
 * ── O SHIM SAIU, E ISSO É O MARCO DO FIM DA MIGRAÇÃO A1 ─────────────
 * Até aqui esta função ACHATAVA `error` de objeto para string e expunha o
 * código separado em `errorCode`. Ela existia porque conviviam três formatos
 * de erro na API, e o CONTRIBUTING elegeu a remoção dela como a prova
 * verificável de que a migração da regra A1 tinha terminado:
 *
 *   "Quando A1 estiver aplicada, esse shim sai."
 *
 * Ele saiu. Todo erro da API agora é `{ success: false, error: { code,
 * message } }`, emitido por `fail()` de `lib/http.js` — conferido com
 * `grep -rn "error: '" api lib routes`, que só retorna comentários e o tipo
 * `{ value | error }` das funções de coerção de `api/admin/settings.js`, que
 * nunca vira corpo HTTP.
 *
 * Consequência para quem escreve tela: a mensagem para a pessoa está em
 * `data.error?.message`; o código para a máquina, em `data.error?.code`. Nunca
 * ramifique pelo texto (regra A2) — foi assim que o re-login do admin ficou
 * quebrado por um acento.
 */
export async function parseJson(response) {
  try {
    const data = await response.json();
    if (!data || typeof data !== 'object') return {};
    return data;
  } catch (parseError) {
    if (import.meta.env?.DEV) {
      console.warn('[api] resposta sem JSON valido:', parseError.message);
    }
    return {};
  }
}

/** Mensagem legível do envelope de erro, ou `''` quando não há erro. */
export function errorMessageOf(data) {
  return String(data?.error?.message || '');
}

/**
 * Constrói um `Error` que PRESERVA o `code` do envelope (regra A2).
 *
 * ── POR QUE ISTO PRECISOU EXISTIR (item P0.1) ───────────────────────
 * O `code` chegava do backend, mas cada serviço fazia
 * `throw new Error(data.error)` e o descartava ali mesmo. A cadeia do
 * re-login do admin tinha DUAS rupturas: o backend não emitia o código E o
 * serviço jogava fora o que chegasse. Consertar só a primeira deixaria o
 * bug de pé com o envelope parecendo correto — que é a pior combinação.
 *
 * Mora aqui, e não em cada serviço, porque é sobre o ENVELOPE, que é o
 * assunto deste módulo. Duas cópias deste helper em `src/services/` seriam
 * a divergência que a regra C2 existe para evitar.
 *
 * @param {object} data              corpo já normalizado por `parseJson`
 * @param {string} fallbackMessage   texto quando a resposta não traz um
 * @param {object} [options]
 * @param {string|null} [options.defaultCode]  código quando a resposta não traz um
 */
export function apiError(data, fallbackMessage, { defaultCode = null } = {}) {
  const error = new Error(errorMessageOf(data) || fallbackMessage);
  error.code = data?.error?.code || defaultCode;
  return error;
}

const DEFAULT_TIMEOUT_MS = 15000;

function buildApiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${String(path || '')}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

/**
 * Compõe o AbortSignal do chamador com o do timeout.
 *
 * ── POR QUE ISTO EXISTE (regra C1) ──────────────────────────────────
 * `apiRequest` sempre criou o próprio `AbortController` e o passava adiante,
 * o que SOBRESCREVIA qualquer `signal` recebido em `options`. Consequência: as
 * telas que precisam cancelar a própria requisição — `DownloadsPage`, que faz
 * polling e precisa abortar ao desmontar — não podiam usar o cliente único e
 * caíam em `fetch` cru, abrindo mão do timeout justamente onde ele mais
 * importa (polling numa rede ruim ficava pendurado para sempre).
 *
 * Com a composição, o pedido é cancelado pelo que vier primeiro: o timeout ou
 * o chamador. `AbortSignal.any` faz isso nativamente; o fallback cobre
 * navegador antigo sem a API.
 */
function composeSignals(externalSignal, timeoutSignal) {
  if (!externalSignal) return timeoutSignal;

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([externalSignal, timeoutSignal]);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (externalSignal.aborted || timeoutSignal.aborted) abort();
  externalSignal.addEventListener('abort', abort, { once: true });
  timeoutSignal.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

/**
 * Cliente HTTP ÚNICO do frontend (regra C1).
 *
 * `fetch` cru não passa em review: ele abre mão do timeout de 15s e da
 * normalização de `parseJson`. Se precisar cancelar, passe `options.signal` —
 * ele é composto com o timeout, não substituído.
 *
 * @param {string} path            caminho relativo a /api (ex.: '/products')
 * @param {object} [options]       igual ao `fetch`, mais `timeoutMs`
 * @param {number} [options.timeoutMs=15000]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ response: Response, data: object }>}
 */
export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _ignored, signal: externalSignal, ...fetchOptions } = options;

    const response = await fetch(buildApiUrl(path), {
      ...fetchOptions,
      signal: composeSignals(externalSignal, controller.signal),
    });
    const data = await parseJson(response);
    return { response, data };
  } catch (error) {
    if (error?.name === 'AbortError') {
      // Aborto do CHAMADOR não é falha: quem cancelou sabe por quê (desmontou a
      // tela, trocou de pedido). Repassar o AbortError original deixa o
      // chamador distinguir isso de um estouro de tempo, que É falha e precisa
      // virar mensagem na tela.
      if (options.signal?.aborted) throw error;
      throw new Error('Tempo de resposta da API excedido. Tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
