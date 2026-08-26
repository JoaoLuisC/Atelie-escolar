import { createRequire } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// PARIDADE DE ROTAS ENTRE PRODUÇÃO E DESENVOLVIMENTO — item P0.4 / ADR 0002.
//
// Em produção a Vercel deriva as rotas do SISTEMA DE ARQUIVOS de `api/`.
// Em desenvolvimento, `routes/api-compat.routes.js` e `routes/auth.routes.js`
// listam os handlers UM POR UM, à mão. Nada comparava as duas listas, e ela já
// tinha divergido: `/api/sitemap.xml` e `/api/notfound` eram servidos em
// produção e não existiam em `npm run dev:api`.
//
// Este teste é o que impede a lista manual de divergir sem depender de
// disciplina. Ele NÃO lê o texto dos arquivos de rota: monta os routers de
// verdade e inspeciona `router.stack`, que é o que o Express realmente serve.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const API_DIR = path.join(REPO_ROOT, 'handlers');

/** Todo `api/**\/*.js` que não seja teste, como caminho relativo a `/api`. */
function listApiRoutePaths(dir = API_DIR, prefix = '') {
  const found = [];

  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      found.push(...listApiRoutePaths(full, `${prefix}/${entry}`));
      continue;
    }

    if (!entry.endsWith('.js')) continue;
    if (entry.endsWith('.test.js')) continue;
    // `api/sitemap.xml.js` vira `/sitemap.xml`: só o `.js` final sai.
    found.push(`${prefix}/${entry.slice(0, -3)}`);
  }

  return found;
}

/** Caminhos que um Express Router realmente registrou. */
function listRouterPaths(router) {
  return (router.stack || []).map((layer) => layer.route?.path).filter(Boolean);
}

const apiRoutePaths = listApiRoutePaths();
const mountedPaths = [
  ...listRouterPaths(requireCjs('../api-compat.routes.js')),
  ...listRouterPaths(requireCjs('../auth.routes.js')).map((p) =>
    // auth.routes.js monta com o prefixo `/auth/...` já embutido no caminho.
    p.startsWith('/') ? p : `/${p}`,
  ),
];

describe('paridade de rotas api/ ↔ routes/ (P0.4)', () => {
  it('encontra os handlers de api/ no disco', () => {
    // Guarda contra o pior modo de falha deste teste: varrer a pasta errada e
    // passar por vacuidade, comparando duas listas vazias.
    expect(apiRoutePaths.length).toBeGreaterThan(40);
    expect(apiRoutePaths).toContain('/products');
    expect(apiRoutePaths).toContain('/admin/orders');
    expect(apiRoutePaths).toContain('/auth/customer/login');
  });

  it('todo handler de api/ tem rota montada no Express', () => {
    const semRota = apiRoutePaths.filter((route) => !mountedPaths.includes(route));
    expect(semRota).toEqual([]);
  });

  it('toda rota montada no Express corresponde a um handler de api/', () => {
    const semHandler = mountedPaths.filter((route) => !apiRoutePaths.includes(route));
    expect(semHandler).toEqual([]);
  });
});
