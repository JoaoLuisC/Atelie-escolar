import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE DEPLOY — o que só é verdade se o arquivo disser.
//
// UMA RESSALVA SOBRE O MÉTODO, porque ela é a regra da casa
// A disciplina deste repositório é "teste mede o que EXECUTA, nunca o texto do
// arquivo no disco" — foi assim que o rate limit do login sumiu de produção com
// a suíte verde. Aqui a asserção é sobre TEXTO de propósito, e a distinção é
// real: num handler, o arquivo não é o que roda (o que roda é o módulo que o
// router montou); num workflow do GitHub e no `vercel.json`, o arquivo É
// literalmente o artefato que a plataforma executa. Não existe camada abaixo
// para inspecionar — e é por isso que estes dois são justamente os que ficam
// sem gate nenhum quando a regra é aplicada sem pensar.
//
// O QUE ESTÁ TRAVADO
//   1. Nenhum módulo de `handlers/` exporta `config` de Serverless Function.
//      Desde o 660fe74 eles não são funções: a Vercel só lê `config` dentro de
//      `api/`. Uma linha dessas não faz nada e afirma um limite por endpoint
//      que não existe — a mesma classe da regra D4.
//   2. O limite que sobrou está onde de fato vale, no `vercel.json`.
//   3. Todo workflow declara `permissions`. Sem o bloco, o GITHUB_TOKEN entra
//      com a permissão padrão do repositório, que em muitos é escrita.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

function listarHandlers(dir = path.join(REPO_ROOT, 'handlers'), prefixo = '') {
  const encontrados = [];
  for (const entrada of readdirSync(dir).sort()) {
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      if (entrada === '__tests__') continue;
      encontrados.push(...listarHandlers(completo, `${prefixo}${entrada}/`));
      continue;
    }
    if (!entrada.endsWith('.js') || entrada.endsWith('.test.js')) continue;
    encontrados.push({ id: `${prefixo}${entrada}`, file: completo });
  }
  return encontrados;
}

const handlers = listarHandlers();

