import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installModuleMock,
  loadHandler,
  resetModuleRegistry,
} from '../../handlers/__tests__/money-path-harness.js';

// ════════════════════════════════════════════════════════════════════
// O ENTRYPOINT DE PRODUÇÃO — `api/index.js` + a tabela de `vercel.json`.
//
// POR QUE ESTE ARQUIVO EXISTE
// Os dois gates de montagem que já existem param uma camada ABAIXO daqui:
//
//   • `routes/__tests__/api-route-parity.test.js` compara identidade de módulo
//     dentro dos routers — prova que `/webhook` no router é
//     `handlers/webhook.js`, e nada além disso;
//   • `routes/__tests__/auth-guards-integration.test.js` sobe um servidor de
//     verdade, mas contra `createApiApp` — que é o app POR DENTRO da função.
//
// Ninguém carregava `api/index.js`, que é a única função publicada, nem
// conferia o `vercel.json`, que é quem decide qual `__path` chega nela. Entre a
// URL pública e o router existem duas traduções — a reescrita da borda e o
// `restoreOriginalPath` — e as duas eram território sem teste. É a mesma classe
// do 660fe74: cada peça certa isolada, a montagem errada, suíte verde.
//
// O caminho do dinheiro é o recorte: webhook, create-payment, verify-payment,
// validate-coupon e download. Um erro de tradução aqui não degrada — ele serve
// o handler errado, ou nenhum, para a URL que cobra e para a que entrega o
// arquivo pago.
//
// A tabela de reescrita é LIDA do `vercel.json`, nunca copiada para cá: uma
// cópia congelaria o teste na versão que existia quando ele foi escrito, que é
// exatamente o defeito que ele existe para pegar.
// ════════════════════════════════════════════════════════════════════

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const vercelConfig = JSON.parse(readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8'));

/**
 * Reproduz a reescrita da borda da Vercel para uma URL pública.
 *
 * Só o que este projeto usa: `src` como regex de caminho, `dest` com `$1`, e a
 * parada em `handle: 'filesystem'`. Entradas sem `dest` (o bloco de headers com
 * `continue: true`) não reescrevem nada.
 *
 * @param {string} publicUrl  caminho + query como o cliente digita
 * @param {'dest-first'|'origin-first'} queryOrder  em que ordem a query do
 *        `dest` e a query original são concatenadas. A documentação da Vercel
 *        não fixa isso, então o teste exige o mesmo resultado nas DUAS — uma
 *        garantia que depende de ordem é uma garantia que não existe.
 */
function applyVercelRewrite(publicUrl, queryOrder = 'dest-first') {
  const [pathname, originalQuery = ''] = String(publicUrl).split('?');

  for (const route of vercelConfig.routes || []) {
    if (route.handle === 'filesystem') break;
    if (!route.dest) continue;

    const match = new RegExp(`^${route.src}$`).exec(pathname);
    if (!match) continue;

    const dest = route.dest.replace(/\$(\d)/g, (_, index) => match[Number(index)] ?? '');
    const [destPath, destQuery = ''] = dest.split('?');

    const partes =
      queryOrder === 'dest-first' ? [destQuery, originalQuery] : [originalQuery, destQuery];
    const query = partes.filter(Boolean).join('&');

    // A função é publicada como `api/index.js`; a borda escreve `/api/index`.
    return `${destPath}${query ? `?${query}` : ''}`;
  }

  return publicUrl;
}

// ─── Duplos dos cinco handlers do caminho do dinheiro ────────────────
// O handler real não roda: o que está sob teste é QUAL módulo o entrypoint
// alcança, e com que URL. Cada duplo registra o que recebeu.

const MONEY_HANDLERS = Object.freeze({
  webhook: '../webhook',
  'create-payment': '../create-payment',
  'verify-payment': '../verify-payment',
  'validate-coupon': '../validate-coupon',
  download: '../download',
});

let chamadas = [];

function installMoneyHandlerSpies() {
  chamadas = [];
  for (const [nome, request] of Object.entries(MONEY_HANDLERS)) {
    installModuleMock(
      request,
      vi.fn(async (req, res) => {
        chamadas.push({
          nome,
          url: req.url,
          method: req.method,
          query: { ...req.query },
          body: req.body,
        });
        res.status(200).json({ success: true, handler: nome });
      }),
    );
  }
}

let server;
let baseUrl;
let originalEnv;

function request(method, pathname, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      `${baseUrl}${pathname}`,
      {
        method,
        headers: {
          ...(payload ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Sobe a função como a Vercel a invoca: `module.exports(req, res)`. */
async function bootEntrypoint() {
  const entry = loadHandler('../../api/index.js');
  server = http.createServer((req, res) => entry(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

beforeAll(() => {
  originalEnv = { ...process.env };
});

beforeEach(async () => {
  resetModuleRegistry();
  // O entrypoint lê APP_ENV no topo do módulo e `createApiApp` EXIGE
  // CORS_ORIGINS fora de dev/test. Emular produção é o ponto: é essa
  // configuração que decide o app que a cliente encontra.
  process.env.APP_ENV = 'production';
  process.env.CORS_ORIGINS = 'https://ateliedaescola.com.br';
  installMoneyHandlerSpies();
  await bootEntrypoint();
});

afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = undefined;
  resetModuleRegistry();
  vi.restoreAllMocks();
});

afterAll(() => {
  process.env = originalEnv;
});

describe('vercel.json · a tabela de reescrita da borda', () => {
  it('tem as regras que este teste simula (guarda contra passar por vacuidade)', () => {
    const dests = (vercelConfig.routes || []).map((route) => route.dest).filter(Boolean);
    expect(dests).toContain('/api/index?__path=$1');
    expect(dests).toContain('/api/index?__path=admin/$1');
    expect(vercelConfig.functions).toHaveProperty('api/index.js');
  });

  it('manda todo /api/* para a função única', () => {
    for (const url of [
      '/api/webhook',
      '/api/create-payment',
      '/api/verify-payment',
      '/api/validate-coupon',
      '/api/download',
    ]) {
      expect(applyVercelRewrite(url)).toMatch(/^\/api\/index\?__path=/);
    }
  });
});

describe('api/index.js · a URL pública chega ao handler do caminho do dinheiro', () => {
  const CASOS = [
    { url: '/api/webhook', metodo: 'POST', esperado: 'webhook' },
    { url: '/api/create-payment', metodo: 'POST', esperado: 'create-payment' },
    { url: '/api/verify-payment', metodo: 'POST', esperado: 'verify-payment' },
    { url: '/api/validate-coupon', metodo: 'POST', esperado: 'validate-coupon' },
    { url: '/api/download', metodo: 'GET', esperado: 'download' },
  ];

  it.each(CASOS)('$url executa handlers/$esperado.js', async ({ url, metodo, esperado }) => {
    const res = await request(metodo, applyVercelRewrite(url), {
      body: metodo === 'POST' ? {} : undefined,
    });

    expect(res.status).toBe(200);
    expect(res.body?.handler).toBe(esperado);
    // Um só: rota que casa em dois lugares serviria o primeiro e esconderia
    // o segundo.
    expect(chamadas.map((c) => c.nome)).toEqual([esperado]);
  });

  it('preserva a query original — é dela que sai o token do download', async () => {
    // Sem isto o download responde "token ausente" para um link legítimo já
    // enviado por e-mail: o produto pago deixa de ser entregue e o erro parece
    // do cliente.
    const res = await request('GET', applyVercelRewrite('/api/download?token=abc123&teste=1'));

    expect(res.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].query.token).toBe('abc123');
    expect(chamadas[0].query.teste).toBe('1');
    // `__path` é detalhe de transporte da borda: não pode vazar para o handler.
    expect(chamadas[0].query.__path).toBeUndefined();
  });

  it('preserva o corpo JSON do POST que cria o pagamento', async () => {
    const res = await request('POST', applyVercelRewrite('/api/create-payment'), {
      body: { items: [{ id: 'p1', quantity: 2 }], coupon: 'BEMVINDO' },
    });

    expect(res.status).toBe(200);
    expect(chamadas[0].body).toEqual({ items: [{ id: 'p1', quantity: 2 }], coupon: 'BEMVINDO' });
  });

  it('serve o mesmo módulo pela URL plana de compatibilidade', () => {
    // `/api/admin-*` existe só pela janela de deploy (regra A6). Se a regra
    // `admin/$1` sair do vercel.json, o painel aberto no navegador passa a
    // receber o SPA em HTML com status 200 em vez de JSON.
    expect(applyVercelRewrite('/api/admin-orders')).toBe('/api/index?__path=admin/orders');
  });
});

describe('api/index.js · o cliente não escolhe o endpoint', () => {
  // `__path` é o parâmetro em que a borda escreve o caminho real. A query do
  // cliente é concatenada à do `dest`, então um `?__path=` enviado de fora
  // chega junto — e a ordem da concatenação não é contrato publicado.
  //
  // Enquanto cada handler impõe a própria guarda, isso não é escalada de
  // privilégio: `/api/products?__path=admin/orders` continua esbarrando em
  // `ensureAdminSession`. O que ele quebra é a correspondência entre a URL que
  // a borda roteou e o código que rodou — que é a propriedade que este arquivo
  // inteiro existe para garantir, e a que some primeiro quando alguém for
  // depurar um incidente pelo log de acesso.
  it.each(['dest-first', 'origin-first'])(
    'um __path do cliente nunca troca o handler (concatenação %s)',
    async (ordem) => {
      const url = applyVercelRewrite('/api/validate-coupon?__path=download', ordem);
      const res = await request('POST', url, { body: { code: 'X' } });

      // A garantia é negativa de propósito, e é a única que vale nas duas
      // ordens: o handler ESCOLHIDO PELO CLIENTE não roda. Com a query do
      // `dest` na frente, `validate-coupon` responde normalmente; com a
      // original na frente, o entrypoint recusa rotear e devolve 404. O que
      // não acontece em nenhuma das duas é `download` executar.
      expect(chamadas.map((c) => c.nome)).not.toContain('download');
      expect(res.body?.handler ?? null).not.toBe('download');
    },
  );

  it('recusa rotear quando `__path` chega duplicado', async () => {
    // O comportamento escolhido, escrito para que ninguém o "conserte" achando
    // que é um 404 acidental: dois `__path` significam que um deles veio de
    // fora, e não há como saber qual. Ver o comentário em api/index.js.
    const res = await request('POST', '/api/index?__path=validate-coupon&__path=download', {
      body: { code: 'X' },
    });

    expect(res.status).toBe(404);
    expect(res.body?.success).toBe(false);
    expect(chamadas).toEqual([]);
  });

  it('responde 404 no envelope quando a função é invocada sem __path', async () => {
    // Invocação direta de `/api/index` (smoke test, varredura). Não pode
    // executar handler nenhum.
    const res = await request('GET', '/api/index');

    expect(res.status).toBe(404);
    expect(res.body?.success).toBe(false);
    expect(chamadas).toEqual([]);
  });
});
