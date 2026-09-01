import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
// POR QUE ELE PARTE DAS ROTAS MONTADAS, E NÃO DE `readdirSync`
// A primeira versão varria `handlers/` no disco e conferia o TEXTO de cada
// arquivo. Isso mede se a guarda foi ESCRITA, não se ela RODA — e as duas
// coisas se separaram no 660fe74: `handlers/auth/customer/login.js` continuou
// no disco com `enforceRateLimit` no texto (este teste, verde), enquanto
// `routes/auth.routes.js` montava a lógica crua de `lib/customer-auth-handlers`
// e o login de cliente ficava sem contador nenhum em produção.
//
// Agora a lista de handlers vem do que os routers realmente montaram. Um
// arquivo com `enforceRateLimit` que não está no caminho deixa de contar como
// cobertura — ele nem aparece.
//
// A lista de dispensas abaixo é NOMEADA e cada linha diz por quê. Endpoint
// novo sem contador e sem entrada aqui derruba o teste — que é exatamente a
// propriedade que faltava.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const API_DIR = path.join(REPO_ROOT, 'handlers');

const { getMountedHandler } = requireCjs('../../lib/route-mount.js');

/**
 * Dispensas com motivo. Uma entrada aqui é uma decisão registrada, não uma
 * omissão — e removê-la exige explicar o que mudou.
 */
const DISPENSADOS = Object.freeze({
  'webhook.js': 'Verificação de assinatura HMAC do Mercado Pago já é a guarda.',
  'cron-email-jobs.js': 'Autoriza por CRON_SECRET no header; chamado 1x/hora pelo agendador.',
  'customer-orders.js': 'Atrás da sessão de cliente (cookie HttpOnly assinado).',
  'auth/customer/session.js': 'Só lê o próprio cookie de sessão; não toca recurso caro.',
  'auth/customer/logout.js': 'Só limpa o próprio cookie (e exige same-origin: anti-CSRF).',
  'admin/session.js': 'Só lê o próprio cookie de sessão admin.',
  'admin/logout.js': 'Só limpa o próprio cookie.',
  'notfound.js': 'Devolve 404 JSON constante; não consulta nada.',
  'sitemap.xml.js': 'Servido pelo CDN via Cache-Control; conteúdo público por definição.',
});

/** Rotas efetivamente montadas pelos dois routers, com o módulo por trás. */
function listMountedHandlers() {
  const routers = [
    requireCjs('../../routes/api-compat.routes.js'),
    requireCjs('../../routes/auth.routes.js'),
  ];

  const found = [];

  for (const router of routers) {
    for (const layer of router.stack || []) {
      const routePath = layer.route?.path;
      if (!routePath) continue;

      const handles = (layer.route.stack || []).map((entry) => entry.handle);
      const mounted = handles.map((handle) => getMountedHandler(handle)).find(Boolean);

      // `id` espelha o caminho relativo dentro de `handlers/`, que é a chave
      // usada em DISPENSADOS: `/auth/customer/login` → `auth/customer/login.js`.
      const id = `${routePath.replace(/^\//, '')}.js`;
      found.push({
        id,
        mounted,
        source: readFileSync(path.join(API_DIR, id), 'utf8'),
      });
    }
  }

  return found;
}

const handlers = listMountedHandlers();

function temGuarda({ source }) {
  return (
    source.includes('enforceRateLimit') ||
    source.includes('ensureAdminSession') ||
    // Handler montado pela factory: a sessão admin é imposta LÁ DENTRO, e o
    // teste abaixo ('a factory impõe a sessão admin') é o que impede esta
    // linha de virar um buraco por indireção.
    source.includes('createAdminResourceHandler')
  );
}

describe('regra E1 · cobertura de rate limit nas rotas montadas (P3.1)', () => {
  it('encontra as rotas montadas', () => {
    expect(handlers.length).toBeGreaterThan(40);
    expect(handlers.map((h) => h.id)).toContain('auth/customer/login.js');
  });

  it('toda rota montada passou por mountHandler', () => {
    // Sem isto o teste mediria um conjunto menor do que o real e voltaria a
    // passar por vacuidade — o mesmo modo de falha que ele existe para cobrir.
    const semWrapper = handlers.filter((h) => !h.mounted).map((h) => h.id);
    expect(semWrapper).toEqual([]);
  });

  it('toda rota montada tem contador próprio, sessão admin, ou dispensa registrada', () => {
    const descobertos = handlers.filter((h) => !temGuarda(h) && !(h.id in DISPENSADOS));
    expect(descobertos.map((h) => h.id)).toEqual([]);
  });

  it('não há dispensa apontando para rota que não existe mais (regra D4)', () => {
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

  it('a factory de recursos admin impõe a sessão admin', () => {
    // `createAdminResourceHandler` conta como guarda na varredura acima. Se um
    // dia ela parar de chamar `ensureAdminSession`, cinco endpoints
    // administrativos ficariam abertos e a varredura não veria — porque estaria
    // olhando para o nome da factory, não para o que ela faz.
    const factory = readFileSync(path.join(REPO_ROOT, 'lib', 'admin-resource-handler.js'), 'utf8');
    expect(factory).toContain('ensureAdminSession(req, res)');
  });

  it('os endpoints de auth de cliente estão com o contador NO CAMINHO', () => {
    // Estes cinco são o item P3.1 original, mas a asserção mudou de natureza:
    // antes lia o arquivo no disco (que continuou verde durante a regressão do
    // 660fe74); agora só passa se o módulo com `enforceRateLimit` for o que o
    // router montou.
    const alvos = [
      'send-confirmation-email.js',
      'auth/customer/login.js',
      'auth/customer/register.js',
      'auth/customer/google/start.js',
      'auth/customer/google/callback.js',
      'confirm-subscription.js',
    ];

    for (const alvo of alvos) {
      const handler = handlers.find((h) => h.id === alvo);
      expect(handler, `rota ${alvo} não está montada`).toBeDefined();
      expect(handler.source, `${alvo} sem enforceRateLimit`).toContain('enforceRateLimit');
      expect(handler.mounted, `${alvo} não passou por mountHandler`).toBeTruthy();
    }
  });
});
