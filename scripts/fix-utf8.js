/* Conserta nomes de categorias e produtos que ficaram corrompidos (UTF-8 quebrado).
   Roda via Node + fetch direto, sem passar por bash variables. */

const pat = process.env.SUPABASE_PAT;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!pat || !ref) {
  console.error('SUPABASE_PAT e SUPABASE_PROJECT_REF são obrigatórios');
  process.exit(1);
}

// Correções: cada par é [valor_corrompido, valor_correto]
// Identifica pelo slug (que é ASCII puro, então não pode ter sido corrompido).
const FIXES = [
  // categorias
  { table: 'categories', column: 'name', where: { slug: 'volta-as-aulas' }, value: 'Volta às Aulas' },
  { table: 'categories', column: 'name', where: { slug: 'decoracao-de-sala' }, value: 'Decoração de Sala' },
  { table: 'categories', column: 'name', where: { slug: 'atividades-pedagogicas' }, value: 'Atividades Pedagógicas' },

  // produtos
  { table: 'products', column: 'name', where: { slug: 'caderno-atividades-1o-ano' }, value: 'Caderno de Atividades 1º Ano' },
  { table: 'products', column: 'name', where: { slug: 'dia-das-maes-premium' }, value: 'Dia das Mães Premium' },
  { table: 'products', column: 'name', where: { slug: 'kit-volta-as-aulas' }, value: 'Kit Volta às Aulas' },
  { table: 'products', column: 'description', where: { slug: 'kit-volta-as-aulas' }, value: 'Etiquetas, calendário, varal de boas-vindas e atividades introdutórias.' },
  { table: 'products', column: 'name', where: { slug: 'pascoa-pedagogica' }, value: 'Páscoa Pedagógica' },
  { table: 'products', column: 'description', where: { slug: 'pascoa-pedagogica' }, value: 'Atividades, máscaras e enfeites de Páscoa para Educação Infantil.' },
  { table: 'products', column: 'description', where: { slug: 'kit-festa-junina-completo' }, value: 'Pacote com banners, painéis, lembrancinhas e atividades temáticas. PDF em alta resolução, pronto para imprimir.' },
  { table: 'products', column: 'description', where: { slug: 'painel-formatura-infantil' }, value: 'Painel completo com nome dos alunos, espaço para foto e moldura decorada.' },
  { table: 'products', column: 'description', where: { slug: 'convite-formatura-abc' }, value: 'Modelo de convite para formatura do 5º ano. Editável no Canva.' },
  { table: 'products', column: 'description', where: { slug: 'dia-das-maes-premium' }, value: 'Cartões, painéis e lembrancinhas temáticas para o Dia das Mães.' },
  { table: 'products', column: 'description', where: { slug: 'caderno-atividades-1o-ano' }, value: 'Coletânea de 50 atividades alfabetização e numeralização para 1º ano.' },
  { table: 'products', column: 'description', where: { slug: 'varal-alfabeto-colorido' }, value: 'Letras de A a Z em estilo cartoon para decorar a sala de aula.' },
  { table: 'products', column: 'description', where: { slug: 'banner-quadrilha' }, value: 'Banner decorativo para festa junina. Tamanho 2x1m, alta resolução.' },

  // badge_label de categorias
  { table: 'categories', column: 'badge_label', where: { slug: 'volta-as-aulas' }, value: 'LANÇAMENTO' },
];

function sqlEscape(str) {
  return String(str).replaceAll("'", "''");
}

// Monta um SQL com UPDATEs e devolve o estado após.
const updates = FIXES.map((f) => {
  const whereKey = Object.keys(f.where)[0];
  const whereVal = f.where[whereKey];
  return `update public.${f.table} set ${f.column} = '${sqlEscape(f.value)}' where ${whereKey} = '${sqlEscape(whereVal)}';`;
}).join('\n');

const verify = `
select 'categorias' as tipo, name, slug from public.categories order by sort_order;
`;

const sql = `${updates}\n${verify}`;

(async () => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ query: sql }),
  });

  console.log('HTTP', r.status);
  const data = await r.json();

  if (!r.ok) {
    console.error('Erro:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('');
  console.log('━━ Estado final das categorias ━━');
  if (Array.isArray(data)) {
    for (const row of data) {
      console.log(`  ${row.name.padEnd(25)}  (${row.slug})`);
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
})().catch((e) => {
  console.error('Falha:', e.message);
  process.exit(1);
});
