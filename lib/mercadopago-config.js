const mercadopago = require('mercadopago');
const crypto = require('node:crypto');

let mpClient;

/**
 * Inicializa cliente Mercado Pago
 */
function initializeMercadoPago() {
  if (mpClient) {
    return mpClient;
  }

  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
  }

  mpClient = new mercadopago.MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
  });

  console.log('Mercado Pago initialized successfully');
  return mpClient;
}

/**
 * Cria preferência de pagamento
 */
async function createPaymentPreference(items, orderId, customerEmail) {
  initializeMercadoPago();
  
  const preference = new mercadopago.Preference(mpClient);

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const isHttps = appUrl.startsWith('https://');

  const preferenceData = {
    items: items.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description || item.title,
      quantity: item.quantity || 1,
      currency_id: 'BRL',
      unit_price: Number.parseFloat(item.price),
    })),
    payer: {
      email: customerEmail,
    },
    external_reference: orderId,
    notification_url: `${appUrl}/api/webhook`,
    back_urls: {
      success: `${appUrl}/downloads?order=${orderId}`,
      failure: `${appUrl}/checkout?status=failure`,
      pending: `${appUrl}/checkout?status=pending`,
    },
    // auto_return only works with HTTPS back_urls
    ...(isHttps ? { auto_return: 'approved' } : {}),
    statement_descriptor: 'ATELIE_DA_ESCOLA',
    payment_methods: {
      // Produto digital: sem parcelamento
      installments: 1,
    },
  };

  const result = await preference.create({ body: preferenceData });
  return result;
}

/**
 * Verifica status de um pagamento
 */
async function getPaymentInfo(paymentId) {
  initializeMercadoPago();
  
  const payment = new mercadopago.Payment(mpClient);
  const result = await payment.get({ id: paymentId });
  
  return result;
}

// ════════════════════════════════════════════════════════════════════
// Janela de frescor da assinatura do webhook (achado P1-5 da revisão
// 2026-08-12; RECALIBRADA na revisão adversarial de 2026-08-13).
//
// POR QUE EXISTE UMA JANELA
// O manifesto HMAC do Mercado Pago já inclui o `ts`, mas ASSINAR o
// timestamp não impede replay — só impede que ele seja adulterado. Sem
// comparar `ts` com o relógio local, uma notificação legítima capturada
// (log de proxy, histórico de um túnel de desenvolvimento, header vazado)
// permanece com assinatura VÁLIDA para sempre e pode ser reenviada
// indefinidamente. Combinado com P0-2 (o WEBHOOK_SECRET esteve exposto no
// histórico público do git), a janela é a diferença entre "replay eterno"
// e "replay com prazo de validade". O limite superior continua existindo
// justamente por isso — o que mudou foi ONDE ele fica.
//
// POR QUE 300s ESTAVA ERRADO (a regressão)
// A justificativa original dizia que "cada reentrega do MP é uma requisição
// nova, com `ts` próprio, então chega sempre fresca". Isso é uma suposição
// sobre o comportamento do gateway que NÃO está garantida em lugar nenhum
// do contrato: o `ts` faz parte do manifesto assinado da NOTIFICAÇÃO, e o
// caminho mais natural de implementação é assinar uma vez e reenviar o
// mesmo par (manifesto, v1) nas tentativas seguintes. Se for esse o caso —
// e não temos como saber sem observar produção —, o cenário real é:
//   1. primeira entrega cai em 500 porque o Supabase piscou;
//   2. o MP reentrega minutos, e depois HORAS, mais tarde;
//   3. a reentrega chega com `ts` da notificação original;
//   4. 401. O pedido pago NUNCA é aprovado pelo webhook.
// Ou seja: um `if` de segurança transformava uma indisponibilidade
// transitória de 30 segundos em "o cliente pagou e não recebeu o produto".
//
// A ASSIMETRIA DOS DOIS ERROS (é este o raciocínio que dimensiona a janela)
// - Falso NEGATIVO (rejeitar reentrega legítima): o cliente pagou, não
//   recebe o arquivo, abre reclamação, pede estorno. Custo financeiro
//   direto, custo de confiança e trabalho manual de recuperação. Acontece
//   sozinho, sem atacante nenhum — basta um 5xx transitório.
// - Falso POSITIVO (aceitar um replay de notificação real): o que o
//   atacante consegue HOJE, concretamente? Rodando o caminho no
//   api/webhook.js: (a) a transição de estado é idempotente e atômica —
//   ambos os UPDATEs filtram por `payment_status: 'neq.approved'`, então
//   uma reentrega/replay vê 0 linhas afetadas, não re-emite analytics, não
//   sobrescreve `completed_at` e não rebaixa pedido aprovado; (b) os
//   download_tokens só são criados quando ainda não existe nenhum, e o
//   ECO DOS TOKENS NA RESPOSTA FOI REMOVIDO nesta mesma rodada (o 200 de
//   aprovação devolve só `{ message }`), então o corpo não é mais canal de
//   vazamento; (c) o valor pago é reconciliado antes de qualquer escrita.
//   O que sobra de dano em um replay é uma chamada extra a getPaymentInfo
//   contra o MP — custo de quota e de latência, não de integridade.
//
// >>> DEPENDÊNCIA EXPLÍCITA: esta janela larga só é aceitável PORQUE o eco
// >>> de downloadTokens saiu da resposta do webhook e PORQUE as guardas
// >>> `neq.approved` existem. Se alguém reintroduzir qualquer segredo no
// >>> corpo da resposta do webhook, ou afrouxar a idempotência, o replay
// >>> volta a ser leitura de credencial e ESTA CONSTANTE TEM QUE ENCOLHER
// >>> junto. Não mexa em um sem reavaliar o outro.
//
// POR QUE 48 HORAS
// Precisa cobrir com folga a janela real de reentrega do MP, que se estende
// por muitas horas em backoff crescente, e ainda absorver uma janela de
// manutenção nossa (deploy ruim numa sexta à noite descoberto no sábado).
// 48h faz isso. E continua sendo um limite: uma notificação capturada em um
// log antigo, que é o cenário realista de vazamento (histórico de git,
// export de log, túnel de desenvolvimento esquecido), já nasce muito além
// disso e continua sendo rejeitada. Trocamos "replay de 5 minutos" por
// "replay de 2 dias" para não trocar "cliente atendido" por "cliente lesado".
//
// FUTURO ≠ PASSADO: a janela é DELIBERADAMENTE ASSIMÉTRICA. Reentrega
// legítima é sempre um evento do passado; um `ts` no futuro não tem
// explicação benigna além de skew de relógio, e aceitar futuro largo seria
// dar ao atacante uma assinatura pré-datada com validade estendida. Por
// isso o lado do futuro fica em uma folga pequena, de skew.
// ════════════════════════════════════════════════════════════════════
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 48 * 60 * 60; // 48h

