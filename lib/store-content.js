// ════════════════════════════════════════════════════════════════════
// CONTEÚDO EDITÁVEL DA LOJA — a home e a descrição comum dos produtos.
//
// Duas chaves de `settings`, gravadas pelo painel (handlers/admin/settings.js)
// e lidas por endpoints PÚBLICOS (handlers/home-content.js e
// handlers/product-details.js):
//
//   • `homeContent`     — blocos da página inicial (ordem, liga/desliga) e os
//                         textos de cada um;
//   • `productDefaults` — texto mostrado em TODA página de produto, abaixo da
//                         descrição própria.
//
// POR QUE A LIMPEZA MORA AQUI, E NÃO SÓ NO FORMULÁRIO
// O que entra aqui sai renderizado para qualquer visitante. O painel é a única
// porta de escrita, mas a sessão admin é o que protege — não a forma do
// formulário. Então o servidor fecha o formato: whitelist de campos, teto de
// tamanho, sem caractere de controle, e link só `https://` ou caminho interno.
// A mesma função roda de novo na LEITURA pública, para que uma linha gravada à
// mão no banco (ou por uma versão antiga do painel) não fure a regra.
//
// OS TEXTOS PADRÃO NÃO MORAM AQUI
// Eles vivem no front (src/constants/home-content.js), que é quem renderiza.
// O servidor guarda só o que a admin salvou; o front completa com o padrão o
// que estiver AUSENTE. String vazia é escolha da admin ("sem subtítulo") e é
// respeitada — por isso a limpeza preserva `''` em vez de descartar.
// ════════════════════════════════════════════════════════════════════

const {
  serviceRoleHelpers: { getTableRow },
} = require('./supabase');

const HOME_BLOCK_IDS = Object.freeze(['hero', 'marquee', 'catalog', 'howItWorks', 'socialProof']);

const LIMITS = Object.freeze({
  short: 80,
  title: 160,
  text: 600,
  url: 500,
  longText: 4000,
  marqueeItems: 12,
  steps: 4,
  stats: 4,
  testimonials: 6,
});

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Texto limpo, ou `undefined` quando o campo não veio como string.
 * `multiline` preserva quebras de linha (\n); o resto vira uma linha só.
 */
function cleanText(value, max, { multiline = false } = {}) {
  if (typeof value !== 'string') return undefined;
  let text = value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '');
  if (!multiline) text = text.replace(/\n+/g, ' ');
  return text.trim().slice(0, max);
}

/**
 * Link de botão: caminho interno (`/produtos`, `/#como-funciona`) ou `https://`.
 * `//host` é recusado de propósito — o navegador o trata como externo.
 */
function cleanLink(value) {
  const text = cleanText(value, LIMITS.url);
  if (text === undefined) return undefined;
  if (text === '') return '';
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  return /^https:\/\/[^\s/]+/i.test(text) ? text : undefined;
}

/** URL externa obrigatoriamente `https://` (imagem do hero, redes sociais). */
function cleanHttpsUrl(value) {
  const text = cleanText(value, LIMITS.url);
  if (text === undefined) return undefined;
  if (text === '') return '';
  return /^https:\/\/[^\s/]+/i.test(text) ? text : undefined;
}

/** Copia só os campos da whitelist que passaram na limpeza. */
function pickFields(source, spec) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const out = {};
  for (const [field, clean] of Object.entries(spec)) {
    const value = clean(source[field]);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

function cleanList(value, max, cleanItem) {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, max)
    .map(cleanItem)
    .filter((item) => item !== undefined);
}

const text = (max, options) => (value) => cleanText(value, max, options);

function cleanBlocks(value) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set();
  const blocks = [];
  for (const item of value) {
    const id = item && typeof item === 'object' ? String(item.id || '') : '';
    if (!HOME_BLOCK_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    blocks.push({ id, enabled: item.enabled !== false });
  }
  return blocks;
}

