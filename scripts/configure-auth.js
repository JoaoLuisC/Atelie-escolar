/* Configura as URLs de redirecionamento do Supabase Auth (OAuth Google e reset de senha).
 *
 * LÊ a configuração atual e só ACRESCENTA: a versão anterior gravava
 * `site_url = http://localhost:5173` e trocava a lista inteira pelos endereços de
 * dev — rodada contra produção, mandava os e-mails de redefinição de senha para
 * localhost. Agora:
 *   • `site_url` vem de APP_URL (o endereço público da loja) e só muda se ele
 *     estiver definido;
 *   • `uri_allow_list` é a lista atual + localhost de dev + APP_URL/**, sem
 *     remover nada que já estivesse lá.
 *
 * Uso: SUPABASE_PAT=... SUPABASE_PROJECT_REF=... APP_URL=https://... node scripts/configure-auth.js
 */
const pat = process.env.SUPABASE_PAT;
const ref = process.env.SUPABASE_PROJECT_REF;
const appUrl = String(process.env.APP_URL || '')
  .trim()
  .replace(/\/+$/, '');

if (!pat || !ref) {
  console.error('SUPABASE_PAT e SUPABASE_PROJECT_REF obrigatórios');
  process.exit(1);
}

const DEV_URLS = [5173, 5174, 5175, 5176, 3000].flatMap((port) => [
  `http://localhost:${port}`,
  `http://localhost:${port}/**`,
]);

const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = {
  Authorization: `Bearer ${pat}`,
  'Content-Type': 'application/json; charset=utf-8',
};

(async () => {
  const atual = await fetch(endpoint, { headers });
  if (!atual.ok) {
    console.error('Erro ao ler a config atual: HTTP', atual.status);
    process.exit(1);
  }
  const config = await atual.json();

  const existentes = String(config.uri_allow_list || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const producao = /^https:\/\//.test(appUrl) ? [appUrl, `${appUrl}/**`] : [];
  const lista = [...new Set([...existentes, ...DEV_URLS, ...producao])];

  const body = { uri_allow_list: lista.join(',') };
  if (producao.length) body.site_url = appUrl;

  const r = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify(body) });
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
