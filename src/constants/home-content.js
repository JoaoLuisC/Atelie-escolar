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

/**
 * Tamanho recomendado de CADA imagem que a loja aceita, num lugar só: o
 * painel mostra a dica ao lado do envio e avisa quando a imagem enviada foge
 * muito do recomendado. Largura × altura em pixels; `maxBytes` é o teto do
 * arquivo que o painel aceita (o Storage tem o teto dele por bucket).
 */
export const IMAGE_SLOTS = Object.freeze({
  logo: {
    width: 512,
    height: 512,
    maxBytes: 300 * 1024,
    hint: 'Quadrada, 512 × 512 px, PNG com fundo transparente. Aparece com 40 px na barra e 36 px no rodapé.',
  },
  heroImage: {
    width: 1200,
    height: 900,
    maxBytes: 1024 * 1024,
    hint: '1200 × 900 px (4:3). Aparece inteira ao lado do texto, sem cortes. JPG, PNG ou WebP até 1 MB.',
  },
  bannerDesktop: {
    width: 1920,
    height: 640,
    maxBytes: 1024 * 1024,
    hint: 'Computador: 1920 × 640 px (3:1), JPG ou WebP até 1 MB.',
  },
  bannerTablet: {
    width: 1024,
    height: 512,
    maxBytes: 800 * 1024,
    hint: 'Tablet: 1024 × 512 px (2:1). Vazio = usa a do computador.',
  },
  bannerMobile: {
    width: 800,
    height: 800,
    maxBytes: 600 * 1024,
    hint: 'Celular: 800 × 800 px (quadrada). Vazio = usa a do tablet ou do computador.',
  },
  floating: {
    width: 200,
    height: 200,
    maxBytes: 200 * 1024,
    hint: '200 × 200 px, PNG com fundo transparente, até 200 kB cada.',
  },
  product: {
    width: 1200,
    height: 1200,
    maxBytes: 500 * 1024,
    hint: '1200 × 1200 px (quadrada): preenche os cards e a página do produto sem cortes. Foto 4:3? 1200 × 900 px aparece inteira, com faixas. JPG, PNG ou WebP até 500 kB.',
  },
});

export const HERO_MAX_GRADIENT_STOPS = 4;
export const HERO_MAX_FLOATING_IMAGES = 8;

export const DEFAULT_HOME_CONTENT = Object.freeze({
  blocks: HOME_BLOCKS.map(({ id }) => ({ id, enabled: true })),
  navigation: { title: 'Profa. Marciar Cardoso', size: 'medium', logoUrl: '', showTitle: true },
  footer: {
    title: 'Profa. Marciar Cardoso',
    description:
      'Materiais gráficos digitais profissionais e editáveis para festas, eventos e decoração escolar. Download instantâneo após a aprovação do pagamento.',
    navigationTitle: 'Navegação',
    contactTitle: 'Contato',
    instagramUrl: 'https://instagram.com/profamarciarcardoso',
    facebookUrl: '',
    pinterestUrl: '',
    whatsappUrl: '',
    whatsappLabel: '',
    logoUrl: '',
    copyright: '© 2026 Profa. Marciar Cardoso. Todos os direitos reservados.',
    contactEmail: '',
  },
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
    imagePosition: 'right',
    imageAnimation: 'none',
    backgroundStyle: 'default',
    backgroundColor: '#ede9fe',
    backgroundColorEnd: '#e0f2fe',
    // Degradê com até 4 cores. Vazio = usa backgroundColor/backgroundColorEnd
    // (os dois campos antigos continuam valendo para o que já foi salvo).
    backgroundStops: [],
    gradientAngle: 135,
    bannerSize: 'medium',
    textAlign: 'left',
    showIcons: true,
    icons: '',
    iconSize: 'medium',
    // Imagens no lugar dos emojis flutuantes (PNG transparente).
    floatingImages: [],
    // Foto retangular ocupando o banner inteiro, uma por tamanho de tela.
    // Com `desktop` preenchida, o banner vira a foto; `textOverlay` põe o
    // título e o botão por cima dela.
    banner: { desktop: '', tablet: '', mobile: '', alt: '', textOverlay: true },
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
    subtitle: 'Crie sua conta e acesse seus materiais após a confirmação do pagamento.',
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
      out[field] = isPlainObject(defaults[field])
        ? mergeSection(defaults[field], saved[field])
        : saved[field];
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
    navigation: mergeSection(DEFAULT_HOME_CONTENT.navigation, source.navigation),
    footer: mergeSection(DEFAULT_HOME_CONTENT.footer, source.footer),
    seo: mergeSection(DEFAULT_HOME_CONTENT.seo, source.seo),
    hero: mergeSection(DEFAULT_HOME_CONTENT.hero, source.hero),
    marquee: mergeSection(DEFAULT_HOME_CONTENT.marquee, source.marquee),
    catalog: mergeSection(DEFAULT_HOME_CONTENT.catalog, source.catalog),
    howItWorks: mergeSection(DEFAULT_HOME_CONTENT.howItWorks, source.howItWorks),
    socialProof: mergeSection(DEFAULT_HOME_CONTENT.socialProof, source.socialProof),
  };
}

/**
 * As cores do degradê do banner: `backgroundStops` (2 a 4 cores) quando a
 * admin preencheu; senão os dois campos antigos. Nunca menos de duas.
 */
export function heroGradientStops(hero) {
  const stops = (Array.isArray(hero?.backgroundStops) ? hero.backgroundStops : [])
    .filter(Boolean)
    .slice(0, HERO_MAX_GRADIENT_STOPS);
  if (stops.length >= 2) return stops;
  const first = stops[0] || hero?.backgroundColor || DEFAULT_HOME_CONTENT.hero.backgroundColor;
  return [first, hero?.backgroundColorEnd || DEFAULT_HOME_CONTENT.hero.backgroundColorEnd];
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
