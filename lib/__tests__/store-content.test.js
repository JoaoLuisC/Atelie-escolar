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

describe('aparência do banner', () => {
  it('guarda escolhas válidas e descarta CSS e opções não autorizadas', () => {
    const { value } = sanitizeHomeContent({
      hero: {
        backgroundStyle: 'linear',
        backgroundColor: '#aabbcc',
        backgroundColorEnd: 'url(https://example.com)',
        imagePosition: 'left',
        imageAnimation: 'slide',
        showIcons: false,
        bannerSize: 'enorme',
      },
    });
    expect(value.hero).toEqual({
      backgroundStyle: 'linear',
      backgroundColor: '#aabbcc',
      imagePosition: 'left',
      imageAnimation: 'slide',
      showIcons: false,
    });
  });
});

describe('sanitizeHomeContent · navbar, rodapé e banner com foto', () => {
  it('aceita logo, e-mail, cores do degradê, imagens flutuantes e foto do banner', () => {
    const { value } = sanitizeHomeContent({
      navigation: { logoUrl: 'https://cdn.test/logo.png', showTitle: false },
      footer: { contactEmail: 'Contato@Loja.com', copyright: '© 2026 Loja' },
      hero: {
        backgroundStops: ['#112233', '#445566', '#778899'],
        gradientAngle: 90,
        floatingImages: ['https://cdn.test/a.png', 'https://cdn.test/b.png'],
        banner: {
          desktop: 'https://cdn.test/d.jpg',
          mobile: 'https://cdn.test/m.jpg',
          alt: 'Arte',
          textOverlay: false,
        },
      },
    });
    expect(value.navigation).toEqual({ logoUrl: 'https://cdn.test/logo.png', showTitle: false });
    expect(value.footer).toEqual({ contactEmail: 'contato@loja.com', copyright: '© 2026 Loja' });
    expect(value.hero.backgroundStops).toEqual(['#112233', '#445566', '#778899']);
    expect(value.hero.gradientAngle).toBe(90);
    expect(value.hero.floatingImages).toHaveLength(2);
    expect(value.hero.banner).toEqual({
      desktop: 'https://cdn.test/d.jpg',
      mobile: 'https://cdn.test/m.jpg',
      alt: 'Arte',
      textOverlay: false,
    });
  });

  it('recusa o que não é https, cor inválida, ângulo fora de 0–360 e e-mail torto', () => {
    const { value } = sanitizeHomeContent({
      navigation: { logoUrl: 'javascript:alert(1)' },
      footer: { contactEmail: 'nao-e-email', logoUrl: 'http://inseguro/x.png' },
      hero: {
        backgroundStops: ['#123456', 'red', '#abcdef'],
        gradientAngle: 400,
        floatingImages: ['http://x/a.png', 'https://cdn.test/ok.png'],
        banner: { desktop: 'data:image/png;base64,AAA' },
      },
    });
    expect(value.navigation).toEqual({});
    expect(value.footer).toEqual({});
    expect(value.hero.backgroundStops).toEqual(['#123456', '#abcdef']);
    expect(value.hero.gradientAngle).toBeUndefined();
    expect(value.hero.floatingImages).toEqual(['https://cdn.test/ok.png']);
    expect(value.hero.banner).toEqual({});
  });

  it('degradê tem no máximo 4 cores e enfeites no máximo 8', () => {
    const { value } = sanitizeHomeContent({
      hero: {
        backgroundStops: Array.from({ length: 6 }, (_, i) => `#00000${i}`),
        floatingImages: Array.from({ length: 10 }, (_, i) => `https://cdn.test/${i}.png`),
      },
    });
    expect(value.hero.backgroundStops).toHaveLength(4);
    expect(value.hero.floatingImages).toHaveLength(8);
  });
});
