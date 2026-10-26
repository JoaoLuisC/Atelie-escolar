import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// lib/store-content.js — a limpeza do que o painel grava e a home/produto
// mostram a qualquer visitante. O ponto desta suíte é a FRONTEIRA: o que entra
// do jeito que veio, o que é cortado e o que é recusado.
const { sanitizeHomeContent, sanitizeProductDefaults, toPublicSharedDescription, LIMITS } =
  createRequire(import.meta.url)('../store-content.js');

describe('sanitizeHomeContent · whitelist', () => {
  it('mantém campos conhecidos e lista os de topo que descartou', () => {
    const { value, ignored } = sanitizeHomeContent({
      hero: { title: 'Olá', extra: 'x' },
      script: '<script>',
    });

    expect(value).toEqual({ hero: { title: 'Olá' } });
    expect(ignored).toEqual(['script']);
  });

  it('entrada que não é objeto vira vazio, sem lançar', () => {
    expect(sanitizeHomeContent(null)).toEqual({ value: {}, ignored: [] });
    expect(sanitizeHomeContent('texto')).toEqual({ value: {}, ignored: [] });
    expect(sanitizeHomeContent([1, 2])).toEqual({ value: {}, ignored: [] });
  });

  it('preserva string vazia — "sem subtítulo" é escolha da admin, não ausência', () => {
    const { value } = sanitizeHomeContent({ hero: { subtitle: '', ctaLabel: '' } });
    expect(value.hero).toEqual({ subtitle: '', ctaLabel: '' });
  });

  it('campo de tipo errado some do resultado (o front cai no padrão)', () => {
    const { value } = sanitizeHomeContent({ hero: { title: 42, subtitle: { a: 1 } } });
    expect(value.hero).toEqual({});
  });
});

describe('sanitizeHomeContent · texto', () => {
  it('remove caractere de controle e corta no teto', () => {
    const { value } = sanitizeHomeContent({
      hero: { title: `A\u0000B\u0007C${'x'.repeat(500)}` },
    });

    expect(value.hero.title.startsWith('ABC')).toBe(true);
    expect(value.hero.title).toHaveLength(LIMITS.title);
  });

  it('campo de uma linha junta quebras; tira espaço das pontas', () => {
    const { value } = sanitizeHomeContent({ catalog: { title: '  Linha 1\nLinha 2  ' } });
    expect(value.catalog.title).toBe('Linha 1 Linha 2');
  });
});

describe('sanitizeHomeContent · links', () => {
  const linkDe = (ctaLink) => sanitizeHomeContent({ hero: { ctaLink } }).value.hero.ctaLink;

  it('aceita caminho interno e https', () => {
    expect(linkDe('/produtos')).toBe('/produtos');
    expect(linkDe('/#como-funciona')).toBe('/#como-funciona');
    expect(linkDe('https://instagram.com/x')).toBe('https://instagram.com/x');
  });

  it('recusa javascript:, data:, http e //host (que o navegador trata como externo)', () => {
    expect(linkDe('javascript:alert(1)')).toBeUndefined();
    expect(linkDe('data:text/html,oi')).toBeUndefined();
    expect(linkDe('http://inseguro.com')).toBeUndefined();
    expect(linkDe('//evil.com')).toBeUndefined();
  });

  it('imagem do hero e redes sociais exigem https (caminho interno não serve)', () => {
    const { value } = sanitizeHomeContent({
      hero: { imageUrl: '/foto.png' },
      socialProof: { instagramUrl: 'https://www.instagram.com/x', tiktokUrl: 'javascript:x' },
    });

    expect(value.hero.imageUrl).toBeUndefined();
    expect(value.socialProof.instagramUrl).toBe('https://www.instagram.com/x');
    expect(value.socialProof.tiktokUrl).toBeUndefined();
  });
});

describe('sanitizeHomeContent · listas e blocos', () => {
  it('blocos: só ids conhecidos, sem repetição, na ordem enviada', () => {
    const { value } = sanitizeHomeContent({
      blocks: [
        { id: 'socialProof', enabled: false },
        { id: 'hero' },
        { id: 'hero', enabled: false },
        { id: 'desconhecido' },
      ],
    });

    expect(value.blocks).toEqual([
      { id: 'socialProof', enabled: false },
      { id: 'hero', enabled: true },
    ]);
  });

  it('listas respeitam o teto de itens', () => {
    const { value } = sanitizeHomeContent({
      marquee: { items: Array.from({ length: 30 }, (_, i) => `P${i}`) },
      howItWorks: { steps: Array.from({ length: 9 }, () => ({ title: 'a', text: 'b' })) },
      socialProof: { testimonials: Array.from({ length: 10 }, () => ({ name: 'n', text: 't' })) },
    });

    expect(value.marquee.items).toHaveLength(LIMITS.marqueeItems);
    expect(value.howItWorks.steps).toHaveLength(LIMITS.steps);
    expect(value.socialProof.testimonials).toHaveLength(LIMITS.testimonials);
  });

  it('palavra vazia da faixa é descartada', () => {
    const { value } = sanitizeHomeContent({ marquee: { items: ['KITS', '  ', 3, 'PAINÉIS'] } });
    expect(value.marquee.items).toEqual(['KITS', 'PAINÉIS']);
  });
});

describe('sanitizeProductDefaults / toPublicSharedDescription', () => {
  it('preserva quebras de linha do texto longo', () => {
    const { value } = sanitizeProductDefaults({
      sharedDescriptionTitle: 'Sobre',
      sharedDescription: 'Linha 1\r\nLinha 2',
    });
    expect(value.sharedDescription).toBe('Linha 1\nLinha 2');
  });

  it('sem texto, o endpoint público devolve null (a página não desenha bloco vazio)', () => {
    expect(toPublicSharedDescription(null)).toBeNull();
    expect(toPublicSharedDescription({ sharedDescriptionTitle: 'Só título' })).toBeNull();
  });

  it('com texto, devolve título e texto limpos', () => {
    expect(
      toPublicSharedDescription({ sharedDescriptionTitle: ' Sobre ', sharedDescription: 'Texto' }),
    ).toEqual({ title: 'Sobre', text: 'Texto' });
  });
});
