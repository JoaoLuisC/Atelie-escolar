import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// REGRA E1 — "rate limit em todo endpoint público, sem exceção" (item P3.1).
//
// POR QUE ESTE TESTE EXISTE E NÃO UM `grep` NO REVIEW
// O CONTRIBUTING registrou "5 endpoints públicos sem rate limit → 0" em
// 13/08/2026. A remedição de 18/08 encontrou OUTROS CINCO. Não foi regressão
// do código: foi a contagem que nunca virou gate, então nada impediu o número
// de voltar a subir. Esta suíte é o gate.
//
// A lista de dispensas abaixo é NOMEADA e cada linha diz por quê. Endpoint
// novo sem contador e sem entrada aqui derruba o teste — que é exatamente a
// propriedade que faltava.
// ════════════════════════════════════════════════════════════════════

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(HERE, '..');

/**
 * Dispensas com motivo. Uma entrada aqui é uma decisão registrada, não uma
 * omissão — e removê-la exige explicar o que mudou.
 */
const DISPENSADOS = Object.freeze({
  'webhook.js': 'Verificação de assinatura HMAC do Mercado Pago já é a guarda.',
  'cron-email-jobs.js': 'Autoriza por CRON_SECRET no header; chamado 1x/hora pelo agendador.',
  'customer-orders.js': 'Atrás da sessão de cliente (cookie HttpOnly assinado).',
  'auth/customer/session.js': 'Só lê o próprio cookie de sessão; não toca recurso caro.',
  'auth/customer/logout.js': 'Só limpa o próprio cookie.',
  'admin/session.js': 'Só lê o próprio cookie de sessão admin.',
  'admin/logout.js': 'Só limpa o próprio cookie.',
  'notfound.js': 'Devolve 404 JSON constante; não consulta nada.',
  'sitemap.xml.js': 'Servido pelo CDN via Cache-Control; conteúdo público por definição.',
});

function listHandlers(dir = API_DIR, prefix = '') {
  const found = [];

  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      found.push(...listHandlers(full, prefix ? `${prefix}/${entry}` : entry));
      continue;
    }

    if (!entry.endsWith('.js') || entry.endsWith('.test.js')) continue;
    found.push({
      id: prefix ? `${prefix}/${entry}` : entry,
      source: readFileSync(full, 'utf8'),
    });
  }

  return found;
}

const handlers = listHandlers();

function temGuarda({ source }) {
  return source.includes('enforceRateLimit') || source.includes('ensureAdminSession');
}

describe('regra E1 · cobertura de rate limit em api/ (P3.1)', () => {
  it('encontra os handlers no disco', () => {
    expect(handlers.length).toBeGreaterThan(40);
  });

  it('todo handler tem contador próprio, sessão admin, ou dispensa registrada', () => {
    const descobertos = handlers.filter((h) => !temGuarda(h) && !(h.id in DISPENSADOS));
    expect(descobertos.map((h) => h.id)).toEqual([]);
  });

  it('não há dispensa apontando para arquivo que não existe mais (regra D4)', () => {
    const ids = new Set(handlers.map((h) => h.id));
    const orfas = Object.keys(DISPENSADOS).filter((id) => !ids.has(id));
    expect(orfas).toEqual([]);
  });

  it('nenhuma dispensa esconde um handler que já ganhou contador', () => {
    // Se um dispensado passou a chamar `enforceRateLimit`, a dispensa virou
    // documentação errada — o mesmo defeito que a regra D4 descreve.
    const redundantes = handlers.filter((h) => h.id in DISPENSADOS && temGuarda(h));
    expect(redundantes.map((h) => h.id)).toEqual([]);
  });

  it('os cinco do item P3.1 estão cobertos', () => {
    const alvos = [
      'send-confirmation-email.js',
      'auth/customer/register.js',
      'auth/customer/google/start.js',
      'auth/customer/google/callback.js',
      'confirm-subscription.js',
    ];

    for (const alvo of alvos) {
      const handler = handlers.find((h) => h.id === alvo);
      expect(handler, `handler ${alvo} não encontrado`).toBeDefined();
      expect(handler.source, `${alvo} sem enforceRateLimit`).toContain('enforceRateLimit');
    }
  });
});
