import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// TODO ENDPOINT ADMIN QUE ESCREVE ESTÁ NO AUDIT LOG — regra I1.
//
// POR QUE ESTE GATE EXISTE
// A contagem manual já provou que ela sobe de novo. Em 01/09/2026 dois
// writers estavam fora do `logAdminAction` — `admin/cleanup-events` (purga
// `analytics_events`) e `admin/upload-url` (grava e apaga objeto no Storage) —
// e nada acusou, porque "quem audita" era conhecimento de revisão, não teste.
// É o mesmo desfecho que o CONTRIBUTING registra para os endpoints sem rate
// limit: número declarado zero, nenhum gate, número volta a subir.
//
// POR QUE ELE PERGUNTA AO HANDLER QUAIS MÉTODOS ACEITA
// A chave aqui **não pode ser a rota**: `admin/settings` audita o PUT e não o
// GET, e a factory audita todo método que não seja GET. Uma dispensa por rota
// daria verde para um handler que audita UMA de suas ações.
//
// Então a lista de métodos não é lida do texto do arquivo — ela é PERGUNTADA
// ao módulo que o router montou, chamando-o com um verbo que nenhum handler
// aceita e lendo o header `Allow` do 405 (lib/http.js:188-203). É o mesmo
// caminho que a cliente encontraria, e um handler que mude os métodos aceitos
// muda a resposta aqui junto.
//
// O LIMITE DESTE GATE, escrito para ninguém confiar nele além do que ele dá:
// ele prova que uma rota+método de escrita é servida por um módulo que
// audita. Ele NÃO prova que aquela linha específica de auditoria roda naquele
// caminho — isso é trabalho das suítes de comportamento, e elas existem:
// `admin-write-audit.test.js` (cleanup-events e upload-url, com o par
// negativo), `admin-settings-guard.test.js` (o PUT de settings) e
// `lib/__tests__/admin-resource-handler.test.js` (a factory).
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const HANDLERS_DIR = path.join(REPO_ROOT, 'handlers');

const { getMountedHandler } = requireCjs('../../lib/route-mount.js');

const METODOS_DE_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Dispensas por (rota, método), com motivo. Uma entrada aqui é decisão
 * registrada; removê-la exige explicar o que mudou.
 */
const DISPENSADOS = Object.freeze({
  'admin/login.js:POST':
    'Autenticação, não mutação de dado. O rastro dela é security_events (admin_login_ok/failed), que registra tentativa recusada — coisa que o audit log não deve fazer.',
  'admin/logout.js:POST': 'Só limpa o próprio cookie; não toca recurso nenhum.',
});

