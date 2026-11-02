// ════════════════════════════════════════════════════════════════════
// IA NA ÁREA DO PROFESSOR — sugestões que só saem quando ele clica.
//
// As tarefas (o Estudo de vendas mora em lib/sales-study.js):
//   productCopy — descrição de venda, benefícios e FAQ de um material
//   productSeo  — nome melhor, título/descrição para o Google e faixa de
//                 preço comparando com o catálogo da própria loja
//   home*       — "Aprimorar seção" da Página da loja, uma tarefa por parte
//                 (homeHero, homeCatalog, homeHowItWorks, homeSocialProof,
//                 homeFooter, homeSeo)
//
// Nada é gravado aqui: a sugestão volta para a tela, o professor revisa e só
// então usa — e o que ele usar passa pelas mesmas regras de sempre ao salvar.
// A IA recebe só dados da loja (nomes, categorias, preços), nunca dados de
// cliente.
// ════════════════════════════════════════════════════════════════════

const {
  serviceRoleHelpers: { listTableRows },
} = require('./supabase');
const { callGeminiJson, cleanList, cleanText } = require('./gemini');

const STORE_CONTEXT = `Você ajuda uma professora brasileira que vende materiais pedagógicos DIGITAIS (painéis, banners, atividades, lembrancinhas e kits em PDF para imprimir) na loja online dela. Quem compra são outras professoras, da educação infantil ao ensino médio. O arquivo é baixado na hora, depois do pagamento pelo Mercado Pago.

REGRAS GERAIS
- Português do Brasil, tom acolhedor e profissional, frases curtas, sem exageros ("o melhor do mundo") e sem prometer o que o material não tem.
- Use só as informações recebidas. Se faltar detalhe (quantidade de páginas, tamanho), escreva de forma que a professora complete, sem inventar números.
- Nada de emojis.`;

/**
 * Fábrica das tarefas da Página da loja: mesma instrução de contexto, campos
 * de texto curto com teto (`fields`), e, quando a parte tem lista, o pedaço
 * extra de schema + normalização (`extraSchema`, `extraNormalize`).
 */
function homeSection(fieldInstructions, fields, extraSchema = {}, extraNormalize = () => ({})) {
  const properties = Object.fromEntries(
    Object.keys(fields).map((key) => [key, { type: 'STRING' }]),
  );
  return {
    prompt: `${STORE_CONTEXT}

TAREFA
Melhore os textos de UMA parte da página inicial da loja, a partir do nome da loja, dos produtos e categorias que ela vende e dos textos atuais dessa parte ("textosAtuais"). Mantenha o sentido do que já existe; melhore clareza e apelo.
${fieldInstructions}`,
    schema: {
      type: 'OBJECT',
      properties: { ...properties, ...extraSchema },
      required: Object.keys(fields),
    },
    normalize: (raw) => ({
      ...Object.fromEntries(
        Object.entries(fields).map(([key, max]) => [key, cleanText(raw?.[key], max)]),
      ),
      ...extraNormalize(raw),
    }),
  };
}

