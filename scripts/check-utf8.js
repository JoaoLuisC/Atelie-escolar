const pat = process.env.SUPABASE_PAT;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!pat || !ref) {
  console.error('SUPABASE_PAT e SUPABASE_PROJECT_REF obrigatórios');
  process.exit(1);
}

const sql = `
select name, encode(name::bytea, 'hex') as hex
from public.categories
where name ~ '[^[:ascii:]]'
order by sort_order;

select name, encode(name::bytea, 'hex') as hex
from public.products
where name ~ '[^[:ascii:]]' or description ~ '[^[:ascii:]]'
order by name;
`;

(async () => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ query: sql }),
  });
  console.log('HTTP', r.status);
  const data = await r.json();
  if (!r.ok) {
    console.error(data);
    process.exit(1);
  }
  for (const row of data) {
    // U+FFFD em UTF-8 = ef bf bd. Se aparecer, ainda tem corrupção.
    const corrupted = row.hex.includes('efbfbd');
    const marker = corrupted ? ' ✘ CORROMPIDO' : ' ✓ OK';
    console.log(`  ${row.name.padEnd(28)}${marker}`);
  }
})();
