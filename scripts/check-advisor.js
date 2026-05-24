/* Lê /v1/projects/{ref}/advisors/security e imprime resumo */
const pat = process.env.SUPABASE_PAT;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!pat || !ref) {
  console.error('SUPABASE_PAT e SUPABASE_PROJECT_REF são obrigatórios');
  process.exit(1);
}

(async () => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, {
    headers: { Authorization: `Bearer ${pat}` },
  });

  if (!r.ok) {
    console.error('HTTP', r.status, await r.text());
    process.exit(1);
  }

  const data = await r.json();
  const lints = data.lints || [];

  const counts = { CRITICAL: 0, WARN: 0, INFO: 0 };
  for (const l of lints) {
    counts[l.level] = (counts[l.level] || 0) + 1;
  }

  console.log('━━ Resumo de lints de segurança ━━');
  console.log(`CRITICAL: ${counts.CRITICAL}  |  WARN: ${counts.WARN}  |  INFO: ${counts.INFO}`);
  console.log('');
  console.log('━━ Detalhes ━━');
  for (const l of lints) {
    const detail = String(l.detail || '').replace(/`/g, '').slice(0, 100);
    console.log(` [${l.level.padEnd(8)}] ${l.title}`);
    console.log(`            ${detail}`);
  }
})().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
