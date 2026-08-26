#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Validação de variáveis de ambiente — achado P0-3 da revisão 2026-08-12.
//
// PROBLEMA QUE ESTE SCRIPT RESOLVE
// `server.js` valida os segredos obrigatórios NO BOOT, mas `server.js` só
// roda em desenvolvimento — na Vercel cada arquivo de `api/` vira uma função
// isolada e ninguém executa aquele bloco. Resultado: um deploy sem
// `ADMIN_SESSION_SECRET`/`WEBHOOK_SECRET`/`CUSTOMER_SESSION_SECRET` fica
// VERDE no build e só quebra no primeiro checkout/login/webhook real, porque
// `lib/env-secret.js` é fail-closed em RUNTIME (derruba a requisição, não o
// deploy). Este script move a falha para o momento certo: antes de publicar.
//
// ONDE ELE RODA
//   • `vercel.json` → buildCommand: `npm run check:env && npm run build`.
//     No build da Vercel o ambiente já tem APP_ENV/VERCEL_ENV e os segredos
//     do projeto; faltando qualquer um, o DEPLOY falha em vez do cliente.
//     PEGADINHA DE OPERAÇÃO: só enxergamos aqui o que a Vercel expõe ao BUILD.
//     Variável cadastrada em Settings → Environment Variables é exposta ao
//     build e ao runtime; um "secret" legado mapeado por um bloco `env` no
//     vercel.json seria RUNTIME (este repo não tem mais esse bloco — ver
//     12-DEPLOY-OPERACAO §1.2). Se um deploy passar a falhar listando uma
//     variável que você sabe que existe, é este o caso — recadastre-a em
//     Settings para o ambiente correspondente, não desligue o gate.
//     Em PREVIEW a lista aplicada é só a de escopo 'core' (ver VARS), então
//     preview não exige SUPABASE_SERVICE_ROLE_KEY nem os segredos de produção.
//   • CI (GitHub Actions) → `npm run check:env` roda em modo permissivo,
//     porque o runner não tem (nem deve ter) os segredos de produção. Ali o
//     valor é de VISIBILIDADE: lista o que produção vai exigir e falha se o
//     próprio script quebrar.
//   • Local → `npm run check:env` avisa sem quebrar o fluxo de dev.
//
// REGRA DE OURO: este script NUNCA imprime o valor de um segredo. Só o NOME
// da variável e o motivo. Ele roda em log de CI e de build da Vercel, que são
// visíveis para qualquer pessoa com acesso ao projeto.
//
// NOTA sobre DOWNLOAD_TOKEN_SECRET: propositalmente FORA da lista. Ele é
// exigido no boot do Express, mas nenhum código de `api/` ou `lib/` o lê —
// é resquício do stack BFF morto. Exigi-lo aqui bloquearia deploys por um
// segredo que não protege nada.
// ════════════════════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');

// ────────────────────────────────────────────────────────────────────
// 1. Carregamento de .env — espelha loadEnvFiles() de server.js.
//    Necessário para que `npm run check:env` local enxergue o mesmo
//    ambiente que o Express enxergaria. Na Vercel não existe .env no
//    repositório (estão no .gitignore), então isto vira no-op.
// ────────────────────────────────────────────────────────────────────
function loadEnvFiles() {
  let dotenv;
  try {
    dotenv = require('dotenv');
  } catch {
    // dotenv é dependência de produção; se faltar, seguimos só com
    // process.env — não é motivo para abortar a validação.
    return;
  }

  const initialEnv = String(process.env.APP_ENV || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase();

  const candidates = [
    `.env.${initialEnv}.local`,
    ...(initialEnv === 'test' ? [] : ['.env.local']),
    `.env.${initialEnv}`,
    '.env',
  ];

  for (const envFile of candidates) {
    const envPath = path.join(process.cwd(), envFile);
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: false });
  }
}

// ────────────────────────────────────────────────────────────────────
// 2. Resolução do ambiente.
//    Ordem deliberada: APP_ENV > VERCEL_ENV > NODE_ENV.
//    Motivo: no build de PREVIEW a Vercel define NODE_ENV=production —
//    confiar no NODE_ENV classificaria preview como produção e exigiria
//    segredos que a doc de deploy manda NÃO colocar em preview
//    (SUPABASE_SERVICE_ROLE_KEY, por exemplo).
// ────────────────────────────────────────────────────────────────────
const KNOWN_ENVS = ['development', 'test', 'preview', 'production'];