describe('config de Serverless Function fora de api/ (pós-660fe74)', () => {
  it('encontra os handlers (guarda contra passar por vacuidade)', () => {
    expect(handlers.length).toBeGreaterThan(40);
  });

  it('nenhum módulo de handlers/ exporta `config` de função', () => {
    // Carregar o módulo, e não procurar a string: é o `exports.config` que a
    // Vercel leria, viesse ele de um literal, de um spread ou de outro arquivo.
    const comConfig = handlers
      .filter(({ file }) => requireCjs(file)?.config !== undefined)
      .map(({ id }) => id);

    expect(comConfig).toEqual([]);
  });

  it('o vercel.json declara o limite da única função publicada', () => {
    // O contrapeso do teste acima: remover o `config` dos handlers só é
    // correto porque o limite continua declarado aqui.
    const vercel = JSON.parse(readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8'));

    expect(Object.keys(vercel.functions || {})).toEqual(['api/index.js']);
    expect(vercel.functions['api/index.js'].maxDuration).toBeGreaterThan(0);
  });
});

describe('variáveis de ambiente · lidas ↔ documentadas', () => {
  // ── Por que este gate existe ────────────────────────────────────────
  // `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` são LIDAS pelo front e
  // estavam só no `.env.local.template`. Quem seguisse o `.env.example` —
  // que é o arquivo citado no setup — subia um front sem cliente Supabase:
  // login com Google e reset de senha simplesmente não funcionavam, sem erro
  // que apontasse a causa. Variável lida e não listada é dívida que só aparece
  // no dia em que alguém precisa mudar o comportamento em produção.
  //
  // A lista de dispensa é NOMEADA, no mesmo espírito do gate de rate limit:
  // só entra aqui o que a PLATAFORMA fornece, e cada entrada diz quem fornece.
  const FORNECIDAS_PELA_PLATAFORMA = Object.freeze({
    NODE_ENV: 'Node/Vite.',
    APP_ENV: 'Definida no painel da Vercel por ambiente; documentada no bloco App.',
    VERCEL: 'Injetada pelo runtime da Vercel.',
    VERCEL_ENV: 'Injetada pelo runtime da Vercel.',
    VERCEL_URL: 'Injetada pelo runtime da Vercel.',
    CI: 'Injetada pelo GitHub Actions.',
    VITEST: 'Injetada pelo Vitest.',
    MODE: 'import.meta.env do Vite.',
    DEV: 'import.meta.env do Vite.',
    PROD: 'import.meta.env do Vite.',
    SSR: 'import.meta.env do Vite.',
    BASE_URL: 'import.meta.env do Vite.',
  });

  const RAIZES = [
    'src',
    'api',
    'handlers',
    'lib',
    'routes',
    'middleware',
    'services',
    'utils',
    'validation',
    'scripts',
  ];

  function arquivosDeCodigo(dir) {
    const encontrados = [];
    let entradas;
    try {
      entradas = readdirSync(dir);
    } catch {
      return encontrados;
    }
    for (const entrada of entradas) {
      const completo = path.join(dir, entrada);
      if (statSync(completo).isDirectory()) {
        if (entrada === '__tests__') continue;
        encontrados.push(...arquivosDeCodigo(completo));
        continue;
      }
      if (!/\.jsx?$/.test(entrada)) continue;
      if (/\.test\.jsx?$/.test(entrada)) continue;
      encontrados.push(completo);
    }
    return encontrados;
  }

  /** Nome → primeiro arquivo que a lê, para a falha apontar onde olhar. */
  function lerVariaveis() {
    const lidas = new Map();
    const arquivos = [
      ...RAIZES.flatMap((raiz) => arquivosDeCodigo(path.join(REPO_ROOT, raiz))),
      path.join(REPO_ROOT, 'server.js'),
    ];

    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, 'utf8');
      const registrar = (nome) => {
        if (!lidas.has(nome)) lidas.set(nome, path.relative(REPO_ROOT, arquivo));
      };
      // Leitura direta e as três indireções do projeto — sem elas o gate
      // acharia que `ADMIN_SESSION_SECRET` não é lida por ninguém.
      for (const m of conteudo.matchAll(/process\.env\.([A-Z0-9_]+)/g)) registrar(m[1]);
      for (const m of conteudo.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) registrar(m[1]);
      for (const m of conteudo.matchAll(
        /(?:resolveSecret|requireSecret|readEnv)\(\s*'([A-Z0-9_]+)'/g,
      )) {
        registrar(m[1]);
      }
    }
    return lidas;
  }

  function documentadas() {
    const nomes = new Set();
    for (const arquivo of ['.env.example', '.env.local.template']) {
      const conteudo = readFileSync(path.join(REPO_ROOT, arquivo), 'utf8');
      for (const m of conteudo.matchAll(/^([A-Z0-9_]+)=/gm)) nomes.add(m[1]);
    }
    return nomes;
  }

  const lidas = lerVariaveis();
  const listadas = documentadas();

  it('encontra variáveis dos dois lados (guarda contra passar por vacuidade)', () => {
    expect(lidas.size).toBeGreaterThan(20);
    expect(listadas.size).toBeGreaterThan(20);
    expect(lidas.has('ADMIN_SESSION_SECRET')).toBe(true);
    expect(lidas.has('VITE_SUPABASE_URL')).toBe(true);
  });

  it('toda variável lida está documentada ou é fornecida pela plataforma', () => {
    const semDocumentacao = [...lidas]
      .filter(([nome]) => !listadas.has(nome) && !(nome in FORNECIDAS_PELA_PLATAFORMA))
      .map(([nome, arquivo]) => `${nome} (lida em ${arquivo})`);

    expect(semDocumentacao).toEqual([]);
  });

  it('o .env.example documenta as credenciais que o front precisa', () => {
    // Explícito porque foi o caso concreto: as duas estavam só no
    // `.env.local.template`, e a união acima teria escondido a falta.
    const exemplo = readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');

    expect(exemplo).toMatch(/^VITE_SUPABASE_URL=/m);
    expect(exemplo).toMatch(/^VITE_SUPABASE_ANON_KEY=/m);
  });
});

describe('workflows do GitHub · menor privilégio', () => {
  const dir = path.join(REPO_ROOT, '.github', 'workflows');
  const workflows = readdirSync(dir).filter((nome) => /\.ya?ml$/.test(nome));

  it('encontra os workflows', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(3);
  });

  it.each(workflows)('%s declara `permissions`', (nome) => {
    const conteudo = readFileSync(path.join(dir, nome), 'utf8');

    // No topo do arquivo (permissão do workflow inteiro) ou dentro de um job.
    // O que não pode é ficar ausente e herdar o padrão do repositório.
    expect(conteudo, `${nome} sem bloco permissions`).toMatch(/^\s*permissions:/m);
  });
});
