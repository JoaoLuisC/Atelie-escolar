// ════════════════════════════════════════════════════════════════════
// Conteúdo PADRÃO da página inicial — e a regra de como ele se mistura com o
// que a admin salvou na aba "Página da loja" do painel.
//
// O servidor (lib/store-content.js) guarda só o que foi salvo, já limpo. Aqui
// mora o resto: os textos que a home sempre teve, que valem enquanto a admin
// não trocar. A regra de mistura é por CAMPO e respeita string vazia — apagar
// o subtítulo e salvar significa "sem subtítulo", não "volte ao padrão".
// ════════════════════════════════════════════════════════════════════

export const HOME_BLOCKS = Object.freeze([
  { id: 'hero', label: 'Banner principal (topo da página)' },
  { id: 'marquee', label: 'Faixa de palavras que desliza' },
  { id: 'catalog', label: 'Vitrine de produtos' },
  { id: 'howItWorks', label: 'Passo a passo da compra' },
  { id: 'socialProof', label: 'Depoimentos, números e redes sociais' },
]);

export const DEFAULT_HOME_CONTENT = Object.freeze({
  blocks: HOME_BLOCKS.map(({ id }) => ({ id, enabled: true })),
  seo: {
    title: 'Materiais educativos digitais para professores',
    description:
      'Painéis, banners e atividades pedagógicas em PDF, prontos para imprimir. Download imediato após o pagamento. Criados por professores, para professores.',
  },
  hero: {
    title: 'Painéis e recursos pedagógicos feitos com *cuidado* e *criatividade*',
    subtitle: '',
    ctaLabel: 'Ver Produtos',
    ctaLink: '/produtos',
    imageUrl: '',
    imageAlt: '',
  },
  marquee: {
    items: ['BANNERS', 'PAINÉIS', 'ATIVIDADES', 'LEMBRANCINHAS', 'KITS'],
  },
  catalog: {
    eyebrow: 'Catálogo',
    title: 'É exatamente isso que você precisa 👇',
    ctaLabel: 'Ver catálogo completo',
  },
  howItWorks: {
    eyebrow: 'Simples assim',
    title: 'Do clique à impressão *em minutos*',
    subtitle: 'Sem cadastro obrigatório. Sem espera. Sem complicação.',
    steps: [
      {
        title: 'Escolha',
        text: 'Navegue pelo catálogo e encontre atividades práticas para tornar o aprendizado dos seus alunos mais prazeroso.',
      },
      { title: 'Pague', text: 'Finalize seu pedido com segurança e confirmação rápida.' },
      {
        title: 'Baixe na hora',
        text: 'Acesso liberado imediatamente após a aprovação do pagamento.',
      },
      {
        title: 'Imprima',
        text: 'Os arquivos estão prontos para uso no formato PDF com acesso ilimitado e permanente.',
      },
    ],
    infoTitle: 'PDF em alta resolução',
    infoText: 'Arquivos prontos para impressão, com acesso ilimitado e permanente.',
  },
  socialProof: {
    eyebrow: 'Como a escola usa',
    title: 'Professoras de todo o Brasil *nos acompanham nas redes* 📲',
    subtitle: 'Veja como escolas de todo o Brasil estão usando nossos materiais.',
    stats: [
      { value: '4,2k', label: 'seguidores' },
      { value: '48k', label: 'curtidas' },
      { value: '98%', label: 'aprovação' },
      { value: '5k+', label: 'pedidos' },
    ],
    testimonials: [
      {
        name: 'Carla M.',
        role: 'Professora, SP',
        text: '"Comprei, baixei e mandei para a gráfica em menos de 5 minutos! 😍"',
      },
      {
        name: 'Ana R.',
        role: 'Diretora, MG',
        text: '"Os banners de formatura ficaram lindos. Todos elogiaram o design!"',
      },
      {
        name: 'Juliana F.',
        role: 'Coord. Pedagógica, RJ',
        text: '"Recebi os arquivos na hora e consegui organizar tudo sem complicação!"',
      },
    ],
    instagramUrl: 'https://www.instagram.com/profamarciarcardoso',
    instagramLabel: '@profamarciarcardoso',
    tiktokUrl: 'https://www.tiktok.com/@profamarciarcardoso',
    tiktokLabel: '@profamarciarcardoso',
  },
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Campo a campo: o salvo vale quando PRESENTE (inclusive `''` e `[]`). */
function mergeSection(defaults, saved) {
  if (!isPlainObject(saved)) return { ...defaults };
  const out = { ...defaults };
  for (const field of Object.keys(defaults)) {
    if (field in saved && saved[field] !== undefined && saved[field] !== null) {
      out[field] = saved[field];
    }
  }
  return out;
}

/**
 * Ordem e liga/desliga dos blocos: a ordem salva vale; bloco que a versão do
 * painel não conhecia (ou que faltou) entra no fim, ligado — assim um bloco
 * novo do código aparece na home em vez de sumir em silêncio.
 */
function mergeBlocks(saved) {
  const known = new Set(HOME_BLOCKS.map((block) => block.id));
  const out = [];
  const seen = new Set();
  if (Array.isArray(saved)) {
    for (const block of saved) {
      const id = String(block?.id || '');
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, enabled: block.enabled !== false });
    }
  }
  for (const { id } of HOME_BLOCKS) {
    if (!seen.has(id)) out.push({ id, enabled: true });
  }
  return out;
}

/** Conteúdo completo da home: padrão + o que a admin salvou. */
export function mergeHomeContent(saved) {
  const source = isPlainObject(saved) ? saved : {};
  return {
    blocks: mergeBlocks(source.blocks),
    seo: mergeSection(DEFAULT_HOME_CONTENT.seo, source.seo),
    hero: mergeSection(DEFAULT_HOME_CONTENT.hero, source.hero),
    marquee: mergeSection(DEFAULT_HOME_CONTENT.marquee, source.marquee),
    catalog: mergeSection(DEFAULT_HOME_CONTENT.catalog, source.catalog),
    howItWorks: mergeSection(DEFAULT_HOME_CONTENT.howItWorks, source.howItWorks),
    socialProof: mergeSection(DEFAULT_HOME_CONTENT.socialProof, source.socialProof),
  };
}

/**
 * Quebra um título em partes normais e destacadas. A admin marca o destaque
 * com asteriscos: `feitos com *cuidado*` → "cuidado" sai colorido.
 * Asterisco sem par fica como texto.
 */
export function splitHighlights(value) {
  const textValue = String(value || '');
  const parts = [];
  let last = 0;
  for (const match of textValue.matchAll(/\*([^*]+)\*/g)) {
    if (match.index > last)
      parts.push({ text: textValue.slice(last, match.index), highlight: false });
    parts.push({ text: match[1], highlight: true });
    last = match.index + match[0].length;
  }
  if (last < textValue.length) parts.push({ text: textValue.slice(last), highlight: false });
  return parts;
}

/** Título sem as marcas de destaque — para SEO, alt e leitores de tela. */
export function stripHighlights(value) {
  return String(value || '').replace(/\*([^*]+)\*/g, '$1');
}
