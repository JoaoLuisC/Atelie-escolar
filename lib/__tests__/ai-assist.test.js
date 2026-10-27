import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installPartialMock,
  resetModuleRegistry,
} from '../../handlers/__tests__/money-path-harness.js';

// lib/gemini.js (chamada JSON ao Gemini) e lib/ai-assist.js (as três
// sugestões da área do professor). O que importa: erros com `code` que a tela
// traduz, resposta da IA sempre limpa e com teto, e a IA recebendo só dados da
// loja — nunca de cliente.

const requireCjs = createRequire(import.meta.url);

function geminiResponse(json, { ok = true, status = 200 } = {}) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () =>
      ok ? { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] } : {},
  }));
}

let listTableRows;

beforeEach(() => {
  resetModuleRegistry();
  listTableRows = vi.fn(async (table) =>
    table === 'products'
      ? [{ name: 'Painel do Alfabeto', price: 19.9, category_id: 'c1' }]
      : [{ id: 'c1', name: 'Painéis' }],
  );
  installPartialMock('../../lib/supabase', { serviceRoleHelpers: { listTableRows } });
});

afterEach(() => {
  resetModuleRegistry();
  vi.restoreAllMocks();
});

describe('callGeminiJson', () => {
  it('sem chave: AI_NOT_CONFIGURED, sem chamar a rede', async () => {
    const { callGeminiJson } = requireCjs('../gemini.js');
    const fetchImpl = vi.fn();
    await expect(
      callGeminiJson({ systemPrompt: 'x', input: {}, schema: {} }, { apiKey: '', fetchImpl }),
    ).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('429 vira AI_QUOTA; outra falha vira AI_FAILED', async () => {
    const { callGeminiJson } = requireCjs('../gemini.js');
    const call = (fetchImpl) =>
      callGeminiJson({ systemPrompt: 'x', input: {}, schema: {} }, { apiKey: 'k', fetchImpl });
    await expect(call(geminiResponse(null, { ok: false, status: 429 }))).rejects.toMatchObject({
      code: 'AI_QUOTA',
    });
    await expect(call(geminiResponse(null, { ok: false, status: 500 }))).rejects.toMatchObject({
      code: 'AI_FAILED',
    });
  });
});

describe('runAiAssist', () => {
  it('productCopy: limpa e limita o que a IA devolve', async () => {
    const { runAiAssist } = requireCjs('../ai-assist.js');
    const fetchImpl = geminiResponse({
      descricao: 'Texto\u0007 de venda',
      beneficios: ['Pronto para imprimir', '', 'b', 'c', 'd', 'e'],
      faq: [
        { pergunta: 'Vem colorido?', resposta: 'Sim.' },
        { pergunta: '', resposta: 'x' },
      ],
    });

    const { suggestion } = await runAiAssist(
      'productCopy',
      { name: 'Painel', description: 'rascunho' },
      { apiKey: 'k', fetchImpl },
    );

    expect(suggestion.descricao).toBe('Texto de venda');
    expect(suggestion.beneficios).toHaveLength(4);
    expect(suggestion.faq).toEqual([{ pergunta: 'Vem colorido?', resposta: 'Sim.' }]);
    // A descrição do produto não precisa do catálogo: nada de consulta ao banco.
    expect(listTableRows).not.toHaveBeenCalled();
  });

  it('productSeo: manda o catálogo da loja e corrige faixa de preço invertida', async () => {
    const { runAiAssist } = requireCjs('../ai-assist.js');
    const fetchImpl = geminiResponse({
      nome: 'Painel do Alfabeto',
      tituloGoogle: 'Painel do Alfabeto para imprimir',
      descricaoGoogle: 'PDF pronto.',
      precoMinimo: 25,
      precoMaximo: 15,
    });

    const { suggestion } = await runAiAssist(
      'productSeo',
      { name: 'painel' },
      { apiKey: 'k', fetchImpl },
    );

    const sent = JSON.parse(JSON.parse(fetchImpl.mock.calls[0][1].body).contents[0].parts[0].text);
    expect(sent.catalogo).toEqual([
      { nome: 'Painel do Alfabeto', preco: 19.9, categoria: 'Painéis' },
    ]);
    expect(suggestion.precoMaximo).toBeGreaterThanOrEqual(suggestion.precoMinimo);
  });

  it('a IA recebe só os campos previstos (nada de dado extra do corpo)', async () => {
    const { sanitizeInput } = requireCjs('../ai-assist.js');
    expect(Object.keys(sanitizeInput({ name: 'x', email: 'cliente@x.com', cpf: '1' }))).toEqual([
      'nome',
      'categoria',
      'descricao',
      'preco',
      'textosAtuais',
    ]);
  });

  it('tarefa desconhecida é recusada antes de chamar a IA', async () => {
    const { runAiAssist } = requireCjs('../ai-assist.js');
    const fetchImpl = vi.fn();
    await expect(runAiAssist('outra', {}, { apiKey: 'k', fetchImpl })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
