import { describe, expect, it } from 'vitest';

import {
  cleanBenefits,
  cleanFaq,
  cleanReviews,
  deriveDisplayName,
  normalizeBenefits,
  normalizeFaq,
  normalizeReviews,
  validateProductStep,
} from '../product-wizard-form';

// ════════════════════════════════════════════════════════════════════
// As regras que decidem O QUE VAI PARA `products` — antes inalcançáveis.
//
// Estas funções viviam dentro de `ProductWizard.jsx` (883 linhas, zero teste).
// São elas que montam o conteúdo das colunas `benefits`, `faq` e `reviews` e
// que liberam o salvamento de um produto. O que se testa aqui é o par
// `normalize*` ↔ `clean*`: o primeiro traduz o que está NO BANCO para o que o
// formulário consegue exibir, o segundo traduz de volta. Quando os dois
// divergem, o sintoma é sempre o mesmo e nunca aparece no editor: a admin
// salva um produto e um campo some.
// ════════════════════════════════════════════════════════════════════

describe('normalize* · do banco para o formulário', () => {
  it('aceita benefício gravado como string solta (formato antigo do painel)', () => {
    expect(normalizeBenefits(['Download imediato'])).toEqual([
      { icon: '', label: 'Download imediato' },
    ]);
  });

  it('devolve lista vazia para qualquer coisa que não seja array', () => {
    // O JSONB pode chegar null, objeto ou string se alguém editou por SQL.
    for (const entrada of [null, undefined, {}, 'texto', 42]) {
      expect(normalizeBenefits(entrada)).toEqual([]);
      expect(normalizeFaq(entrada)).toEqual([]);
      expect(normalizeReviews(entrada)).toEqual([]);
    }
  });

  it('mantém `rating` como STRING para o input controlado', () => {
    // Número ou undefined aqui produz o aviso de campo não-controlado do React
    // e faz o valor sumir da tela ao editar.
    expect(normalizeReviews([{ author: 'Ana', text: 'ótimo', rating: 5 }])[0].rating).toBe('5');
    expect(normalizeReviews([{ author: 'Ana', text: 'ótimo' }])[0].rating).toBe('');
    expect(normalizeReviews([{ author: 'Ana', text: 'x', rating: null }])[0].rating).toBe('');
  });

  it('apara espaço em todos os campos de texto', () => {
    expect(normalizeFaq([{ question: '  Como baixo? ', answer: ' Pelo link. ' }])).toEqual([
      { question: 'Como baixo?', answer: 'Pelo link.' },
    ]);
  });
});

describe('clean* · do formulário para o banco', () => {
  it('descarta a linha em branco que o editor deixa na tela', () => {
    expect(
      cleanBenefits([
        { icon: 'star', label: 'Vale a pena' },
        { icon: '', label: '  ' },
      ]),
    ).toEqual([{ icon: 'star', label: 'Vale a pena' }]);
  });

  it('exige pergunta E resposta na FAQ', () => {
    const entrada = [
      { question: 'Tem certificado?', answer: 'Tem.' },
      { question: 'Sem resposta', answer: '' },
      { question: '', answer: 'Sem pergunta' },
    ];
    expect(cleanFaq(entrada)).toEqual([{ question: 'Tem certificado?', answer: 'Tem.' }]);
  });

  it('exige autor E texto no depoimento, e converte `rating` para número', () => {
    const entrada = [
      { author: 'Ana', role: 'Prof.', location: 'SP', text: 'Excelente', rating: '5' },
      { author: 'Sem texto', role: '', location: '', text: '', rating: '4' },
    ];
    expect(cleanReviews(entrada)).toEqual([
      { author: 'Ana', role: 'Prof.', location: 'SP', text: 'Excelente', rating: 5 },
    ]);
  });

  it('grava `rating` vazio como null, nunca como 0', () => {
    // `Number('')` é 0, e 0 numa nota de 1 a 5 seria uma avaliação péssima
    // inventada pelo coerce — a mesma classe do achado da regra B2.
    const [review] = cleanReviews([{ author: 'Ana', text: 'ok', rating: '' }]);
    expect(review.rating).toBeNull();
  });

  it('sobrevive ao ciclo completo banco → formulário → banco', () => {
    // A propriedade que importa: editar e salvar sem tocar em nada não pode
    // alterar o que está gravado.
    const gravado = [
      { author: 'Ana', role: 'Prof.', location: 'SP', text: 'Excelente', rating: 5 },
    ];
    expect(cleanReviews(normalizeReviews(gravado))).toEqual(gravado);

    const faq = [{ question: 'Tem certificado?', answer: 'Tem.' }];
    expect(cleanFaq(normalizeFaq(faq))).toEqual(faq);

    const beneficios = [{ icon: 'star', label: 'Vale a pena' }];
    expect(cleanBenefits(normalizeBenefits(beneficios))).toEqual(beneficios);
  });
});

describe('deriveDisplayName', () => {
  it('usa o último segmento do path curto bucket/path', () => {
    expect(deriveDisplayName('product_files/1725-abc-apostila.pdf')).toBe('1725-abc-apostila.pdf');
  });

  it('decodifica o nome vindo de URL completa', () => {
    expect(
      deriveDisplayName('https://x.supabase.co/storage/v1/object/public/b/li%C3%A7%C3%A3o.pdf'),
    ).toBe('lição.pdf');
  });

  it('devolve vazio para valor ausente e trunca o que não é URL', () => {
    expect(deriveDisplayName('')).toBe('');
    expect(deriveDisplayName(null)).toBe('');
    expect(deriveDisplayName(`http://${'x'.repeat(200)}`).length).toBeLessThanOrEqual(60);
  });
});

describe('validateProductStep · o que libera o salvamento', () => {
  const completo = {
    name: 'Apostila',
    category: 'cat-1',
    description: 'Descrição',
    downloadUrl: 'product_files/x.pdf',
    price: '39.90',
  };

  it('libera os três passos com o formulário completo', () => {
    for (const step of [0, 1, 2]) {
      expect(validateProductStep(step, completo, ['https://img/1.png'])).toBeNull();
    }
  });

  it.each([
    ['name', 'Nome do produto é obrigatório'],
    ['category', 'Categoria é obrigatória'],
    ['description', 'Descrição é obrigatória'],
  ])('barra o passo 0 sem %s', (campo, mensagem) => {
    expect(validateProductStep(0, { ...completo, [campo]: '   ' }, [])).toBe(mensagem);
  });

  it('barra o passo 1 sem imagem válida', () => {
    // Só espaço em branco não conta como imagem — era o caso que o `.trim()`
    // do componente já tratava e que ninguém verificava.
    expect(validateProductStep(1, completo, ['   ', ''])).toBe(
      'Pelo menos uma imagem é obrigatória',
    );
  });

  it('barra o passo 1 sem URL de download', () => {
    expect(validateProductStep(1, { ...completo, downloadUrl: '' }, ['https://img/1.png'])).toBe(
      'URL de download é obrigatória',
    );
  });

  it.each(['', '0', '-1'])('barra o passo 2 com preço %s', (price) => {
    expect(validateProductStep(2, { ...completo, price }, ['https://img/1.png'])).toBe(
      'Preço válido é obrigatório',
    );
  });

  it('não inventa exigência em passo que não conhece', () => {
    expect(validateProductStep(9, {}, [])).toBeNull();
  });
});