const TASKS = Object.freeze({
  productCopy: {
    prompt: `${STORE_CONTEXT}

TAREFA
Escreva o texto de venda de um material a partir do nome, da categoria e do rascunho de descrição (que pode estar vazio).
- descricao: 2 a 4 parágrafos curtos: para que serve, como usar em sala, o que vem no arquivo, sugestão de impressão.
- beneficios: até 4 frases curtíssimas (máx. 6 palavras cada), ex.: "Pronto para imprimir".
- faq: até 4 perguntas que uma professora faria antes de comprar, com respostas curtas.`,
    schema: {
      type: 'OBJECT',
      properties: {
        descricao: { type: 'STRING' },
        beneficios: { type: 'ARRAY', items: { type: 'STRING' } },
        faq: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { pergunta: { type: 'STRING' }, resposta: { type: 'STRING' } },
            required: ['pergunta', 'resposta'],
          },
        },
      },
      required: ['descricao', 'beneficios', 'faq'],
    },
    normalize: (raw) => ({
      descricao: cleanText(raw?.descricao, 3000),
      beneficios: cleanList(raw?.beneficios, 4, 60),
      faq: (Array.isArray(raw?.faq) ? raw.faq : [])
        .map((item) => ({
          pergunta: cleanText(item?.pergunta, 200),
          resposta: cleanText(item?.resposta, 600),
        }))
        .filter((item) => item.pergunta && item.resposta)
        .slice(0, 4),
    }),
  },

  productSeo: {
    prompt: `${STORE_CONTEXT}

TAREFA
Sugira como o material aparece na loja e no Google, e uma faixa de preço.
- nome: nome de produto claro, com o tema e a série/ocasião quando der (máx. 70 caracteres).
- tituloGoogle: título para a busca do Google (máx. 60 caracteres).
- descricaoGoogle: resumo para a busca do Google (máx. 155 caracteres).
- precoMinimo e precoMaximo: faixa em reais, baseada SOMENTE nos preços do catálogo recebidos ("catalogo"). Se o catálogo estiver vazio, use 0 nos dois.
- justificativaPreco: uma ou duas frases citando os preços do catálogo usados na comparação.`,
    schema: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING' },
        tituloGoogle: { type: 'STRING' },
        descricaoGoogle: { type: 'STRING' },
        precoMinimo: { type: 'NUMBER' },
        precoMaximo: { type: 'NUMBER' },
        justificativaPreco: { type: 'STRING' },
      },
      required: ['nome', 'tituloGoogle', 'descricaoGoogle', 'precoMinimo', 'precoMaximo'],
    },
    normalize: (raw) => {
      const price = (value) => Math.max(0, Math.round(Number(value || 0) * 100) / 100);
      const min = price(raw?.precoMinimo);
      const max = Math.max(min, price(raw?.precoMaximo));
      return {
        nome: cleanText(raw?.nome, 70),
        tituloGoogle: cleanText(raw?.tituloGoogle, 60),
        descricaoGoogle: cleanText(raw?.descricaoGoogle, 160),
        precoMinimo: min,
        precoMaximo: max,
        justificativaPreco: cleanText(raw?.justificativaPreco, 400),
      };
    },
  },

  // ── "Aprimorar seção" da Página da loja: uma tarefa por parte, cada uma
  // devolvendo SÓ os campos daquela parte. Nada de depoimento nem número de
  // seguidores: isso é prova social de verdade, não se inventa.
  homeHero: homeSection(
    `- titulo: frase principal do topo (máx. 90 caracteres). Coloque entre *asteriscos* 1 ou 2 palavras para destacar em cor.
- subtitulo: uma frase de apoio (máx. 160 caracteres).
- botao: texto do botão principal (máx. 30 caracteres), ex.: "Ver materiais".`,
    { titulo: 90, subtitulo: 160, botao: 30 },
  ),
  homeCatalog: homeSection(
    `- etiqueta: palavra ou duas acima do título (máx. 30 caracteres), ex.: "Catálogo".
- titulo: título da área de produtos (máx. 80 caracteres), pode ter *destaque*.
- botao: texto do botão que leva ao catálogo completo (máx. 30 caracteres).`,
    { etiqueta: 30, titulo: 80, botao: 30 },
  ),
  homeHowItWorks: homeSection(
    `- etiqueta: palavra ou duas acima do título (máx. 30 caracteres).
- titulo: título do passo a passo da compra (máx. 80 caracteres), pode ter *destaque*.
- subtitulo: frase curta (máx. 120 caracteres).
- passos: exatamente 4 passos, cada um com "titulo" (máx. 20 caracteres) e "texto" (máx. 120 caracteres), na ordem: escolher, pagar, baixar, imprimir.
- avisoTitulo e avisoTexto: um quadro curto sobre o formato dos arquivos (máx. 40 e 120 caracteres).`,
    { etiqueta: 30, titulo: 80, subtitulo: 120, avisoTitulo: 40, avisoTexto: 120 },
    {
      passos: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { titulo: { type: 'STRING' }, texto: { type: 'STRING' } },
          required: ['titulo', 'texto'],
        },
      },
    },
    (raw) => ({
      passos: (Array.isArray(raw?.passos) ? raw.passos : [])
        .map((step) => ({
          titulo: cleanText(step?.titulo, 20),
          texto: cleanText(step?.texto, 120),
        }))
        .filter((step) => step.titulo && step.texto)
        .slice(0, 4),
    }),
  ),
  homeSocialProof: homeSection(
    `- etiqueta: palavra ou duas acima do título (máx. 30 caracteres).
- titulo: título da parte de depoimentos e redes (máx. 80 caracteres), pode ter *destaque*.
- subtitulo: frase curta convidando a seguir a loja nas redes (máx. 120 caracteres).
NÃO escreva depoimentos nem números de seguidores.`,
    { etiqueta: 30, titulo: 80, subtitulo: 120 },
  ),
  homeFooter: homeSection(
    `- descricao: 1 ou 2 frases sobre a loja para o rodapé (máx. 220 caracteres): o que vende, para quem, como recebe.`,
    { descricao: 220 },
  ),
  homeSeo: homeSection(
    `- titulo: título da aba do navegador e do resultado no Google (máx. 60 caracteres), com o que a loja vende.
- descricao: texto do resultado no Google (máx. 155 caracteres), convidando a entrar.`,
    { titulo: 60, descricao: 155 },
  ),
});

