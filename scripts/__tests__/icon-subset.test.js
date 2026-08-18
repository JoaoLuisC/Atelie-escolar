import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// SUBSET DE ÍCONES × CÓDIGO — §1.4.
//
// ── POR QUE ISTO PRECISA SER UM TESTE ───────────────────────────────
// Um ícone fora do subset NÃO produz erro: a fonte não tem o glifo, o
// `::before` não desenha nada, e o `<i>` fica em branco. Nenhum log, nenhuma
// exceção, nenhum 404 — o painel só fica com buracos.
//
// E o modo de falha já quase aconteceu: o levantamento contou 66 ícones
// varrendo `bi bi-*`, que enxerga só as classes escritas por extenso. Metade
// do painel monta o ícone dinamicamente (`bi bi-${icon}`, com o nome vindo de
// configuração de aba ou de prop). A varredura completa dá 107 — um subset com
// 66 teria apagado ~40 ícones em silêncio.
//
// Este teste refaz a varredura completa e compara com a lista versionada.
// ════════════════════════════════════════════════════════════════════

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const LITERAL = /bi bi-([a-z0-9-]+)/g;
const CONFIG = /icon\s*[:=]\s*['"]([a-z0-9-]+)['"]/g;
const JSX_PROP = /icon=\{?['"]([a-z0-9-]+)['"]\}?/g;

function listarFontes(dir, encontrados = []) {
  for (const entrada of readdirSync(dir)) {
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      if (entrada === '__tests__' || entrada === 'node_modules') continue;
      listarFontes(completo, encontrados);
      continue;
    }
    if (entrada.endsWith('.js') || entrada.endsWith('.jsx')) encontrados.push(completo);
  }
  return encontrados;
}

/** Todos os ícones referenciados pelo código, literais E dinâmicos. */
function iconesUsadosNoCodigo() {
  const arquivos = [
    ...listarFontes(path.join(REPO_ROOT, 'src')),
    path.join(REPO_ROOT, 'index.html'),
  ];
  const nomes = new Set();

  for (const arquivo of arquivos) {
    const texto = readFileSync(arquivo, 'utf8');

    for (const m of texto.matchAll(LITERAL)) {
      // Descarta prefixo truncado por interpolação: `bi bi-arrow-${dir}-right`
      // casa "arrow-" no literal, e "arrow-" não é um ícone.
      if (!texto.slice(m.index + m[0].length).startsWith('${')) nomes.add(m[1]);
    }
    for (const m of texto.matchAll(CONFIG)) nomes.add(m[1]);
    for (const m of texto.matchAll(JSX_PROP)) nomes.add(m[1]);
  }

  // `bi bi-arrow-${isUp ? 'up' : 'down'}-right` — as duas formas existem.
  nomes.add('arrow-up-right');
  nomes.add('arrow-down-right');
  nomes.delete('');

  return nomes;
}

const listaVersionada = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts', 'icons-usados.json'), 'utf8'),
);

describe('subset de ícones (§1.4)', () => {
  it('a varredura encontra ícones — não passa por vacuidade', () => {
    expect(iconesUsadosNoCodigo().size).toBeGreaterThan(80);
    expect(listaVersionada.length).toBeGreaterThan(80);
  });

  it('todo ícone usado no código está no subset', () => {
    // O modo de falha que isto evita: `<i>` em branco no painel, sem erro.
    const faltando = [...iconesUsadosNoCodigo()].filter((nome) => !listaVersionada.includes(nome));
    expect(faltando).toEqual([]);
  });

  it('o subset não carrega glifo que ninguém usa', () => {
    const usados = iconesUsadosNoCodigo();
    const sobrando = listaVersionada.filter((nome) => !usados.has(nome));
    expect(sobrando).toEqual([]);
  });

  it('todo ícone da lista existe no bootstrap-icons', () => {
    // Nome errado (typo) tem o MESMO sintoma de ícone ausente: nada desenha.
    const codepoints = JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, 'node_modules', 'bootstrap-icons', 'font', 'bootstrap-icons.json'),
        'utf8',
      ),
    );
    const inexistentes = listaVersionada.filter((nome) => codepoints[nome] === undefined);
    expect(inexistentes).toEqual([]);
  });

  it('a fonte e a folha geradas estão versionadas', () => {
    // O build de produção NÃO roda o subsetter: ele consome o artefato. Se
    // sumir, o painel perde todos os ícones de uma vez.
    const fonte = path.join(REPO_ROOT, 'public', 'fonts', 'bootstrap-icons-subset.woff2');
    const css = path.join(REPO_ROOT, 'public', 'fonts', 'bootstrap-icons-subset.css');

    expect(existsSync(fonte)).toBe(true);
    expect(existsSync(css)).toBe(true);
    // Sanidade de tamanho: a família inteira tem ~131 KB; o subset tem de ser
    // uma fração disso, senão o ganho do item não aconteceu.
    expect(statSync(fonte).size).toBeLessThan(40 * 1024);
  });

  it('a folha gerada declara uma regra por ícone da lista', () => {
    const css = readFileSync(
      path.join(REPO_ROOT, 'public', 'fonts', 'bootstrap-icons-subset.css'),
      'utf8',
    );
    for (const nome of listaVersionada) {
      expect(css, `.bi-${nome} ausente na folha`).toContain(`.bi-${nome}::before`);
    }
  });

  it('o CDN de terceiro saiu do HTML e do CSP', () => {
    const html = readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    const vercel = readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8');

    // No HTML só pode restar a MENÇÃO no comentário que explica a troca.
    expect(html).not.toMatch(/href="https:\/\/cdn\.jsdelivr\.net/);
    expect(vercel).not.toContain('cdn.jsdelivr.net');
  });
});