const HOME_SPEC = {
  blocks: cleanBlocks,
  seo: (value) => pickFields(value, { title: text(LIMITS.title), description: text(LIMITS.text) }),
  hero: (value) =>
    pickFields(value, {
      title: text(LIMITS.title),
      subtitle: text(LIMITS.text),
      ctaLabel: text(LIMITS.short),
      ctaLink: cleanLink,
      imageUrl: cleanHttpsUrl,
      imageAlt: text(LIMITS.title),
    }),
  marquee: (value) =>
    pickFields(value, {
      items: (items) =>
        cleanList(items, LIMITS.marqueeItems, (item) => cleanText(item, 40) || undefined),
    }),
  catalog: (value) =>
    pickFields(value, {
      eyebrow: text(LIMITS.short),
      title: text(LIMITS.title),
      ctaLabel: text(LIMITS.short),
    }),
  howItWorks: (value) =>
    pickFields(value, {
      eyebrow: text(LIMITS.short),
      title: text(LIMITS.title),
      subtitle: text(LIMITS.text),
      steps: (steps) =>
        cleanList(steps, LIMITS.steps, (step) =>
          pickFields(step, { title: text(LIMITS.short), text: text(LIMITS.text) }),
        ),
      infoTitle: text(LIMITS.short),
      infoText: text(LIMITS.text),
    }),
  socialProof: (value) =>
    pickFields(value, {
      eyebrow: text(LIMITS.short),
      title: text(LIMITS.title),
      subtitle: text(LIMITS.text),
      stats: (stats) =>
        cleanList(stats, LIMITS.stats, (stat) =>
          pickFields(stat, { value: text(20), label: text(40) }),
        ),
      testimonials: (items) =>
        cleanList(items, LIMITS.testimonials, (item) =>
          pickFields(item, {
            name: text(LIMITS.short),
            role: text(LIMITS.short),
            text: text(LIMITS.text),
          }),
        ),
      instagramUrl: cleanHttpsUrl,
      instagramLabel: text(LIMITS.short),
      tiktokUrl: cleanHttpsUrl,
      tiktokLabel: text(LIMITS.short),
    }),
};

const PRODUCT_DEFAULTS_SPEC = {
  sharedDescriptionTitle: text(LIMITS.title),
  sharedDescription: text(LIMITS.longText, { multiline: true }),
};

/**
 * Limpa um objeto pela especificação de topo. Devolve o valor limpo e a lista
 * de campos de topo que vieram e foram descartados (desconhecidos ou de tipo
 * errado) — o painel usa o mesmo sinal no audit log do adminConfig.
 */
function sanitizeWithSpec(input, spec) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { value: {}, ignored: [] };
  }
  const value = {};
  const ignored = [];
  for (const [field, raw] of Object.entries(input)) {
    const clean = spec[field];
    const result = clean ? clean(raw) : undefined;
    if (result === undefined) ignored.push(field);
    else value[field] = result;
  }
  return { value, ignored };
}

function sanitizeHomeContent(input) {
  return sanitizeWithSpec(input, HOME_SPEC);
}

function sanitizeProductDefaults(input) {
  return sanitizeWithSpec(input, PRODUCT_DEFAULTS_SPEC);
}

function parseSettingValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/** Lê uma chave de `settings` (service role) e devolve o JSON, ou null. */
async function readSettingValue(key) {
  const row = await getTableRow('settings', {
    select: 'setting_key,setting_value',
    filters: [{ column: 'setting_key', value: key }],
  });
  return row ? parseSettingValue(row.setting_value) : null;
}

/**
 * Descrição comum pronta para o endpoint público: `null` quando não há texto,
 * para a página não desenhar um bloco vazio.
 */
function toPublicSharedDescription(productDefaults) {
  const { value } = sanitizeProductDefaults(productDefaults);
  const body = value.sharedDescription || '';
  if (!body) return null;
  return { title: value.sharedDescriptionTitle || '', text: body };
}

module.exports = {
  HOME_BLOCK_IDS,
  LIMITS,
  sanitizeHomeContent,
  sanitizeProductDefaults,
  readSettingValue,
  toPublicSharedDescription,
};
