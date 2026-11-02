/* Sincroniza a configuração do Supabase Auth de PRODUÇÃO com o repositório.
 *
 * O release (`supabase db push`) só aplica migrations: o `supabase/config.toml`
 * e os templates de e-mail NÃO vão para o projeto hospedado. Sem este script,
 * produção fica com o template padrão do Supabase (em inglês, link para
 * supabase.co — o Gmail marca como suspeito), senha mínima de 6 caracteres e
 * sem o fluxo por token_hash que faz o link de recuperação abrir em qualquer
 * navegador.
 *
 * O que ele grava (Management API, PATCH /v1/projects/{ref}/config/auth):
 *   • site_url = APP_URL e APP_URL/** na uri_allow_list (só ACRESCENTA — a
 *     versão antiga trocava a lista inteira pelos endereços de dev);
 *   • política de senha: mínimo 8, com minúscula, maiúscula, número e símbolo
 *     (a mesma de supabase/config.toml, do cadastro e do painel);
 *   • assunto e HTML dos e-mails de recuperação de senha e de confirmação de
 *     cadastro (supabase/config.toml + supabase/templates/*.html);
 *   • nome do remetente do SMTP.
 *
 * Uso:
 *   SUPABASE_PAT=... SUPABASE_PROJECT_REF=... APP_URL=https://... node scripts/configure-auth.js
 *   --show       só mostra a configuração atual (sem gravar)
 *   --dry-run    mostra o que seria gravado, sem gravar
 *   INCLUDE_LOCALHOST=1 libera redirects para localhost (só para um projeto de dev)
 */
const fs = require('node:fs');
const path = require('node:path');

const pat = process.env.SUPABASE_PAT;
const ref = process.env.SUPABASE_PROJECT_REF;
const appUrl = String(process.env.APP_URL || '')
  .trim()
  .replace(/\/+$/, '');
const args = new Set(process.argv.slice(2));

if (!pat || !ref) {
  console.error('SUPABASE_PAT e SUPABASE_PROJECT_REF obrigatórios');
  process.exit(1);
}

// localhost só entra a pedido (INCLUDE_LOCALHOST=1): a lista de produção tem
// apenas o endereço da loja, e o projeto local usa o MESMO Supabase — reabrir
// redirect para localhost em produção não pode ser efeito colateral.
const DEV_URLS =
  process.env.INCLUDE_LOCALHOST === '1'
    ? [5173, 5174, 5175, 5176, 3000].flatMap((port) => [
        `http://localhost:${port}`,
        `http://localhost:${port}/**`,
      ])
    : [];

// Formato que o GoTrue usa para "minúscula, maiúscula, número e símbolo": as
// classes separadas por ":" (a barra invertida é um dos símbolos e o ":" vai
// escapado: `\\:` — com uma barra só a API responde 400). É o
// mesmo valor que a CLI grava para `password_requirements =
// "lower_upper_letters_digits_symbols"`.
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = LOWER.toUpperCase();
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\\\:"|<>?,./`~';
const PASSWORD_REQUIRED_CHARACTERS = [LOWER, UPPER, DIGITS, SYMBOLS].join(':');
const PASSWORD_MIN_LENGTH = 8;
const SMTP_SENDER_NAME = 'Ateliê da Escola';

const ROOT = path.resolve(__dirname, '..');

/** Assunto de cada template, lido do config.toml (fonte única com o CLI). */
function readTemplateSubjects() {
  const toml = fs.readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  const subjects = {};
  for (const kind of ['recovery', 'confirmation']) {
    const block = toml.match(
      new RegExp(`\\[auth\\.email\\.template\\.${kind}\\]\\s*\\n(?:[^\\[]*?)subject = "([^"]+)"`),
    );
    if (!block) throw new Error(`config.toml sem subject para o template ${kind}`);
    subjects[kind] = block[1];
  }
  return subjects;
}

function readTemplate(kind) {
  return fs.readFileSync(path.join(ROOT, 'supabase', 'templates', `${kind}.html`), 'utf8');
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = {
  Authorization: `Bearer ${pat}`,
  'Content-Type': 'application/json; charset=utf-8',
};

function summarize(config) {
  const cut = (value) =>
    value ? `${String(value).replace(/\s+/g, ' ').slice(0, 60)}…` : '(vazio)';
  return {
    site_url: config.site_url,
    uri_allow_list: config.uri_allow_list,
    password_min_length: config.password_min_length,
    password_required_characters: config.password_required_characters || '(nenhum requisito)',
    smtp_sender_name: config.smtp_sender_name,
    mailer_subjects_recovery: config.mailer_subjects_recovery,
    mailer_templates_recovery_content: cut(config.mailer_templates_recovery_content),
    mailer_subjects_confirmation: config.mailer_subjects_confirmation,
    mailer_templates_confirmation_content: cut(config.mailer_templates_confirmation_content),
  };
}

(async () => {
  const atual = await fetch(endpoint, { headers });
  if (!atual.ok) {
    console.error('Erro ao ler a config atual: HTTP', atual.status);
    process.exit(1);
  }
  const config = await atual.json();
  console.log('Configuração atual:', JSON.stringify(summarize(config), null, 2));
  if (args.has('--show')) return;

  const existentes = String(config.uri_allow_list || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const producao = /^https:\/\//.test(appUrl) ? [appUrl, `${appUrl}/**`] : [];
  const lista = [...new Set([...existentes, ...DEV_URLS, ...producao])];
  const subjects = readTemplateSubjects();

  const body = {
    uri_allow_list: lista.join(','),
    password_min_length: PASSWORD_MIN_LENGTH,
    password_required_characters: PASSWORD_REQUIRED_CHARACTERS,
    smtp_sender_name: SMTP_SENDER_NAME,
    mailer_subjects_recovery: subjects.recovery,
    mailer_templates_recovery_content: readTemplate('recovery'),
    mailer_subjects_confirmation: subjects.confirmation,
    mailer_templates_confirmation_content: readTemplate('confirmation'),
  };
  if (producao.length) body.site_url = appUrl;

  if (args.has('--dry-run')) {
    console.log('Seria gravado:', JSON.stringify(summarize(body), null, 2));
    return;
  }

  const r = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  console.log('HTTP', r.status);
  if (!r.ok) {
    console.error('Erro:', JSON.stringify(data, null, 2));
    console.error(
      'Se o erro for em password_required_characters, escolha no painel: Authentication → ' +
        'Providers → Email → Password requirements → "Lowercase, uppercase letters, digits and symbols".',
    );
    process.exit(1);
  }
  console.log('Gravado:', JSON.stringify(summarize(data), null, 2));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
