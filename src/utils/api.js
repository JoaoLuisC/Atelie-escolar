export function getApiBaseUrl() {
  return globalThis.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
}

/**
 * Normaliza o corpo da resposta para o formato que as telas consomem.
 *
 * ── O SHIM E POR QUE ELE AINDA EXISTE ───────────────────────────────
 * A regra A1 padronizou o erro do backend em `{ success:false,
 * error:{ code, message } }`. Antes disso conviviam TRÊS formatos, e esta
 * função existia só para o cliente sobreviver aos dois primeiros.
 *
 * Ela continua achatando `error` para string — de propósito, e não por
 * inércia: dezenas de telas leem `data.error` como texto para jogar num
 * `setStatus({ message })`. Trocar todas por `data.error.message` seria
 * churn sem ganho.
 *
 * O que MUDA é que o `code` deixou de se perder: ele sai em `errorCode`,
 * e é por ele que o cliente deve ramificar (regra A2). O caso concreto que
 * motivou isso está em `src/components/admin/utils/format.js`, que decidia se
 * a sessão tinha expirado com `includes('sessao admin')` — reescrever a frase
 * quebrava o re-login em silêncio.
 */
export async function parseJson(response) {
  try {
    const data = await response.json();
    if (!data || typeof data !== 'object') return {};

    const error = data.error;
    if (error && typeof error === 'object' && typeof error.message === 'string') {
      return { ...data, error: error.message, errorCode: error.code || null };
    }

    return data;
  } catch (parseError) {
    if (import.meta.env?.DEV) {
      console.warn('[api] resposta sem JSON valido:', parseError.message);
    }
    return {};
  }
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
