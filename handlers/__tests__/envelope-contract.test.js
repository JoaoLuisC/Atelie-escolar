import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// REGRA A1 — um envelope de resposta só (itens P1.1 a P1.5).
//
// POR QUE ISTO É UM TESTE E NÃO UM `grep` NO REVIEW
// O CONTRIBUTING registrou em 13/08/2026 que os três formatos de erro tinham
// virado um só ("9 handlers → 0"). A remedição de 18/08 encontrou 58 sites
// ainda devolvendo `error` como string. Não foi regressão: a contagem nunca
// virou gate, então nada impediu o número de voltar a subir. Este arquivo é o
// gate — a mesma lição do `rate-limit-coverage.test.js`.
//
// A prova de término escolhida pelo próprio CONTRIBUTING é o SHIM:
//
//   "Quando A1 estiver aplicada, esse shim sai — é a prova de que a migração
//    terminou."
//
// Então o teste verifica as duas pontas: nenhum emissor devolve `error` como
// string, e o cliente não tem mais o ramo de achatamento.
// ════════════════════════════════════════════════════════════════════

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** `error: '…'` / `error: "…"` fora de comentário. */
const ERRO_COMO_STRING = /(^|[^/*])\berror:\s*['"]/;

/**
 * Sites que casam com o padrão e NÃO são corpo HTTP. Cada um com o motivo —
 * dispensa sem motivo escrito é indistinguível de omissão.
 */
const NAO_SAO_CORPO_HTTP = Object.freeze({
  'handlers/admin/settings.js':
    'Tipo de retorno `{ value | error }` das funções de coerção; nunca vira corpo HTTP. ' +
    'O próprio item P1.2 registra esta exceção.',
  'lib/email-sender.js':
    'Valor da coluna `error` da tabela email_sent_log — persistência, não resposta.',
});

function listarFontes(dir, prefixo = '') {
  const encontrados = [];

  for (const entrada of readdirSync(dir).sort()) {
    const completo = path.join(dir, entrada);

    if (statSync(completo).isDirectory()) {
      if (entrada === '__tests__' || entrada === 'node_modules') continue;
      encontrados.push(...listarFontes(completo, prefixo ? `${prefixo}/${entrada}` : entrada));
      continue;
    }

    if (!entrada.endsWith('.js') || entrada.endsWith('.test.js')) continue;
    encontrados.push({
      id: prefixo ? `${prefixo}/${entrada}` : entrada,
      linhas: readFileSync(completo, 'utf8').split('\n'),
    });
  }

  return encontrados;
}

const fontes = ['handlers', 'lib', 'routes', 'middleware', 'services'].flatMap((arvore) =>
  listarFontes(path.join(REPO_ROOT, arvore), arvore),
);

function sitesDeErroComoString() {
  const achados = [];

  for (const { id, linhas } of fontes) {
    if (id in NAO_SAO_CORPO_HTTP) continue;

    linhas.forEach((linha, indice) => {
      const semComentario = linha.trimStart();
      if (semComentario.startsWith('//') || semComentario.startsWith('*')) return;
      if (ERRO_COMO_STRING.test(linha)) {
        achados.push(`${id}:${indice + 1}`);
      }
    });
  }

  return achados;
}

describe('regra A1 · envelope único de resposta (P1.1–P1.5)', () => {
  it('varre as árvores de backend de verdade', () => {
    // Guarda contra o pior modo de falha: varrer a pasta errada e passar por
    // vacuidade.
    expect(fontes.length).toBeGreaterThan(60);
    expect(fontes.map((f) => f.id)).toContain('lib/http.js');
    expect(fontes.map((f) => f.id)).toContain('handlers/create-payment.js');
  });

  it('nenhum emissor devolve `error` como string', () => {
    expect(sitesDeErroComoString()).toEqual([]);
  });

  it('as dispensas apontam para arquivos que existem (regra D4)', () => {
    const ids = new Set(fontes.map((f) => f.id));
    expect(Object.keys(NAO_SAO_CORPO_HTTP).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('nenhum código de erro fora de SCREAMING_SNAKE (regra A2)', () => {
    const fora = [];

    for (const { id, linhas } of fontes) {
      linhas.forEach((linha, indice) => {
        const m = /\bcode:\s*'([^']+)'/.exec(linha);
        if (m && !/^[A-Z][A-Z0-9_]*$/.test(m[1])) {
          fora.push(`${id}:${indice + 1} → ${m[1]}`);
        }
      });
    }

    expect(fora).toEqual([]);
  });

  it('o shim de achatamento saiu de src/utils/api.js — o marco do fim da migração', () => {
    const api = readFileSync(path.join(REPO_ROOT, 'src', 'utils', 'api.js'), 'utf8');

    // O shim era exatamente isto: detectar `error` como objeto e achatá-lo para
    // string, expondo o código separado em `errorCode`.
    expect(api).not.toContain('errorCode:');
    expect(api).not.toMatch(/error:\s*error\.message/);
  });
});
