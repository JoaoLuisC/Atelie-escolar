/* Diagnóstico do Supabase — bypassa DNS local usando 8.8.8.8 */
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');

// Forçar Google DNS — contorna problema de resolver local
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Carregar .env.local manualmente
const envFiles = ['.env.local', '.env'];
for (const file of envFiles) {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) continue;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('━━━ Configuração ━━━');
console.log('URL          :', url || '(VAZIO)');
console.log('ANON_KEY     :', anon ? `${anon.slice(0, 20)}…${anon.slice(-6)}` : '(VAZIO)');
console.log('SERVICE_KEY  :', service ? `${service.slice(0, 20)}…${service.slice(-6)}` : '(VAZIO)');
console.log('');

if (!url || !anon || !service) {
  console.error('✘ Variáveis de ambiente faltando');
  process.exit(1);
}

const EXPECTED_TABLES = [
  'categories',
  'products',
  'orders',
  'order_items',
  'profiles',
  'admin_settings',
  'download_tokens',
];

(async () => {
  console.log('━━━ Testando autenticação ━━━');

  // Teste base — pega o root da API
  try {
    const r = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    });
    console.log('GET /rest/v1/  →', r.status, r.statusText);
    if (!r.ok) {
      const body = await r.text();
      console.error('  body:', body.slice(0, 300));
      process.exit(1);
    }
  } catch (e) {
    console.error('✘ Falha de conexão:', e.message);
    process.exit(1);
  }

  console.log('');
  console.log('━━━ Inventário de tabelas ━━━');

  const found = [];
  const missing = [];

  for (const table of EXPECTED_TABLES) {
    try {
      const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
        headers: {
          apikey: service,
          Authorization: `Bearer ${service}`,
          Prefer: 'count=exact',
        },
      });

      if (r.ok) {
        const range = r.headers.get('content-range') || '';
        const count = range.split('/')[1] || '?';
        console.log(`  ✓ ${table.padEnd(20)} (${count} linhas)`);
        found.push(table);
      } else if (r.status === 404) {
        console.log(`  ✘ ${table.padEnd(20)} (não existe)`);
        missing.push(table);
      } else {
        const body = await r.text();
        console.log(`  ⚠ ${table.padEnd(20)} HTTP ${r.status}: ${body.slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`  ⚠ ${table.padEnd(20)} erro: ${e.message}`);
    }
  }

  console.log('');
  console.log('━━━ Resumo ━━━');
  console.log('Tabelas encontradas :', found.length, '/', EXPECTED_TABLES.length);
  if (missing.length) {
    console.log('Faltando            :', missing.join(', '));
  }
  console.log('');
  console.log('✓ Conexão OK');
})().catch((e) => {
  console.error('Erro inesperado:', e);
  process.exit(1);
});
