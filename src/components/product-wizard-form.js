// ════════════════════════════════════════════════════════════════════
// A LÓGICA DE DADOS DO ProductWizard, fora do JSX.
//
// POR QUE ESTE ARQUIVO EXISTE
// `ProductWizard.jsx` tinha 883 linhas e ZERO teste. Dentro dele moravam duas
// coisas de natureza diferente: o formulário (JSX, estado, upload) e as regras
// que decidem **o que vai para o banco** — a normalização do produto carregado
// para edição, a limpeza no submit e a validação que libera cada passo.
//
// A segunda metade é pura: entra objeto, sai objeto. Ela decide o conteúdo das
// colunas `benefits`, `faq` e `reviews` de `products` e se um produto pode ser
// salvo — e estava inalcançável para teste, porque só existia dentro de um
// componente que ninguém monta em suíte. Aqui ela é chamável direto.
//
// Fica ao LADO do componente, e não em `src/utils/`, porque é utilitário de um
// componente específico — é o que a regra C4 pede, e a mesma razão pela qual
// `src/components/admin/utils/` continua existindo.
//
// ⚠️ Isto foi um MOVE, não uma reescrita: o comportamento é o que já estava lá,
// inclusive as assimetrias de propósito (`normalize*` devolve `rating` como
// string para o `<input>`; `clean*` devolve número ou `null` para o banco).
// Se algo aqui parecer inconsistente, confira o teste antes de "corrigir".
// ════════════════════════════════════════════════════════════════════

// ─── Normalização ao carregar um produto existente para edição ────────
// Tolerante de propósito: o que está gravado em `products.benefits` pode vir de
// versões antigas do painel (benefit como string solta, campo ausente, null).
export function normalizeBenefits(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) =>
    typeof item === 'string'
      ? { icon: '', label: item }
      : { icon: String(item?.icon || '').trim(), label: String(item?.label || '').trim() },
  );
}

export function normalizeFaq(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    question: String(item?.question || '').trim(),
    answer: String(item?.answer || '').trim(),
  }));
}

export function normalizeReviews(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    author: String(item?.author || '').trim(),
    role: String(item?.role || '').trim(),
    location: String(item?.location || '').trim(),
    text: String(item?.text || '').trim(),
    // String, e não número: este valor alimenta um `<input>` controlado, e
    // `undefined`/número ali produz o aviso de campo não-controlado do React.
    rating: item?.rating == null || item?.rating === '' ? '' : String(item.rating),
  }));
}

// ─── Limpeza no submit: descarta linhas vazias e converte tipos ───────
// O par de cada `normalize*`. A linha em branco que o editor deixa na tela não
// pode virar objeto vazio dentro do JSON gravado.
export function cleanBenefits(items) {
  return items
    .map((item) => ({
      icon: String(item.icon || '').trim(),
      label: String(item.label || '').trim(),
    }))
    .filter((item) => item.label);
}

export function cleanFaq(items) {
  return items
    .map((item) => ({
      question: String(item.question || '').trim(),
      answer: String(item.answer || '').trim(),
    }))
    .filter((item) => item.question && item.answer);
}

export function cleanReviews(items) {
  return items
    .map((item) => ({
      author: String(item.author || '').trim(),
      role: String(item.role || '').trim(),
      location: String(item.location || '').trim(),
      text: String(item.text || '').trim(),
      rating: item.rating === '' || item.rating == null ? null : Number(item.rating),
    }))
    .filter((item) => item.author && item.text);
}

/**
 * Nome legível de um arquivo a partir da URL (ou do `bucket/path` curto que o
 * upload assinado devolve para bucket privado).
 */
export function deriveDisplayName(url) {
  if (!url) return '';
  try {
    // Path curto bucket/path
    if (!url.startsWith('http')) {
      const parts = url.split('/');
      return parts[parts.length - 1] || url;
    }
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last);
  } catch {
    return url.slice(0, 60);
  }
}

/**
 * O que cada passo do wizard exige para liberar o próximo.
 *
 * Devolve `null` quando o passo está válido, ou a mensagem a exibir. Devolver
 * a MENSAGEM em vez de chamar o toast é o que tira a regra de dentro do
 * componente: quem decide como avisar é o JSX, quem decide o que é válido é
 * esta função — e só a segunda parte precisa de teste.
 *
 * @param {number} step
 * @param {object} formData
 * @param {string[]} images
 * @returns {string|null}
 */
export function validateProductStep(step, formData = {}, images = []) {
  const texto = (valor) => String(valor ?? '').trim();

  if (step === 0) {
    if (!texto(formData.name)) return 'Nome do produto é obrigatório';
    if (!texto(formData.category)) return 'Categoria é obrigatória';
    if (!texto(formData.description)) return 'Descrição é obrigatória';
  }

  if (step === 1) {
    const validImages = (images || []).filter((img) => texto(img));
    if (validImages.length === 0) return 'Pelo menos uma imagem é obrigatória';
    if (!texto(formData.downloadUrl)) return 'URL de download é obrigatória';
  }

  if (step === 2) {
    if (!formData.price || Number.parseFloat(formData.price) <= 0) {
      return 'Preço válido é obrigatório';
    }
  }

  return null;
}
