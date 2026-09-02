#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// O BANCO EM PRODUÇÃO CONFERE COM O QUE AS MIGRATIONS DIZEM?
//
// O PROBLEMA QUE ESTE SCRIPT RESOLVE
// A Área 3 (Banco & RLS) foi dada como corrigida lendo os arquivos `.sql`.
// Ler migration não diz nada sobre o banco que está no ar: uma migration que
// nunca foi aplicada, ou uma policy alterada à mão no painel, deixa o código
// auditado e o banco divergente. E RLS **é** o boundary de autorização do
// browser — o front fala direto com o PostgREST usando a chave `anon`.
//
// O QUE ELE VERIFICA, E COMO
// Ele não lê o catálogo do Postgres (isso exigiria SUPABASE_DB_URL ou um PAT
// da Management API). Ele faz o que um atacante faria: pega a chave `anon` —
// a mesma que está no bundle publicado, portanto pública — e tenta ler cada
// tabela. É medição de comportamento, não de configuração: se `anon` lê
// `orders`, não importa o que a migration diz.
//
// ⚠️ A ARMADILHA DE INTERPRETAÇÃO, e ela derruba a primeira versão de todo
// script deste tipo: **RLS ligada sem policy responde 200 com zero linhas**,
// não erro. "anon recebeu 200" NÃO significa tabela exposta, e "anon recebeu
// lista vazia" não prova proteção — a tabela pode só estar vazia hoje. A
// única leitura conclusiva é COMPARAR: se a chave de serviço conta N linhas e
// a `anon` conta 0, a policy está filtrando; se as duas contam 0, o resultado
// é INCONCLUSIVO, e este script diz isso em vez de fingir um veredito.
//
// A segunda armadilha é o `select=*`: o W1-01 revogou o SELECT da tabela
// `products` inteira e regrantou coluna a coluna, então pedir `*` ali dá
// permission denied mesmo com o catálogo perfeitamente funcional. Sondar com
// `*` produziria um "a vitrine quebrou" que é puro artefato da sonda.
//
// SOMENTE LEITURA, E SEM PII
// Todo pedido vai com `limit=0` e `Prefer: count=exact`: o PostgREST responde
// a CONTAGEM no header `Content-Range` e **zero linhas**. Nenhum dado pessoal
// trafega, nada é escrito, e a saída nunca contém conteúdo de linha. Rodar
// isto contra produção é tão invasivo quanto abrir a home do site.
//
// COMO RODAR
//   node scripts/check-rls.js
//
// Exige SUPABASE_URL e SUPABASE_ANON_KEY. Com SUPABASE_SERVICE_ROLE_KEY
// presente, a comparação acima fica disponível — sem ela, tabela vazia vira
// inconclusiva em vez de aprovada.
//
// O QUE ELE **NÃO** COBRE, e por que o checklist manual continua necessário:
// existência das funções de purga, jobs do `pg_cron`, triggers de
// imutabilidade do audit log e índices. Nada disso é observável pelo
// PostgREST. As consultas para esses estão em
// docs/reviews/CORRECOES-2026-09-01.md §2 e rodam no SQL Editor.
// ════════════════════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');

function loadEnvFiles() {
  let dotenv;
  try {
    dotenv = require('dotenv');
  } catch {
    return;
  }
  for (const arquivo of ['.env.local', '.env']) {
    const caminho = path.join(process.cwd(), arquivo);
    if (fs.existsSync(caminho)) dotenv.config({ path: caminho, override: false });
  }
}

loadEnvFiles();

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────
// A postura PRETENDIDA, tirada das migrations. Duas tabelas de catálogo são
// legitimamente públicas (`categories_public_read` e `products_public_read`
// na phase6); as outras 16 não têm policy para `anon`, então leitura anônima
// ali seria RLS ausente ou policy frouxa.
// ─────────────────────────────────────────────────────────────────────
const PUBLICAS = [
  { tabela: 'categories', select: '*' },
  // Colunas que a vitrine realmente lê — ver a segunda armadilha no topo.
  { tabela: 'products', select: 'id,name,price' },
];

const FECHADAS = [
  'orders',
  'order_items',
  'profiles',
  'user_products',
  'download_tokens',
  'download_logs',
  'analytics_events',
  'security_events',
  'page_views',
  'coupons',
  'abandoned_carts',
  'settings',
  'email_subscribers',
  'email_sent_log',
  'admin_audit_log',
  'rate_limit_hit',
];

