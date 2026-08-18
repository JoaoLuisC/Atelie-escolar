// ════════════════════════════════════════════════════════════════════
// Execução em lote com CONCORRÊNCIA LIMITADA — §2.2 do doc de otimização.
//
// ── POR QUE NÃO `Promise.all` NO ARRAY INTEIRO ──────────────────────
// O consumidor deste módulo é `api/cron-email-jobs.js`, que percorre até 100
// destinatários por laço. Sem teto, cem envios simultâneos derrubam o pool do
// nodemailer e o rate limit do provedor de e-mail ao mesmo tempo — troca
// "lento" por "bloqueado", que é pior.
//
// ── POR QUE NÃO O `for` SEQUENCIAL QUE HAVIA ────────────────────────
// Cada destinatário custa 3 round-trips ao Supabase mais o envio SMTP, tudo em
// série, sob o `maxDuration: 60` do vercel.json e um cron horário. Passando do
// teto a função é morta no meio — e como a idempotência é por
// (email, kind, entity_id), a próxima hora retoma, mas a fila NUNCA ESVAZIA se
// a taxa de entrada superar a de saída.
//
// E há um detalhe que só aparece quando os dois são olhados juntos: o
// `pool: true, maxConnections: 3` de `lib/email-sender.js` é INERTE sob um
// laço sequencial. Um `for` com `await` nunca tem mais de uma mensagem em
// voo, então o pool economiza o handshake TLS entre mensagens mas jamais abre
// a segunda conexão. É este módulo que dá sentido àquele número.
// ════════════════════════════════════════════════════════════════════

/**
 * Percorre `items` chamando `worker` com no máximo `limit` execuções
 * simultâneas.
 *
 * A ordem de INÍCIO é a do array; a de conclusão não é garantida. Os
 * chamadores só acumulam contadores, então isso não importa — e onde importar,
 * o contrato está dito aqui.
 *
 * Um `worker` que lança derruba o lote inteiro, de propósito: é a mesma
 * semântica do `for await` que este helper substitui, e engolir erro em
 * caminho de entrega de e-mail pago é como uma fila para de esvaziar sem
 * ninguém ver.
 *
 * @param {Array} items
 * @param {number} limit    máximo de execuções simultâneas (>= 1)
 * @param {(item: any, index: number) => Promise<void>} worker
 */
async function forEachWithConcurrency(items, limit, worker) {
  const lista = Array.isArray(items) ? items : [];
  const teto = Math.max(1, Math.floor(Number(limit) || 1));

  let proximo = 0;

  async function trabalhar() {
    while (proximo < lista.length) {
      const indice = proximo;
      proximo += 1;
      await worker(lista[indice], indice);
    }
  }

  const trilhos = Array.from({ length: Math.min(teto, lista.length) }, trabalhar);
  await Promise.all(trilhos);
}

module.exports = { forEachWithConcurrency };