// Teto rígido para o valor configurável. Sem ele, um `WEBHOOK_TOLERANCE_SECONDS`
// digitado com um zero a mais (ou um `999999999`) desligaria a proteção na
// prática, e ninguém perceberia porque nada quebra — o sistema só ficaria
// silenciosamente replayável para sempre, que é exatamente o P1-5 de volta.
// Valores acima do teto são CLAMPADOS (não caem no default): quem escreveu um
// número grande demais quis uma janela grande, e a maior que autorizamos é
// esta. 7 dias já é absurdamente mais do que qualquer reentrega do MP.
const MAX_WEBHOOK_TOLERANCE_SECONDS = 7 * 24 * 60 * 60;

// Folga de relógio para o lado do FUTURO. Cobre o skew entre o relógio do MP
// e o da instância serverless (NTP mantém isso na casa dos milissegundos;
// 120s é ordens de grandeza de folga) e nada além disso.
const DEFAULT_FUTURE_SKEW_SECONDS = 120;

// Limiar de OBSERVABILIDADE, não de bloqueio. Entre ele e o limite rígido a
// notificação é ACEITA, mas anotada: é a faixa onde moram tanto a reentrega
// legítima após várias falhas quanto o replay. Sem esse registro, alargar a
// janela nos deixaria cegos — perderíamos o único sinal que distingue "o MP
// está reentregando porque nosso handler está falhando" de "alguém está
// reenviando notificação capturada". O sinal vale mesmo quando não bloqueia:
// é ele que diria, em produção, se o `ts` da reentrega é reaproveitado ou
// renovado — a incerteza que forçou esta janela a ser larga.
const AGE_NOTICE_SECONDS = 15 * 60; // 15min

function readPositiveSeconds(envName, fallback, maximum) {
  const raw = String(process.env[envName] || '').trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  // Valor não-numérico, zero ou negativo cai no default em vez de desligar a
  // checagem. Um erro de digitação na variável de ambiente não pode,
  // silenciosamente, virar "sem proteção contra replay" — mesma política
  // fail-closed de lib/env-secret.js.
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (maximum && parsed > maximum) {
    console.warn(`[mercadopago] ${envName}=${parsed}s excede o teto de ${maximum}s; usando o teto.`);
    return maximum;
  }
  return parsed;
}

function resolveToleranceSeconds() {
  return readPositiveSeconds(
    'WEBHOOK_TOLERANCE_SECONDS',
    DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    MAX_WEBHOOK_TOLERANCE_SECONDS,
  );
}

