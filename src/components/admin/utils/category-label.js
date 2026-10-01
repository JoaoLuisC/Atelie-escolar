// Nome de categoria seguro para EXIBIR no painel.
//
// As categorias-fantasma (nome = UUID de outra categoria) nasceram do defeito
// ADM-22 da rota de produtos, já corrigido. As que sobraram no banco são dado a
// limpar, mas até lá o painel não deve exibir "d8f53f51-…" como se fosse nome
// (ADM-04/ADM-35): mostra um rótulo que diz o que fazer.
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ORPHAN_CATEGORY_LABEL = 'Categoria sem nome (renomeie)';

export function isUuidLikeName(name) {
  return UUID_LIKE.test(String(name || '').trim());
}

export function categoryLabel(name, fallback = 'Sem categoria') {
  const value = String(name || '').trim();
  if (!value) return fallback;
  return isUuidLikeName(value) ? ORPHAN_CATEGORY_LABEL : value;
}