/** GET sem linhas: só a contagem, pelo header. Nunca devolve conteúdo. */
async function contar(tabela, chave, { select = '*' } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${tabela}?select=${encodeURIComponent(select)}&limit=0`;
  let resposta;
  try {
    resposta = await fetch(url, {
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        Prefer: 'count=exact',
      },
    });
  } catch (err) {
    return { erro: `rede: ${err.message}` };
  }

  if (!resposta.ok) {
    // O corpo do erro do PostgREST traz `code`/`message`, sem dado de linha.
    const corpo = await resposta.json().catch(() => ({}));
    return { status: resposta.status, code: corpo.code || null, message: corpo.message || null };
  }

  const range = resposta.headers.get('content-range') || '';
  const total = Number(String(range).split('/')[1]);
  return { status: resposta.status, total: Number.isFinite(total) ? total : null };
}

const OK = '  OK  ';
const FALHA = ' FALHA';
const AVISO = ' AVISO';

function rotuloDeErro(resultado) {
  if (resultado.erro) return resultado.erro;
  return resultado.code ? `${resultado.status} ${resultado.code}` : String(resultado.status);
}

(async () => {
  console.log('━━ Postura de RLS em produção, medida pela chave anon ━━');
  console.log(`projeto: ${SUPABASE_URL}`);
  console.log(`service role: ${SERVICE_KEY ? 'presente (permite comparar)' : 'AUSENTE'}\n`);

  const problemas = [];
  let inconclusivas = 0;

  // ─── 1. Tabelas que devem estar FECHADAS para anon ─────────────────
  for (const tabela of FECHADAS) {
    const anon = await contar(tabela, ANON_KEY);
    const servico = SERVICE_KEY ? await contar(tabela, SERVICE_KEY) : null;

    if (servico && servico.status === 404) {
      console.log(`${FALHA}  ${tabela.padEnd(20)} NÃO EXISTE no banco`);
      problemas.push(`${tabela}: tabela ausente — migration não aplicada`);
      continue;
    }

    const visiveis = anon.total;
    const reais = servico?.total ?? null;

    // Bloqueio no nível do GRANT: nem chega à policy. É o mais forte.
    if (visiveis === null || visiveis === undefined) {
      console.log(`${OK}  ${tabela.padEnd(20)} anon sem permissão (${rotuloDeErro(anon)})`);
      continue;
    }

    // 200 com linhas visíveis: exposição real, e o número é o tamanho dela.
    if (visiveis > 0) {
      console.log(`${FALHA}  ${tabela.padEnd(20)} anon LÊ ${visiveis} linhas`);
      problemas.push(`${tabela}: leitura anônima devolve ${visiveis} linhas`);
      continue;
    }

    // 200 com zero linhas: só conclui comparando com o total real.
    if (reais === null) {
      console.log(`${AVISO}  ${tabela.padEnd(20)} anon vê 0 — INCONCLUSIVO (sem service role)`);
      inconclusivas += 1;
      continue;
    }

    if (reais > 0) {
      console.log(`${OK}  ${tabela.padEnd(20)} policy filtra (${reais} linhas, anon vê 0)`);
      continue;
    }

    console.log(`${AVISO}  ${tabela.padEnd(20)} tabela vazia — INCONCLUSIVO`);
    inconclusivas += 1;
  }

  // ─── 2. Catálogo público continua legível ──────────────────────────
  console.log('');
  for (const { tabela, select } of PUBLICAS) {
    const anon = await contar(tabela, ANON_KEY, { select });
    if (anon.total === null || anon.total === undefined) {
      console.log(`${FALHA}  ${tabela.padEnd(20)} anon NÃO lê (${rotuloDeErro(anon)})`);
      problemas.push(`${tabela}: catálogo público inacessível — a vitrine quebra`);
    } else {
      console.log(`${OK}  ${tabela.padEnd(20)} anon lê ${anon.total} linhas — correto`);
    }
  }

  // ─── 3. W1-01: products.download_url revogado do anon ──────────────
  // RLS filtra LINHA, não coluna. Sem o revoke, `select=download_url` entrega
  // o caminho do arquivo pago mesmo com a policy de leitura correta.
  console.log('');
  const coluna = await contar('products', ANON_KEY, { select: 'download_url' });
  if (coluna.total === null || coluna.total === undefined) {
    console.log(`${OK}  products.download_url    anon sem permissão (${rotuloDeErro(coluna)})`);
  } else {
    console.log(`${FALHA}  products.download_url    anon LÊ a coluna do arquivo pago`);
    problemas.push('products.download_url: grant de coluna não revogado (W1-01)');
  }

  console.log('\n━━ Resultado ━━');
  if (inconclusivas > 0) {
    console.log(
      `${inconclusivas} tabela(s) sem nenhuma linha: proteção NÃO confirmada, apenas não contrariada.`,
    );
  }

  if (problemas.length === 0) {
    console.log('Nenhuma divergência no que este script alcança.');
    console.log('Funções de purga, jobs do pg_cron, triggers e índices continuam fora do');
    console.log('alcance do PostgREST — ver o checklist do §2.');
    process.exit(0);
  }

  console.log('');
  for (const p of problemas) console.log(` • ${p}`);
  process.exit(1);
})().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