function resolveFutureSkewSeconds(toleranceSeconds) {
  const skew = readPositiveSeconds('WEBHOOK_FUTURE_SKEW_SECONDS', DEFAULT_FUTURE_SKEW_SECONDS, null);
  // Nunca deixar o lado do futuro maior que o do passado: se alguém apertar a
  // tolerância para 30s em um ambiente de teste, uma folga de futuro de 120s
  // faria a janela ficar mais permissiva para frente do que para trás — o
  // contrário exato da assimetria que queremos.
  return Math.min(skew, toleranceSeconds);
}

/**
 * Converte o `ts` da assinatura para milissegundos epoch.
 *
 * O Mercado Pago documenta o `ts` em SEGUNDOS, mas ele chega como string
 * opaca dentro do header — nada no protocolo garante a unidade, e a
 * documentação já mudou de formato antes. Tratar milissegundos como
 * segundos produziria uma idade de ~54 mil anos e rejeitaria notificação
 * legítima (falha de disponibilidade no fluxo que entrega o produto pago),
 * então discriminamos defensivamente pela ordem de grandeza:
 * 1e11 segundos = ano 5138 e 1e11 milissegundos = 1973 — nenhum timestamp
 * real dos próximos milênios é ambíguo nesse corte.
 *
 * @returns {number|null} epoch em ms, ou null se o valor não for utilizável.
 */
