import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// lib/product-media.js — links de imagem, vídeo e arquivo do
// produto validados na gravação.

const { validateProductMedia, isHttpsUrl } = createRequire(import.meta.url)('../product-media.js');

const STORAGE_IMG = 'https://abc.supabase.co/storage/v1/object/public/product_images/a.png';

describe('validateProductMedia', () => {
  it('aceita imagens https, vídeo do YouTube e arquivo do Storage', () => {
    expect(
      validateProductMedia({
        images: [STORAGE_IMG],
        imageUrl: STORAGE_IMG,
        videos: ['https://www.youtube.com/watch?v=abc'],
        downloadUrl: 'product_files/kit-natal.pdf',
      }),
    ).toBeNull();
  });

  it('produto sem arquivo ainda é permitido', () => {
    expect(validateProductMedia({ images: [STORAGE_IMG], downloadUrl: '' })).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'http://site.com/a.png',
    '//evil.com/a.png',
    'a.png',
  ])('recusa imagem "%s"', (url) => {
    expect(validateProductMedia({ images: [url] })).toMatch(/imagem/);
  });

  it('recusa a imagem principal fora do padrão mesmo com a galeria ok', () => {
    expect(validateProductMedia({ images: [STORAGE_IMG], imageUrl: 'javascript:x' })).toMatch(
      /imagem/,
    );
  });

  it('recusa vídeo sem https', () => {
    expect(validateProductMedia({ videos: ['http://youtube.com/x'] })).toMatch(/vídeo/);
  });

  it('recusa arquivo de download fora do Storage (Drive, caminho com ..)', () => {
    expect(
      validateProductMedia({ downloadUrl: 'https://drive.google.com/file/d/123/view' }),
    ).toMatch(/Storage/);
    expect(validateProductMedia({ downloadUrl: 'product_files/../segredo.pdf' })).toMatch(
      /Storage/,
    );
  });

  it('isHttpsUrl recusa endereço longo demais', () => {
    expect(isHttpsUrl(`https://a.com/${'x'.repeat(1000)}`)).toBe(false);
  });
});
