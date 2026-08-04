// ════════════════════════════════════════════════════════════════════
// Resolução de segredos com política fail-CLOSED.
//
// Motivação (review Área 2 — Auth & Sessões): os getters de segredo
// antigos só lançavam erro quando o ambiente era EXATAMENTE 'production',
// caindo num literal público ('dev-*-change-me') em qualquer outro caso
// (env ausente, 'preview', 'staging', 'test' de deploy exposto). Como o
// mesmo segredo assina e valida cookies de sessão, isso permitia forjar
// sessões conhecendo o literal versionado.
//
// Regra nova: o segredo é OBRIGATÓRIO em todo ambiente, EXCETO
// desenvolvimento/teste local explícito, onde um fallback determinístico
// é aceitável (o Express local normaliza NODE_ENV='development'; o Vitest
// define NODE_ENV='test').
// ════════════════════════════════════════════════════════════════════

function runtimeEnv() {
  return String(process.env.APP_ENV || process.env.NODE_ENV || '').trim().toLowerCase();
}

/**
 * Ambiente local de desenvolvimento/teste — único onde um fallback de
 * segredo é tolerado. Qualquer outro valor (incl. vazio, 'preview',
 * 'staging', 'production') é tratado como implantado → fail-closed.
 */
function isLocalDevOrTest() {
  const env = runtimeEnv();
  return env === 'development' || env === 'test';
}

/**
 * Retorna o segredo da env; se ausente, só devolve o fallback em
 * desenvolvimento/teste. Fora disso, lança (fail-closed).
 *
 * @param {string} varName      nome da variável (ex.: 'ADMIN_SESSION_SECRET')
 * @param {string} devFallback  valor tolerado só em dev/test
 */
function resolveSecret(varName, devFallback) {
  const secret = String(process.env[varName] || '').trim();
  if (secret) return secret;

  if (isLocalDevOrTest()) {
    return devFallback;
  }

  throw new Error(`${varName} é obrigatório fora de desenvolvimento. Defina o segredo no ambiente.`);
}

/**
 * Cookies de sessão devem ter a flag Secure em qualquer ambiente que não
 * seja dev/teste local (onde o app roda em http://localhost). Unifica o
 * critério com o de exigência de segredo — antes o Secure dependia só de
 * NODE_ENV, divergindo do gate do segredo (APP_ENV||NODE_ENV).
 */
function shouldUseSecureCookie() {
  return !isLocalDevOrTest();
}

module.exports = {
  runtimeEnv,
  isLocalDevOrTest,
  resolveSecret,
  shouldUseSecureCookie,
};
