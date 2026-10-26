import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOME_CONTENT,
  HOME_BLOCKS,
  mergeHomeContent,
  splitHighlights,
  stripHighlights,
} from '../home-content';

describe('mergeHomeContent', () => {
  it('sem nada salvo, devolve o padrão inteiro com todos os blocos ligados', () => {
    const merged = mergeHomeContent(undefined);

    expect(merged.hero).toEqual(DEFAULT_HOME_CONTENT.hero);
    expect(merged.blocks).toEqual(HOME_BLOCKS.map(({ id }) => ({ id, enabled: true })));
  });

  it('o salvo vence campo a campo, e string vazia é respeitada', () => {
    const merged = mergeHomeContent({ hero: { title: 'Novo título', subtitle: '' } });

    expect(merged.hero.title).toBe('Novo título');
    expect(merged.hero.subtitle).toBe('');
    // Campo não salvo continua com o padrão.
    expect(merged.hero.ctaLabel).toBe(DEFAULT_HOME_CONTENT.hero.ctaLabel);
  });

  it('lista vazia salva esconde (não volta ao padrão)', () => {
    const merged = mergeHomeContent({ socialProof: { testimonials: [] } });
    expect(merged.socialProof.testimonials).toEqual([]);
  });

  it('ordem salva vale; bloco que faltou entra no fim, ligado', () => {
    const merged = mergeHomeContent({
      blocks: [
        { id: 'socialProof', enabled: false },
        { id: 'hero', enabled: true },
      ],
    });

    expect(merged.blocks.slice(0, 2)).toEqual([
      { id: 'socialProof', enabled: false },
      { id: 'hero', enabled: true },
    ]);
    expect(merged.blocks).toHaveLength(HOME_BLOCKS.length);
    expect(merged.blocks.slice(2).every((block) => block.enabled)).toBe(true);
  });
});

describe('splitHighlights / stripHighlights', () => {
  it('trecho entre asteriscos vira destaque', () => {
    expect(splitHighlights('feitos com *cuidado* e *criatividade*')).toEqual([
      { text: 'feitos com ', highlight: false },
      { text: 'cuidado', highlight: true },
      { text: ' e ', highlight: false },
      { text: 'criatividade', highlight: true },
    ]);
  });

  it('asterisco sem par fica como texto', () => {
    expect(splitHighlights('5* estrelas')).toEqual([{ text: '5* estrelas', highlight: false }]);
  });

  it('stripHighlights tira só as marcas', () => {
    expect(stripHighlights('feitos com *cuidado*')).toBe('feitos com cuidado');
  });
});
