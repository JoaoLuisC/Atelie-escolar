#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// O SCHEMA EM PRODUÇÃO TEM O QUE AS MIGRATIONS PROMETEM?
//
// O PAR DE `check-rls.js`, e a divisão entre os dois é de ALCANCE:
//
//   • `check-rls.js` usa a chave `anon` pelo PostgREST e responde "quem
//     consegue LER o quê" — comportamento, do ponto de vista do atacante.
//   • este aqui usa a CLI do Supabase e responde "os OBJETOS existem" —
//     funções, triggers, policies, grants de coluna, RLS ligada.
//
// Juntos fecham o §2 de docs/reviews/CORRECOES-2026-09-01.md, que até então
// era uma lista de SQL para colar à mão no editor. Lista que se cola à mão é
// lista que ninguém roda duas vezes.
//
// PRÉ-REQUISITOS (e o script diz qual falta, em vez de quebrar feio):
//   • `supabase link` já feito — confirmado por supabase/.temp/project-ref;
//   • Docker rodando, porque `supabase db dump` sobe a imagem do postgres
//     para gerar o dump com o pg_dump da versão certa.
//
// SOMENTE LEITURA: `migration list` e `db dump` (sem `--data-only`) não
// escrevem nada. O dump vai para um arquivo temporário e NÃO é versionado —
// ele descreve a estrutura do banco de produção.
//
// ⚠️ O QUE ELE NÃO ALCANÇA: os jobs do `pg_cron`. Eles são LINHAS em
// `cron.job`, e o papel usado pelo dump não enxerga o schema `cron` — o dump
// volta vazio tanto no DDL quanto nos dados, o que é ausência de VISIBILIDADE
// e não ausência de job. Essa diferença importa: concluir "não há cron
// agendado" a partir de um dump vazio seria o mesmo erro que a primeira versão
// do check-rls cometeu. Para os jobs, só o SQL Editor:
//
//   select jobname, schedule, active from cron.job order by jobname;
// ════════════════════════════════════════════════════════════════════

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = process.cwd();

// ─── O que as migrations prometem ────────────────────────────────────
const FUNCOES = [
  'purge_old_logs',
  'cleanup_old_analytics_events',
  'cleanup_old_email_logs',
  'purge_stale_email_subscribers',
  'purge_old_rate_limit_hits',
  'increment_coupon_usage',
  'rate_limit_hit',
  'find_profile_id_by_email',
  'slugify',
  'handle_new_user',
  'profiles_guard_privileged_cols',
  'prevent_admin_audit_mutation',
  'set_updated_at',
];

const TABELAS_DE_MIGRATION = [
  'analytics_events',
  'coupons',
  'abandoned_carts',
  'security_events',
  'email_subscribers',
  'email_sent_log',
  'admin_audit_log',
  'rate_limit_hit',
];

