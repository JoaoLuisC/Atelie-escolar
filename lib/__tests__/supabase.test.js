import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// `lib/supabase.js` — item P4.1.
//
// É o cliente compartilhado por todos os handlers, e o que ele decide não é
// "como falar com o banco": é COM QUAL CHAVE. O default de `useServiceRole` é
// `false` de propósito — defesa em profundidade —, e handler novo só enxerga
// dado privado se importar de `serviceRoleHelpers` explicitamente. Um default
// invertido aqui abriria RLS em 44 handlers de uma vez, sem uma linha de diff
// em nenhum deles.
//
// O outro controle é o TETO DE TEMPO: sem ele, um Postgres lento consome o
// orçamento inteiro da função serverless e a requisição morre sem resposta.
// ════════════════════════════════════════════════════════════════════

const requireCjs = createRequire(import.meta.url);
const {
  getSupabaseConfig,
  getTableRow,
  insertIntoTable,
  listTableRows,
  serviceRoleHelpers,
  supabaseRequest,
  updateTable,
  deleteFromTable,
} = requireCjs('../supabase.js');

function json(body, status = 200, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

/** Query string da n-ésima chamada. */
function paramsDa(indice = 0) {
  return new URL(String(globalThis.fetch.mock.calls[indice][0])).searchParams;
}

function initDa(indice = 0) {
  return globalThis.fetch.mock.calls[indice][1];
}

describe('lib/supabase', () => {
  let ambienteOriginal;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    process.env.SUPABASE_URL = 'https://stub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'chave-anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-service';
    process.env.SUPABASE_STORAGE_BUCKET = 'product_files';

    globalThis.fetch = vi.fn(async () => json([]));
  });

  afterEach(() => {
    process.env = ambienteOriginal;
    vi.restoreAllMocks();
  });

  describe('getSupabaseConfig', () => {
    it('exige url, anon E service role — os três', () => {
      expect(getSupabaseConfig()).toMatchObject({ url: 'https://stub.supabase.co' });

      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      expect(getSupabaseConfig()).toBeNull();
    });

    it('bucket ausente não invalida a configuração', () => {
      delete process.env.SUPABASE_STORAGE_BUCKET;
      expect(getSupabaseConfig()).not.toBeNull();
      expect(getSupabaseConfig().storageBucket).toBe('');
    });
  });

  describe('escolha de chave (defesa em profundidade)', () => {
    it('o default é ANON, não service role', async () => {
      await listTableRows('products', { select: 'id' });
      expect(initDa().headers.apikey).toBe('chave-anon');
    });

    it('`serviceRoleHelpers` é o caminho EXPLÍCITO para bypassar RLS', async () => {
      await serviceRoleHelpers.listTableRows('orders', { select: 'id' });
      expect(initDa().headers.apikey).toBe('chave-service');
    });

    it('todos os helpers de service role usam a chave privilegiada', async () => {
      const chamadas = [
        () => serviceRoleHelpers.getTableRow('orders', { select: 'id' }),
        () => serviceRoleHelpers.insertIntoTable('orders', { id: 1 }),
        () => serviceRoleHelpers.updateTable('orders', { id: 'eq.1' }, { status: 'x' }),
        () => serviceRoleHelpers.deleteFromTable('orders', { id: 'eq.1' }),
        () => serviceRoleHelpers.upsertIntoTable('orders', [{ id: 1 }], 'id'),
      ];

      for (const chamada of chamadas) {
        globalThis.fetch.mockClear();
        await chamada();
        expect(initDa().headers.apikey).toBe('chave-service');
      }
    });

    it('sem configuração, falha antes de tocar a rede', async () => {
      delete process.env.SUPABASE_URL;
      await expect(supabaseRequest('products')).rejects.toThrow(/not configured/i);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('construção da query', () => {
    it('monta select, filtros, ordem e limite', async () => {
      await listTableRows('orders', {
        select: 'id,total',
        filters: [
          { column: 'payment_status', value: 'approved' },
          { column: 'created_at', operator: 'gte', value: '2026-01-01' },
        ],
        orderBy: 'created_at',
        ascending: false,
        limit: 10,
        offset: 5,
      });

      const params = paramsDa();
      expect(params.get('select')).toBe('id,total');
      expect(params.get('payment_status')).toBe('eq.approved');
      expect(params.get('created_at')).toBe('gte.2026-01-01');
      expect(params.get('order')).toBe('created_at.desc');
      expect(params.get('limit')).toBe('10');
      expect(params.get('offset')).toBe('5');
    });

    it('filtro com valor nulo/indefinido é IGNORADO, não vira `eq.null`', async () => {
      // Um filtro que some silenciosamente é perigoso — mas `eq.undefined`
      // seria pior: casaria zero linhas e a tela apareceria vazia sem erro. O
      // comentário de `validation/payment.schemas.js` já registra esse
      // comportamento como algo em que os chamadores confiam.
      await listTableRows('products', {
        select: 'id',
        filters: [
          { column: 'id', value: undefined },
          { column: 'slug', value: null },
          { column: 'active', value: true },
        ],
      });

      const params = paramsDa();
      expect(params.has('id')).toBe(false);
      expect(params.has('slug')).toBe(false);
      expect(params.get('active')).toBe('eq.true');
    });

    it('sem limit, nenhum limit é emitido — é o chamador que decide', async () => {
      // Exatamente a propriedade que motivou o §2.1: quem não passa `limit`
      // fica à mercê do `db-max-rows` do PostgREST, e o corte é silencioso.
      await listTableRows('orders', { select: 'id' });
      expect(paramsDa().has('limit')).toBe(false);
    });
  });

  describe('getTableRow', () => {
    it('devolve a primeira linha', async () => {
      globalThis.fetch = vi.fn(async () => json([{ id: 1 }, { id: 2 }]));
      expect(await getTableRow('products', { select: 'id' })).toEqual({ id: 1 });
    });

    it('devolve null quando não há linha', async () => {
      globalThis.fetch = vi.fn(async () => json([]));
      expect(await getTableRow('products', { select: 'id' })).toBeNull();
    });
  });

  describe('escrita', () => {
    it('insert pede a representação de volta', async () => {
      await insertIntoTable('orders', { id: 1 });
      expect(initDa().method).toBe('POST');
      expect(initDa().headers.Prefer).toContain('return=representation');
    });

    it('update usa PATCH com os filtros na query string', async () => {
      await updateTable('orders', { id: 'eq.7' }, { status: 'completed' });
      expect(initDa().method).toBe('PATCH');
      expect(paramsDa().get('id')).toBe('eq.7');
    });

    it('delete usa DELETE com os filtros na query string', async () => {
      await deleteFromTable('orders', { id: 'eq.7' });
      expect(initDa().method).toBe('DELETE');
      expect(paramsDa().get('id')).toBe('eq.7');
    });
  });

  describe('erro e teto de tempo', () => {
    it('resposta não-ok vira Error com statusCode e detalhes', async () => {
      globalThis.fetch = vi.fn(async () => json({ message: 'coluna inexistente' }, 400));

      await expect(listTableRows('orders', { select: 'nao_existe' })).rejects.toMatchObject({
        message: 'coluna inexistente',
        statusCode: 400,
      });
    });

    it('resposta não-JSON não quebra o parser', async () => {
      globalThis.fetch = vi.fn(async () => json('erro em texto puro', 500, 'text/plain'));
      await expect(listTableRows('orders', { select: 'id' })).rejects.toThrow(/erro em texto puro/);
    });

    it('toda requisição leva um AbortSignal — sem ele a função serverless morre esperando', async () => {
      await listTableRows('products', { select: 'id' });
      expect(initDa().signal).toBeDefined();
    });

    it('timeout vira erro 504, não AbortError cru', async () => {
      // O chamador precisa distinguir "o banco demorou" de "alguém cancelou".
      globalThis.fetch = vi.fn(async () => {
        const err = new Error('abortado');
        err.name = 'TimeoutError';
        throw err;
      });

      await expect(listTableRows('orders', { select: 'id' })).rejects.toMatchObject({
        statusCode: 504,
      });
    });
  });
});
