// ════════════════════════════════════════════════════════════════════
// Regras de VITRINE compartilhadas pelos endpoints públicos do catálogo
// (/api/products, /api/product-details, /api/home-sections, /sitemap.xml).
//
// ── POR QUE ESTE MÓDULO EXISTE (LOJA-02 / CROSS-01) ─────────────────
// A validação de 2026-10-01 encontrou categorias cujo NOME era um UUID
// ("c0da613b-…", "7c48c087-…") nos chips, na sidebar, na pílula dos cards e no
// sitemap. Elas nasceram de um defeito do painel (resolveCategoryId gravava o
// id no campo nome) e o dado já foi limpo, mas a loja não tinha nenhuma defesa:
// qualquer categoria ativa virava filtro público, com o nome que tivesse.
//
// A regra aqui é deliberadamente estreita — só esconde o que NUNCA é um nome
// apresentável (vazio ou com cara de UUID). Não tenta adivinhar "dado de
// teste" pelo texto: isso é decisão editorial do painel, não do código.
// O produto continua visível; só perde o rótulo de categoria.
// ════════════════════════════════════════════════════════════════════

// Mesmo formato de `UUID_LOOKING_NAME` em validation/admin.schemas.js, que
// recusa esse nome na criação/edição pelo painel.
const UUID_LOOKING_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `true` quando o nome pode aparecer para o público como categoria. */
function isPresentableCategoryName(name) {
  const text = String(name ?? '').trim();
  if (!text) return false;
  return !UUID_LOOKING_NAME.test(text);
}

/**
 * Valor do `?categoria=` usado nos links públicos. O slug é o formato estável
 * (é o que o sitemap sempre publicou); o nome fica de reserva para categoria
 * antiga sem slug. O filtro do catálogo (src/hooks/useProductFilters.js)
 * aceita os dois.
 */
function categoryQueryValue(category) {
  const slug = String(category?.slug ?? '').trim();
  if (slug && !UUID_LOOKING_NAME.test(slug)) return slug;
  return String(category?.name ?? '').trim();
}

/**
 * Cache-Control dos endpoints do catálogo (CROSS-04/07/14).
 *
 * Antes: `max-age=300` no NAVEGADOR. Um produto pausado ou com preço novo
 * continuava aparecendo por até 5 min na aba de quem já tinha visitado a loja
 * — e não havia como o painel invalidar esse cache. Agora o navegador sempre
 * revalida (`max-age=0`) e só o CDN segura a resposta, por 60 s, com mais 60 s
 * de `stale-while-revalidate`. Pior caso de defasagem: ~2 min, só na borda.
 */
const CATALOG_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=60';

module.exports = {
  CATALOG_CACHE_CONTROL,
  UUID_LOOKING_NAME,
  categoryQueryValue,
  isPresentableCategoryName,
};
