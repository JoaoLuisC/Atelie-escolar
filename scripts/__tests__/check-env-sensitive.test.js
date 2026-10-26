import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

// scripts/check-env.js no build do workflow de release (GitHub Actions →
// `vercel pull` → `vercel build`). Variáveis "Sensitive" da Vercel chegam como
// o texto literal "[SENSITIVE]": o valor real só existe em execução. Antes
// disso o gate as lia como "curtas demais" e barrava todo deploy de produção.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'check-env.js');
// Diretório vazio: nenhum .env do desenvolvedor entra no teste.
const EMPTY_DIR = mkdtempSync(path.join(tmpdir(), 'check-env-'));

const MARKER = '[SENSITIVE]';
const SENSITIVE = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_SESSION_SECRET',
  'ADMIN_2FA_ENC_KEY',
  'CUSTOMER_SESSION_SECRET',
  'WEBHOOK_SECRET',
  'MERCADOPAGO_ACCESS_TOKEN',
  'CRON_SECRET',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'APP_ENV',
];

function run(overrides = {}) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    VERCEL_ENV: 'production',
    // Variáveis "Config" (não sensíveis) chegam com o valor real.
    VITE_SUPABASE_URL: 'https://projeto.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'chave-publica-de-teste-com-tamanho-suficiente-0123456789',
    APP_URL: 'https://professoramarcia.ateliedaescola.com.br',
    CORS_ORIGINS: 'https://professoramarcia.ateliedaescola.com.br',
    ...Object.fromEntries(SENSITIVE.map((name) => [name, MARKER])),
    ...overrides,
  };
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: EMPTY_DIR, env, encoding: 'utf8' });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

afterAll(() => {
  rmSync(EMPTY_DIR, { recursive: true, force: true });
});

describe('check-env · variáveis Sensitive da Vercel', () => {
  it('build com os segredos marcados como Sensitive passa, avisando que não dá para validar', () => {
    const { code, output } = run();

    expect(code).toBe(0);
    expect(output).toMatch(/protegida pela Vercel/);
    expect(output).not.toMatch(/BLOQUEANTE/);
  });

  it('APP_ENV Sensitive não dispara o alerta de ambiente divergente', () => {
    expect(run().output).not.toMatch(/APP_ENV diferente/);
  });

  it('valor REAL inválido continua bloqueando (o marcador não abre brecha)', () => {
    const { code, output } = run({ ADMIN_SESSION_SECRET: 'curta' });

    expect(code).toBe(1);
    expect(output).toMatch(/ADMIN_SESSION_SECRET — curto demais/);
  });

  it('APP_ENV real diferente de production continua bloqueando', () => {
    const { code, output } = run({ APP_ENV: 'preview' });

    expect(code).toBe(1);
    expect(output).toMatch(/APP_ENV diferente/);
  });
});
