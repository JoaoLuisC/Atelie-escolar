// ════════════════════════════════════════════════════════════════════
// IA NA ÁREA DO PROFESSOR — sugestões que só saem quando ele clica.
//
// Três tarefas (o Estudo de vendas mora em lib/sales-study.js):
//   productCopy — descrição de venda, benefícios e FAQ de um material
//   productSeo  — nome melhor, título/descrição para o Google e faixa de
//                 preço comparando com o catálogo da própria loja
//   homeCopy    — textos da página da loja (banner, vitrine, passo a passo)
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

  homeCopy: {
    prompt: `${STORE_CONTEXT}

TAREFA
Sugira os textos da página inicial da loja, a partir do nome da loja, dos produtos e categorias que ela vende e dos textos atuais.
- bannerTitulo: frase principal do topo (máx. 90 caracteres). Coloque entre *asteriscos* 1 ou 2 palavras para destacar em cor.
- bannerSubtitulo: uma frase de apoio (máx. 160 caracteres).
- vitrineTitulo: título da área de produtos (máx. 80 caracteres).
- passoAPassoTitulo: título do passo a passo da compra (máx. 80 caracteres), pode ter *destaque*.
- passoAPassoSubtitulo: frase curta (máx. 120 caracteres).`,
    schema: {
      type: 'OBJECT',
      properties: {
        bannerTitulo: { type: 'STRING' },
        bannerSubtitulo: { type: 'STRING' },
        vitrineTitulo: { type: 'STRING' },
        passoAPassoTitulo: { type: 'STRING' },
        passoAPassoSubtitulo: { type: 'STRING' },
      },
      required: ['bannerTitulo', 'bannerSubtitulo', 'vitrineTitulo', 'passoAPassoTitulo'],
    },
    normalize: (raw) => ({
      bannerTitulo: cleanText(raw?.bannerTitulo, 90),
      bannerSubtitulo: cleanText(raw?.bannerSubtitulo, 160),
      vitrineTitulo: cleanText(raw?.vitrineTitulo, 80),
      passoAPassoTitulo: cleanText(raw?.passoAPassoTitulo, 80),
      passoAPassoSubtitulo: cleanText(raw?.passoAPassoSubtitulo, 120),
    }),
  },
});

const TASK_NAMES = Object.keys(TASKS);

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
  if (task === 'homeCopy') payload.nomeDaLoja = 'Profa. Márcia · Ateliê da Escola';

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

module.exports = { TASK_NAMES, runAiAssist, sanitizeInput };
