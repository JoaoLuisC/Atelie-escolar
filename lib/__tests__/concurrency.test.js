import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const { forEachWithConcurrency } = requireCjs('../concurrency.js');

/** Promessa que só resolve quando alguém chamar `liberar()`. */
function comporta() {
  let liberar;
  const promessa = new Promise((resolve) => {
    liberar = resolve;
  });
  return { promessa, liberar: () => liberar() };
}

describe('forEachWithConcurrency (§2.2)', () => {
  it('processa todos os itens, na ordem de início', async () => {
    const vistos = [];
    await forEachWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      vistos.push(item);
    });

    expect(vistos).toEqual([1, 2, 3, 4, 5]);
  });

  it('NUNCA passa do teto de simultaneidade', async () => {
    // É a propriedade que separa isto de `Promise.all` no array inteiro: sem
    // teto, cem envios simultâneos derrubam o pool do nodemailer e o rate
    // limit do provedor ao mesmo tempo.
    let emVoo = 0;
    let pico = 0;

    await forEachWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async () => {
        emVoo += 1;
        pico = Math.max(pico, emVoo);
        await new Promise((resolve) => setTimeout(resolve, 1));
        emVoo -= 1;
      },
    );

    expect(pico).toBe(3);
  });

  it('roda de fato em paralelo, não em série', async () => {
    // Sem esta asserção o teste acima passaria com um `for` sequencial, que
    // tem pico 1 e satisfaz "nunca passa do teto".
    const portoes = [comporta(), comporta(), comporta()];
    let iniciados = 0;

    const execucao = forEachWithConcurrency(portoes, 3, async (portao) => {
      iniciados += 1;
      await portao.promessa;
    });

    await Promise.resolve();
    expect(iniciados).toBe(3);

    portoes.forEach((p) => p.liberar());
    await execucao;
  });

  it('teto maior que a lista não trava nem estoura', async () => {
    const vistos = [];
    await forEachWithConcurrency(['a'], 50, async (item) => {
      vistos.push(item);
    });
    expect(vistos).toEqual(['a']);
  });

  it('lista vazia ou inválida não chama o worker', async () => {
    const worker = vi.fn();
    await forEachWithConcurrency([], 5, worker);
    await forEachWithConcurrency(null, 5, worker);
    await forEachWithConcurrency(undefined, 5, worker);
    expect(worker).not.toHaveBeenCalled();
  });

  it('teto inválido cai em 1 em vez de travar', async () => {
    const vistos = [];
    await forEachWithConcurrency([1, 2], 0, async (i) => vistos.push(i));
    await forEachWithConcurrency([3, 4], Number.NaN, async (i) => vistos.push(i));
    expect(vistos).toEqual([1, 2, 3, 4]);
  });

  it('erro do worker propaga — não some em silêncio', async () => {
    // Mesma semântica do `for await` que este helper substituiu. Engolir erro
    // no caminho de entrega de e-mail pago é como uma fila para de esvaziar
    // sem ninguém ver.
    await expect(
      forEachWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error('falha no item 2');
      }),
    ).rejects.toThrow('falha no item 2');
  });
});