/** Duplo de resposta mínimo: só o suficiente para colher o header `Allow`. */
function criarRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(nome, valor) {
      res.headers[String(nome).toLowerCase()] = valor;
      return res;
    },
    status(codigo) {
      res.statusCode = codigo;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

/**
 * Métodos que o handler REALMENTE aceita, perguntados a ele.
 *
 * `TRACE` é o verbo sonda: nenhum handler do projeto o aceita, então a
 * resposta é sempre o 405 com a lista completa no `Allow`. Um handler que não
 * use `guardMethod`/`methodNotAllowed` não responde `Allow` — e aparece como
 * lista vazia em vez de passar despercebido (ver o teste de sanidade abaixo).
 */
async function metodosAceitos(modulo) {
  const res = criarRes();
  await modulo({ method: 'TRACE', headers: {}, query: {}, body: {} }, res);

  const allow = res.headers.allow;
  if (!allow) return [];
  return String(allow)
    .split(',')
    .map((metodo) => metodo.trim().toUpperCase())
    .filter((metodo) => metodo && metodo !== 'OPTIONS');
}

/** Rotas administrativas montadas pelos routers, com o módulo por trás. */
function listarRotasAdmin() {
  const routers = [
    requireCjs('../../routes/api-compat.routes.js'),
    requireCjs('../../routes/auth.routes.js'),
  ];

  const encontradas = [];

  for (const router of routers) {
    for (const layer of router.stack || []) {
      const routePath = layer.route?.path;
      if (!routePath || !routePath.startsWith('/admin/')) continue;

      const handles = (layer.route.stack || []).map((entry) => entry.handle);
      const mounted = handles.map((handle) => getMountedHandler(handle)).find(Boolean);
      const id = `${routePath.replace(/^\//, '')}.js`;

      encontradas.push({
        id,
        mounted,
        source: readFileSync(path.join(HANDLERS_DIR, id), 'utf8'),
      });
    }
  }

  return encontradas;
}

const rotas = listarRotasAdmin();

function audita({ source }) {
  return (
    source.includes('logAdminAction') ||
    // A factory audita todo método que não seja GET, num lugar só. O teste
    // 'a factory registra toda escrita' abaixo é o que impede esta linha de
    // virar buraco por indireção.
    source.includes('createAdminResourceHandler')
  );
}

describe('regra I1 · cobertura do audit log nas rotas admin montadas', () => {
  it('encontra as rotas administrativas', () => {
    // Guarda contra o pior modo de falha: varrer errado e passar por vacuidade.
    expect(rotas.length).toBeGreaterThanOrEqual(18);
    expect(rotas.map((r) => r.id)).toContain('admin/settings.js');
    expect(rotas.map((r) => r.id)).toContain('admin/upload-url.js');
  });

  it('toda rota admin passou por mountHandler', () => {
    expect(rotas.filter((r) => !r.mounted).map((r) => r.id)).toEqual([]);
  });

  it('todo handler admin declara os métodos que aceita', async () => {
    // Um handler sem `Allow` no 405 é invisível para o gate abaixo — o
    // conjunto de escrita dele sairia vazio e ele passaria sem auditar nada.
    const mudos = [];
    for (const rota of rotas) {
      const metodos = await metodosAceitos(rota.mounted);
      if (metodos.length === 0) mudos.push(rota.id);
    }
    expect(mudos).toEqual([]);
  });

  it('toda rota+método que ESCREVE audita, ou tem dispensa registrada', async () => {
    const descobertos = [];

    for (const rota of rotas) {
      const metodos = await metodosAceitos(rota.mounted);
      for (const metodo of metodos) {
        if (!METODOS_DE_ESCRITA.has(metodo)) continue;
        const chave = `${rota.id}:${metodo}`;
        if (audita(rota) || chave in DISPENSADOS) continue;
        descobertos.push(chave);
      }
    }

    expect(descobertos).toEqual([]);
  });

  it('não há dispensa apontando para rota+método que não existe mais (regra D4)', async () => {
    const existentes = new Set();
    for (const rota of rotas) {
      for (const metodo of await metodosAceitos(rota.mounted)) {
        existentes.add(`${rota.id}:${metodo}`);
      }
    }

    const orfas = Object.keys(DISPENSADOS).filter((chave) => !existentes.has(chave));
    expect(orfas).toEqual([]);
  });

  it('nenhuma dispensa esconde um handler que já passou a auditar', () => {
    const redundantes = Object.keys(DISPENSADOS).filter((chave) => {
      const rota = rotas.find((r) => r.id === chave.split(':')[0]);
      return rota && audita(rota);
    });

    expect(redundantes).toEqual([]);
  });

  it('a factory registra toda escrita, e não só uma delas', () => {
    // `createAdminResourceHandler` conta como auditoria na varredura acima.
    // Se ela parasse de chamar `logAdminAction`, ou passasse a chamá-lo só
    // para um método, cinco recursos administrativos sairiam do audit log e a
    // varredura não veria — estaria olhando para o nome da factory, não para
    // o que ela faz.
    const factory = readFileSync(path.join(REPO_ROOT, 'lib', 'admin-resource-handler.js'), 'utf8');

    expect(factory).toContain('logAdminAction');
    expect(factory).toMatch(/req\.method !== 'GET'/);
  });
});
