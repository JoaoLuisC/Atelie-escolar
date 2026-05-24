/* Configura URLs permitidas de redirect para OAuth no Supabase. */
const pat = process.env.SUPABASE_PAT;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!pat || !ref) {
  console.error('SUPABASE_PAT e SUPABASE_PROJECT_REF obrigatórios');
  process.exit(1);
}

const ALLOWED_URLS = [
  'http://localhost:5173',
  'http://localhost:5173/**',
  'http://localhost:5174',
  'http://localhost:5174/**',
  'http://localhost:5175',
  'http://localhost:5175/**',
  'http://localhost:5176',
  'http://localhost:5176/**',
  'http://localhost:3000',
  'http://localhost:3000/**',
];

(async () => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      site_url: 'http://localhost:5173',
      uri_allow_list: ALLOWED_URLS.join(','),
    }),
  });

  console.log('HTTP', r.status);
  const data = await r.json();
  if (!r.ok) {
    console.error('Erro:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✓ site_url       :', data.site_url);
  console.log('✓ uri_allow_list :', data.uri_allow_list);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