function resolveEnv(cliEnv) {
  const raw = String(
    cliEnv ||
      process.env.APP_ENV ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV ||
      'development',
  )
    .trim()
    .toLowerCase();

  return KNOWN_ENVS.includes(raw) ? raw : 'production';
  // Fallback DELIBERADAMENTE em 'production': um APP_ENV escrito errado
  // ('prod', 'prd', 'staging') é ambiente implantado até prova em
  // contrário — mesma política fail-closed de lib/env-secret.js.
}

// ────────────────────────────────────────────────────────────────────
// 3. Catálogo de variáveis.
//
//    `scope`:
//      'core'       → exigida em preview E produção
//      'production' → exigida só em produção
//      'advisory'   → nunca bloqueia; só avisa quando ausente
//
//    A lista foi montada a partir do que o código REALMENTE lê
//    (grep de process.env em api/, lib/, routes/, services/ e de
//    import.meta.env em src/), cruzada com server.js
//    (REQUIRED_PRODUCTION_SECRETS), .env.example e
//    docs/ProjectDocs/12-DEPLOY-OPERACAO.md §1.2.
// ────────────────────────────────────────────────────────────────────
const VARS = [
  // — Supabase (backend, service role) —
  { name: 'SUPABASE_URL', scope: 'core', format: 'https', why: 'lib/supabase.js' },
  { name: 'SUPABASE_ANON_KEY', scope: 'core', why: 'lib/supabase.js' },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    scope: 'production',
    why: 'lib/supabase.js — sem ela toda função de api/ responde "Supabase is not configured"',
  },

  // — Supabase (frontend, injetado no bundle pelo Vite) —
  { name: 'VITE_SUPABASE_URL', scope: 'core', format: 'https', why: 'src/lib/supabase (build)' },
  { name: 'VITE_SUPABASE_ANON_KEY', scope: 'core', why: 'src/lib/supabase (build)' },

  // — Segredos de assinatura (fail-closed em lib/env-secret.js) —
  {
    name: 'ADMIN_SESSION_SECRET',
    scope: 'core',
    minLength: 32,
    why: 'lib/admin-session.js — assina o cookie de sessão do admin',
  },
  {
    name: 'CUSTOMER_SESSION_SECRET',
    scope: 'core',
    minLength: 32,
    why: 'lib/customer-session.js — assina o cookie de sessão do cliente',
  },
  {
    name: 'WEBHOOK_SECRET',
    scope: 'core',
    minLength: 16,
    why: 'lib/mercadopago-config.js — HMAC da notificação do Mercado Pago',
  },

  // — Pagamento —
  {
    name: 'MERCADOPAGO_ACCESS_TOKEN',
    scope: 'core',
    format: 'mp-token',
    why: 'api/create-payment.js, api/webhook.js',
  },

  // — App —
  { name: 'APP_URL', scope: 'core', format: 'app-url', why: 'back_urls do MP, links de e-mail' },

  // — Cron de e-mail (GitHub Actions → /api/cron-email-jobs) —
  {
    name: 'CRON_SECRET',
    scope: 'production',
    minLength: 16,
    why: 'api/cron-email-jobs.js — sem ele o cron responde 401 de hora em hora',
  },

  // — SMTP (Resend). Sem eles lib/email-sender.js degrada em silêncio:
  //   o pedido é aprovado e o cliente nunca recebe o e-mail com o link. —
  { name: 'SMTP_HOST', scope: 'production', why: 'lib/email-sender.js' },
  { name: 'SMTP_USER', scope: 'production', why: 'lib/email-sender.js' },
  { name: 'SMTP_PASS', scope: 'production', why: 'lib/email-sender.js' },

  // — Avisos: têm default no código, mas o default raramente é o desejado —
  {
    name: 'SMTP_FROM',
    scope: 'advisory',
    why: 'default cai no SMTP_USER (domínio não verificado)',
  },
  { name: 'APP_ENV', scope: 'advisory', why: 'define o gate de fail-closed dos segredos' },
  { name: 'CORS_ORIGINS', scope: 'advisory', why: 'vazio libera qualquer localhost (server.js)' },
  {
    name: 'SUPABASE_STORAGE_BUCKET',
    scope: 'advisory',
    why: 'default "public" em lib/supabase.js',
  },
  { name: 'VITE_GA4_ID', scope: 'advisory', why: 'vazio desliga a medição GA4' },
  { name: 'VITE_META_PIXEL_ID', scope: 'advisory', why: 'vazio desliga o Meta Pixel' },
  {
    name: 'SECURITY_ALERT_WEBHOOK_URL',
    scope: 'advisory',
    why: 'sem ele alertas só vão pro stdout',
  },
];