function normalizeSignatureTimestampMs(rawTs) {
  const numeric = Number(String(rawTs).trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  // Corte em 1e11: acima disso o valor só faz sentido como milissegundos
  // (1e11 s = ano 5138; 1e11 ms = 1973). Nenhum timestamp real dos próximos
  // milênios é ambíguo aqui, e um `ts` em ms interpretado como segundos daria
  // idade negativa de ~52 mil anos — rejeição de notificação legítima, que é
  // o erro caro. Segundos fracionários (ex.: "1723500000.482") passam pela
  // mesma multiplicação sem perder a ordem de grandeza.
  return numeric >= 1e11 ? numeric : numeric * 1000;
}

/**
 * Valida a assinatura do webhook e devolve um DIAGNÓSTICO.
 *
 * Devolve `{ valid, reason, ... }` em vez de um booleano porque os motivos
 * de rejeição têm significados de segurança MUITO diferentes: assinatura
 * forjada/ausente é ruído de varredura da internet; assinatura
 * criptograficamente válida porém velha só pode vir de quem teve acesso a
 * uma notificação real (replay) ou de um relógio quebrado. O handler
 * registra o motivo no security event para que os dois não se misturem no
 * mesmo alerta.
 *
 * `ageSeconds` vem COM SINAL (positivo = passado, negativo = futuro) e
 * `toleranceSeconds`, em uma rejeição, é o limite que foi de fato violado.
 *
 * @returns {{valid: boolean, reason: string|null, ageSeconds: number|null,
 *   toleranceSeconds: number, pastToleranceSeconds: number,
 *   futureSkewSeconds: number, aged: boolean}}
 */
function inspectWebhookSignature(req) {
  const toleranceSeconds = resolveToleranceSeconds();
  const futureSkewSeconds = resolveFutureSkewSeconds(toleranceSeconds);
  const fail = (reason, ageSeconds = null, violatedBoundSeconds = toleranceSeconds) => ({
    valid: false,
    reason,
    ageSeconds,
    // `toleranceSeconds` carrega o limite EFETIVAMENTE violado (passado ou
    // futuro) porque é ele que o handler grava no security event: registrar a
    // janela do passado em uma rejeição por futuro tornaria o evento
    // impossível de interpretar seis meses depois.
    toleranceSeconds: violatedBoundSeconds,
    pastToleranceSeconds: toleranceSeconds,
    futureSkewSeconds,
    aged: ageSeconds !== null && Math.abs(ageSeconds) > AGE_NOTICE_SECONDS,
  });

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];

  if (!xSignature || !xRequestId) {
    return fail('missing_headers');
  }

  // Mercado Pago envia: ts=timestamp,v1=hash
  const signatureParts = String(xSignature)
    .split(',')
    .map((part) => part.trim())
    .reduce((acc, part) => {
      const [key, value] = part.split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});

  const timestamp = signatureParts.ts;
  const hash = signatureParts.v1;
  const paymentId = req.body?.data?.id;

  if (!timestamp || !hash || !paymentId) {
    return fail('malformed_signature');
  }

  // NUNCA reutilizar o MERCADOPAGO_ACCESS_TOKEN como chave HMAC: é um segredo
  // distinto do webhook secret do MP. Sem WEBHOOK_SECRET, rejeitamos (fail-closed)
  // em vez de validar contra o segredo errado.
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return fail('missing_secret');
  }

  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${timestamp};`;
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  const left = Buffer.from(hash);
  const right = Buffer.from(expectedHash);
  if (left.length !== right.length) {
    return fail('hash_mismatch');
  }

  if (!crypto.timingSafeEqual(left, right)) {
    return fail('hash_mismatch');
  }

  // ORDEM DELIBERADA: o frescor é verificado DEPOIS do HMAC, nunca antes.
  // Até a assinatura conferir, o `ts` é um número escolhido pelo atacante —
  // decidir qualquer coisa com base nele seria decidir com base em entrada
  // não autenticada, e permitiria a qualquer um da internet escolher qual
  // evento de segurança aparece no nosso alerta (poluição de log). Só depois
  // do timingSafeEqual sabemos que aquele `ts` foi emitido pelo Mercado Pago.
  const signedAtMs = normalizeSignatureTimestampMs(timestamp);
  if (signedAtMs === null) {
    return fail('unparsable_timestamp');
  }

  // Idade COM SINAL: positiva = passado (reentrega ou replay), negativa =
  // futuro (skew de relógio ou `ts` forjado). Manter o sinal em vez de tomar
  // o valor absoluto é o que permite aplicar os dois limites assimétricos e o
  // que torna o security event legível — "age_seconds: -3600" diz na hora que
  // o problema é relógio, não replay.
  const ageSeconds = Math.round((Date.now() - signedAtMs) / 1000);

  if (ageSeconds < 0 && -ageSeconds > futureSkewSeconds) {
    // Reentrega legítima NUNCA vem do futuro. Aqui o lado restritivo é o
    // barato: não há cliente pago para perder, só relógio quebrado ou forja.
    return fail('stale_timestamp', ageSeconds, futureSkewSeconds);
  }

  if (ageSeconds > toleranceSeconds) {
    return fail('stale_timestamp', ageSeconds, toleranceSeconds);
  }

  // Faixa de atenção: ACEITA, porém sinalizada. Fica no console (síncrono,
  // sem depender de flush de I/O no fim da invocação serverless, ao contrário
  // do recordSecurityEvent, que é assíncrono e não pode ser disparado sem
  // await de dentro de uma função síncrona) e também volta no diagnóstico,
  // para o handler poder promover isso a security event quando quiser. Uma
  // rajada dessas linhas com o MESMO payment_id é o padrão de replay; uma
  // linha isolada logo após um 5xx nosso é reentrega legítima — que é
  // exatamente o desfecho que esta janela larga existe para não quebrar.
  const aged = ageSeconds > AGE_NOTICE_SECONDS;
  if (aged) {
    console.warn(
      `[mercadopago] webhook com assinatura válida e ts antigo: age=${ageSeconds}s `
      + `(limite=${toleranceSeconds}s, payment_id=${paymentId}, request_id=${xRequestId}) — `
      + 'aceito como reentrega; investigar se repetir.',
    );
  }

  return {
    valid: true,
    reason: null,
    ageSeconds,
    toleranceSeconds,
    pastToleranceSeconds: toleranceSeconds,
    futureSkewSeconds,
    aged,
  };
}

/**
 * Wrapper booleano — preservado porque é a assinatura pública histórica
 * deste módulo (citada em docs/ e nos testes de regressão). Handlers novos
 * devem usar `inspectWebhookSignature` para conseguir registrar o motivo.
 */
function validateWebhookSignature(req) {
  return inspectWebhookSignature(req).valid;
}

module.exports = {
  initializeMercadoPago,
  createPaymentPreference,
  getPaymentInfo,
  validateWebhookSignature,
  inspectWebhookSignature,
  // ── Constantes da janela, exportadas de propósito ──────────────────
  // Os testes de regressão do P1-5 precisam dimensionar cenário ("um `ts`
  // 60s ALÉM do limite") e é obrigatório que derivem do número daqui em vez
  // de repeti-lo. Uma cópia no teste vira um segundo contrato: quando a
  // janela foi recalibrada de 300s para 48h, o teste continuou afirmando
  // sobre os 300s e passou a acusar falha em cima de um comportamento
  // CORRETO — ruído que custa mais caro que a proteção que ele guarda.
  // Exportando, mudar a política aqui reescreve o teste junto, e só sobra
  // vermelho quando a INTENÇÃO (rejeitar o que está fora da janela) quebra.
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  MAX_WEBHOOK_TOLERANCE_SECONDS,
  DEFAULT_FUTURE_SKEW_SECONDS,
  AGE_NOTICE_SECONDS,
};