const TABELAS_COM_RLS = [
  'categories',
  'products',
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

const OK = '  OK  ';
const FALTA = ' FALTA';

function exigirLink() {
  const ref = path.join(RAIZ, 'supabase', '.temp', 'project-ref');
  if (!fs.existsSync(ref)) {
    console.error('Projeto não linkado. Rode `npx supabase link` antes.');
    process.exit(1);
  }
  return fs.readFileSync(ref, 'utf8').trim();
}

function rodarCli(args) {
  return execFileSync('npx', ['supabase', ...args], {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

/** `local` x `remote` de cada migration — é o que `db push` vai aplicar. */
function conferirHistorico() {
  console.log('━━ Histórico de migrations ━━');

  let saida;
  try {
    saida = rodarCli(['migration', 'list']);
  } catch (err) {
    console.error('Falha ao listar migrations:', String(err.message).slice(0, 200));
    console.error('Docker está rodando? O projeto está linkado?');
    process.exit(1);
  }

  const json = saida.slice(saida.indexOf('{"migrations"'));
  const { migrations } = JSON.parse(json);

  const pendentes = migrations.filter((m) => m.local && !m.remote);
  const sohRemotas = migrations.filter((m) => !m.local && m.remote);

  console.log(`  ${migrations.length} migrations · ${pendentes.length} pendente(s)`);
  for (const m of pendentes) console.log(`  PENDENTE  ${m.local}`);
  for (const m of sohRemotas) console.log(`  SÓ REMOTA ${m.remote} (arquivo local sumiu?)`);

  // A pergunta que decide se `db push` é seguro: se o histórico remoto
  // estivesse vazio (migrations aplicadas à mão pelo SQL Editor), o push
  // tentaria reaplicar TUDO, não só o que falta.
  const rastreadas = migrations.filter((m) => m.remote).length;
  console.log(`  ${rastreadas} rastreadas no banco — \`db push\` aplicaria ${pendentes.length}`);

  return { pendentes, sohRemotas };
}

function conferirSchema() {
  console.log('\n━━ Objetos no schema public ━━');

  const destino = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'schema-')), 'public.sql');
  try {
    rodarCli(['db', 'dump', '--linked', '--schema', 'public', '-f', destino]);
  } catch (err) {
    console.error('Falha ao gerar o dump:', String(err.message).slice(0, 200));
    process.exit(1);
  }

  // O pg_dump QUOTA os identificadores: "public"."tabela". Casar sem as aspas
  // faz tudo parecer ausente — foi o primeiro resultado, falso, desta checagem.
  const dump = fs.readFileSync(destino, 'utf8');
  fs.rmSync(path.dirname(destino), { recursive: true, force: true });

  const faltas = [];
  const conferir = (rotulo, presente) => {
    console.log(`${presente ? OK : FALTA}  ${rotulo}`);
    if (!presente) faltas.push(rotulo);
  };

  for (const f of FUNCOES) {
    conferir(`função ${f}`, new RegExp(`FUNCTION "public"\\."${f}"`).test(dump));
  }

  for (const t of TABELAS_DE_MIGRATION) {
    conferir(`tabela ${t}`, new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${t}"`).test(dump));
  }

  const semRls = TABELAS_COM_RLS.filter(
    (t) => !new RegExp(`ALTER TABLE "public"\\."${t}" ENABLE ROW LEVEL SECURITY`).test(dump),
  );
  conferir(`RLS nas ${TABELAS_COM_RLS.length} tabelas`, semRls.length === 0);
  if (semRls.length) console.log(`        sem RLS: ${semRls.join(', ')}`);

  const triggers = [
    ...dump.matchAll(
      /CREATE OR REPLACE TRIGGER "([^"]+)"[\s\S]{0,160}?ON "public"\."admin_audit_log"/g,
    ),
  ].map((m) => m[1]);
  conferir('audit log append-only (triggers)', triggers.length >= 2);
  if (triggers.length) console.log(`        ${triggers.join(', ')}`);

  const policies = [...dump.matchAll(/CREATE POLICY "([^"]+)" ON "public"\."([^"]+)"/g)];
  console.log(`  ${policies.length} policies: ${policies.map((p) => p[2]).join(', ')}`);

  // ─── W1-01: a coluna do arquivo pago ───────────────────────────────
  // RLS filtra LINHA, não coluna. Sem o revoke, `select=download_url` entrega
  // o caminho do produto pago mesmo com a policy de leitura correta.
  const colunas = [
    ...new Set(
      [
        ...dump.matchAll(
          /GRANT SELECT\("([^"]+)"\) ON TABLE "public"\."products" TO "(?:anon|authenticated)"/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
  const tabelaInteira = /GRANT [^;]*\bSELECT\b[^;(]*ON TABLE "public"\."products" TO "anon"/.test(
    dump,
  );

  conferir('W1-01 · download_url fora dos grants do anon', !colunas.includes('download_url'));
  conferir('W1-01 · sem SELECT na tabela products inteira', !tabelaInteira);
  console.log(`        ${colunas.length} colunas grantadas ao anon/authenticated`);

  return faltas;
}

const ref = exigirLink();
console.log(`projeto: ${ref}\n`);

const { sohRemotas } = conferirHistorico();
const faltas = conferirSchema();

console.log('\n━━ Resultado ━━');
if (faltas.length === 0) {
  console.log('Schema em produção bate com o que as migrations declaram.');
} else {
  for (const f of faltas) console.log(` • ausente: ${f}`);
}
console.log('Jobs do pg_cron NÃO são cobertos aqui — ver a nota no topo do arquivo.');

process.exit(faltas.length || sohRemotas.length ? 1 : 0);