// Fragmentos que aparecem nos placeholders de .env.example e nos fallbacks
// de dev. Comparação em minúsculas, e SEMPRE reportando só o NOME da
// variável — o valor nunca é impresso nem logado.
//
// Deliberadamente conservador: só marcadores que não têm chance de aparecer
// num segredo real (hex/base64 aleatório, JWT, URL de projeto). Um falso
// positivo aqui BLOQUEIA deploy, então é melhor deixar passar do que inventar.
const PLACEHOLDER_SUBSTRINGS = ['seu_', 'sua_', 'your_', 'change-me', 'changeme', 'xxxxxxxx'];
const PLACEHOLDER_PREFIXES = ['dev-', 'your-project', 'my-project'];

function isPlaceholder(value) {
  const lowered = value.toLowerCase();
  if (PLACEHOLDER_SUBSTRINGS.some((marker) => lowered.includes(marker))) return true;
  // Prefixo (e não substring) porque 'dev-' pode legitimamente aparecer no
  // meio de uma URL de projeto Supabase de staging.
  const withoutScheme = lowered.replace(/^https?:\/\//, '');
  return PLACEHOLDER_PREFIXES.some((marker) => withoutScheme.startsWith(marker));
}

// ────────────────────────────────────────────────────────────────────
// 4. Validações de formato. Cada uma devolve string de erro ou null.
//    Nenhuma delas interpola o valor na mensagem.
// ────────────────────────────────────────────────────────────────────
function checkFormat(spec, value, env) {
  const isProduction = env === 'production';

  if (spec.format === 'https' && !value.startsWith('https://')) {
    return 'deve começar com https://';
  }

  if (spec.format === 'app-url') {
    // Exigido pela tarefa e pelo checklist de release: em produção o APP_URL
    // entra em back_urls do Mercado Pago e nos links dos e-mails. Um http://
    // ou um localhost ali gera redirect quebrado no pós-pagamento.
    if (isProduction && !value.startsWith('https://')) {
      return 'deve começar com https:// em produção (back_urls do MP e links de e-mail)';
    }
    if (isProduction && /localhost|127\.0\.0\.1/.test(value)) {
      return 'aponta para localhost em produção';
    }
    if (!isProduction && !/^https?:\/\//.test(value)) {
      return 'deve ser uma URL absoluta (http:// ou https://)';
    }
  }

  // O formato do token do Mercado Pago (TEST- vs APP_USR-) é tratado só como
  // AVISO, lá embaixo em main(). Motivo: um token TEST- em produção não
  // quebra nada tecnicamente — só não cobra de verdade. Bloquear o deploy
  // por causa disso puniria quem está publicando de propósito em modo
  // sandbox antes de ir ao ar.

  if (spec.minLength && value.length < spec.minLength) {
    return `curto demais (mínimo ${spec.minLength} caracteres para uso como chave HMAC)`;
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────
// 5. Execução
// ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { strict: false, env: null, help: false };
  for (const arg of argv) {
    if (arg === '--strict') args.strict = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--env=')) args.env = arg.slice('--env='.length);
  }
  return args;
}

function printHelp() {
  console.log(`
Uso: node scripts/check-env.js [--env=<ambiente>] [--strict]

  --env=<name>   força o ambiente avaliado (development|test|preview|production).
                 Sem a flag: APP_ENV > VERCEL_ENV > NODE_ENV > development.
  --strict       simula um deploy de produção a partir de dev: aplica a lista
                 completa de obrigatórias e falha com exit 1.
                 Equivalente à variável CHECK_ENV_STRICT=1.

Modo permissivo (development/test sem --strict): só imprime avisos, sai com 0.
Modo estrito (preview, production, ou --strict): sai com 1 listando os NOMES
das variáveis ausentes ou malformadas. Valores nunca são impressos.
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }

  loadEnvFiles();

  const detectedEnv = resolveEnv(args.env);
  // `--strict` (ou CHECK_ENV_STRICT=1) permite exercitar o gate de produção
  // a partir de uma máquina de dev sem mentir sobre o APP_ENV: a lista
  // avaliada passa a ser a de produção, e a saída volta a ser bloqueante.
  const forceStrict = args.strict || process.env.CHECK_ENV_STRICT === '1';
  const isLocal = detectedEnv === 'development' || detectedEnv === 'test';
  const permissive = !forceStrict && isLocal;
  const env = forceStrict && isLocal ? 'production' : detectedEnv;

  const errors = [];
  const warnings = [];

  for (const spec of VARS) {
    const value = String(process.env[spec.name] || '').trim();

    const required =
      spec.scope === 'core'
        ? env === 'preview' || env === 'production'
        : spec.scope === 'production'
          ? env === 'production'
          : false;

    if (!value) {
      const message = `${spec.name} — ausente (${spec.why})`;
      if (required) errors.push(message);
      else warnings.push(message);
      continue;
    }

    if (isPlaceholder(value)) {
      // Placeholder configurado é pior que variável ausente: passa em
      // qualquer checagem de presença e só falha no cliente real.
      const message = `${spec.name} — ainda está com valor de exemplo/placeholder`;
      if (required) errors.push(message);
      else warnings.push(message);
      continue;
    }

    const formatError = checkFormat(spec, value, env);
    if (formatError) {
      const message = `${spec.name} — ${formatError}`;
      if (required) errors.push(message);
      else warnings.push(message);
    }
  }

  // Coerência entre APP_ENV e o ambiente real da Vercel: um APP_ENV
  // != production num deploy de produção reabre o fallback de segredo
  // de dev em lib/env-secret.js.
  const appEnv = String(process.env.APP_ENV || '')
    .trim()
    .toLowerCase();
  const vercelEnv = String(process.env.VERCEL_ENV || '')
    .trim()
    .toLowerCase();
  if (vercelEnv === 'production' && appEnv && appEnv !== 'production') {
    errors.push('APP_ENV — deploy de produção da Vercel com APP_ENV diferente de "production"');
  }

  // Credencial do Mercado Pago no ambiente errado. Sempre AVISO, nunca
  // bloqueio (ver comentário em checkFormat): são os dois lados do mesmo
  // engano, e os dois valem a pena aparecer no log do deploy.
  const mpToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (env === 'production' && mpToken && !mpToken.startsWith('APP_USR-')) {
    warnings.push(
      'MERCADOPAGO_ACCESS_TOKEN — não é credencial APP_USR-: em produção esta não cobra de verdade',
    );
  }
  if (env === 'preview' && mpToken.startsWith('APP_USR-')) {
    warnings.push('MERCADOPAGO_ACCESS_TOKEN — credencial de PRODUÇÃO em ambiente de preview');
  }

  console.log(
    `[check-env] ambiente detectado: ${detectedEnv} | lista aplicada: ${env}` +
      `${permissive ? ' | modo permissivo (nada bloqueia)' : ' | modo estrito'}`,
  );

  if (warnings.length) {
    console.log(`[check-env] ${warnings.length} aviso(s):`);
    for (const warning of warnings) console.log(`  - ${warning}`);
  }

  if (!errors.length) {
    console.log('[check-env] OK — todas as variáveis obrigatórias deste ambiente estão presentes.');
    return 0;
  }

  console.error(`[check-env] ${errors.length} problema(s) BLOQUEANTE(S) em "${env}":`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    '[check-env] Configure as variáveis acima (Vercel → Settings → Environment Variables) e refaça o deploy.',
  );

  if (permissive) {
    console.error('[check-env] modo permissivo: seguindo mesmo assim (exit 0).');
    return 0;
  }

  return 1;
}

process.exit(main());
