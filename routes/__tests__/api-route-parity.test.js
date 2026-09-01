import { createRequire } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// PARIDADE DE ROTAS ENTRE O DISCO E O QUE O EXPRESS SERVE — P0.4 / ADR 0002.
//
// Os routers de `routes/` listam os handlers UM POR UM, à mão. Este teste é o
// que impede a lista manual de divergir de `handlers/` sem depender de
// disciplina. Ele NÃO lê o texto dos arquivos de rota: monta os routers de
// verdade e inspeciona `router.stack`, que é o que o Express realmente serve.
//
// POR QUE ELE COMPARA MÓDULO, E NÃO SÓ CAMINHO
// A primeira versão comparava apenas STRINGS de caminho, e por isso não viu a
// regressão do 660fe74: `/auth/customer/login` existia no disco e existia no
// router, então passava — mas o router montava a lógica crua de
// `lib/customer-auth-handlers`, e não o módulo de `handlers/auth/customer/`
// que carrega `enforceRateLimit` e a checagem anti-CSRF. Caminho certo, código
// errado: login, cadastro e OAuth de cliente ficaram sem contador nenhum em
// produção, com este teste verde.
//
// Comparar identidade de módulo fecha a classe inteira: um caminho servido por
// qualquer coisa que não seja o seu arquivo em `handlers/` falha aqui.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const API_DIR = path.join(REPO_ROOT, 'handlers');

const { getMountedHandler } = requireCjs('../../lib/route-mount.js');

/** Todo `handlers/**\/*.js` que não seja teste, como caminho relativo a `/api`. */
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
    // `handlers/sitemap.xml.js` vira `/sitemap.xml`: só o `.js` final sai.
    found.push(`${prefix}/${entry.slice(0, -3)}`);
  }

  return found;
}

/**
 * O que um Express Router registrou, de verdade: o caminho e o MÓDULO por trás
 * do middleware montado naquele caminho.
 */
function listMountedRoutes(router) {
  return (router.stack || [])
    .filter((layer) => layer.route?.path)
    .map((layer) => {
      const handles = (layer.route.stack || []).map((entry) => entry.handle);
      return {
        routePath: layer.route.path,
        // `getMountedHandler` devolve undefined para middleware que não passou
        // por `mountHandler` — é assim que "montado de um jeito diferente"
        // vira falha em vez de passar despercebido.
        module: handles.map((handle) => getMountedHandler(handle)).find(Boolean),
      };
    });
}

const apiRoutePaths = listApiRoutePaths();
const mountedRoutes = [
  ...listMountedRoutes(requireCjs('../api-compat.routes.js')),
  ...listMountedRoutes(requireCjs('../auth.routes.js')),
];
const mountedPaths = mountedRoutes.map((route) => route.routePath);

describe('paridade de rotas handlers/ ↔ routes/ (P0.4)', () => {
  it('encontra os handlers de handlers/ no disco', () => {
    // Guarda contra o pior modo de falha deste teste: varrer a pasta errada e
    // passar por vacuidade, comparando duas listas vazias.
    expect(apiRoutePaths.length).toBeGreaterThan(40);
    expect(apiRoutePaths).toContain('/products');
    expect(apiRoutePaths).toContain('/admin/orders');
    expect(apiRoutePaths).toContain('/auth/customer/login');
  });

  it('todo handler de handlers/ tem rota montada no Express', () => {
    const semRota = apiRoutePaths.filter((route) => !mountedPaths.includes(route));
    expect(semRota).toEqual([]);
  });

  it('toda rota montada no Express corresponde a um handler de handlers/', () => {
    const semHandler = mountedPaths.filter((route) => !apiRoutePaths.includes(route));
    expect(semHandler).toEqual([]);
  });

  // ── A verificação que teria pego o 660fe74 ────────────────────────
  it('cada rota serve o MÓDULO do arquivo de handlers/ correspondente', () => {
    const divergentes = [];

    for (const { routePath, module } of mountedRoutes) {
      const esperado = requireCjs(path.join(API_DIR, `${routePath}.js`));
      if (module !== esperado) {
        divergentes.push({
          rota: routePath,
          // Sem `mountHandler` não há como saber o que foi montado: o caso
          // aparece como `null` e falha do mesmo jeito.
          montado: module ? module.name || '(anônimo)' : '(não passou por mountHandler)',
          esperado: `handlers${routePath}.js`,
        });
      }
    }

    expect(divergentes).toEqual([]);
  });

  it('toda rota foi montada por mountHandler', () => {
    // `mountHandler` é o que silencia CORS duplicado e encaminha rejeição de
    // promessa ao errorHandler. Uma rota montada sem ele perde as duas coisas
    // — e some do teste de identidade acima, que é o pior dos dois efeitos.
    const semWrapper = mountedRoutes.filter((route) => !route.module).map((r) => r.routePath);
    expect(semWrapper).toEqual([]);
  });
});