const TASK_NAMES = Object.keys(TASKS);

/** Tarefas da Página da loja: não exigem nome de material. */
function isHomeTask(task) {
  return String(task).startsWith('home');
}

/** O que o professor digitou: só texto curto, nada além dos campos previstos. */
function sanitizeInput(input = {}) {
  return {
    nome: cleanText(input.name, 160),
    categoria: cleanText(input.category, 80),
    descricao: cleanText(input.description, 3000),
    preco: Number.isFinite(Number(input.price)) ? Number(input.price) : null,
    textosAtuais: cleanText(input.currentText, 1500),
  };
}

/** Contexto da loja tirado do banco: nomes, categorias e preços dos produtos ativos. */
async function loadCatalogContext() {
  const [products, categories] = await Promise.all([
    listTableRows('products', {
      select: 'name,price,category_id',
      filters: [{ column: 'active', value: true }],
      orderBy: 'created_at',
      ascending: false,
      limit: 40,
    }),
    listTableRows('categories', { select: 'id,name' }),
  ]);
  const categoryById = new Map(categories.map((c) => [String(c.id), c.name]));
  return products.map((p) => ({
    nome: cleanText(p.name, 120),
    preco: Number(p.price || 0),
    categoria: categoryById.get(String(p.category_id)) || '',
  }));
}

/**
 * @param {string} task  um de TASK_NAMES
 * @param {object} input campos digitados (name, category, description, price, currentText)
 */
async function runAiAssist(task, input, options = {}) {
  const definition = TASKS[task];
  if (!definition) {
    const error = new Error('Tarefa de IA desconhecida.');
    error.code = 'VALIDATION_FAILED';
    throw error;
  }
  const payload = { ...sanitizeInput(input) };
  if (task !== 'productCopy') payload.catalogo = await loadCatalogContext();
  if (isHomeTask(task)) payload.nomeDaLoja = 'Profa. Márcia · Ateliê da Escola';

  const { model, data } = await callGeminiJson(
    {
      systemPrompt: definition.prompt,
      input: payload,
      schema: definition.schema,
      temperature: 0.6,
    },
    options,
  );
  return { model, suggestion: definition.normalize(data) };
}

module.exports = { TASK_NAMES, isHomeTask, runAiAssist, sanitizeInput };
