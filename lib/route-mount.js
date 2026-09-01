// ════════════════════════════════════════════════════════════════════
// MONTAGEM DE HANDLER NO EXPRESS — o adaptador único dos dois routers.
//
// POR QUE ESTE ARQUIVO EXISTE
// `wrapCompatHandler` morava dentro de `routes/api-compat.routes.js` e não era
// exportado, então `routes/auth.routes.js` não tinha como reusá-lo — e acabou
// montando os handlers de auth de um jeito diferente: importando as funções de
// `lib/customer-auth-handlers` DIRETO, sem passar pelos módulos de
// `handlers/auth/customer/**` que carregam `enforceRateLimit` e a checagem
// anti-CSRF. Enquanto produção era "um arquivo de api/ = uma função Vercel"
// isso era inofensivo, porque aquele router só rodava em dev. Quando o 660fe74
// consolidou tudo em UMA função, esse router virou o caminho de produção e as
// guardas saíram do ar sem que nada acusasse.
//
// Duas responsabilidades, então:
//   1. dar UM jeito de montar handler, usado pelos dois routers;
//   2. deixar rastro de QUAL módulo foi montado (`getMountedHandler`), para que
//      o teste de paridade possa comparar identidade de módulo em vez de
//      comparar strings de caminho — a verificação que teria pego o 660fe74.
// ════════════════════════════════════════════════════════════════════

/**
 * Liga o wrapper montado ao módulo de `handlers/` que ele embrulha.
 *
 * WeakMap e não uma propriedade no próprio wrapper: uma propriedade seria
 * enumerável em `Object.keys`, sobreviveria a um `{...handler}` acidental e
 * poderia ser sobrescrita por engano. Aqui a associação é privada a este
 * módulo e não altera a função montada em nada observável.
 */
const mountedHandlers = new WeakMap();

/**
 * Embrulha um handler de `handlers/**` para uso como middleware do Express.
 *
 * O que o wrapper faz, e por quê:
 *
 * • **Silencia `access-control-allow-*` vindo do handler.** Os handlers foram
 *   escritos quando cada um era uma função Vercel isolada e precisava emitir
 *   os próprios headers de CORS. No app compartilhado quem manda é o
 *   middleware `cors` de `lib/express-app.js`; deixar o handler escrever
 *   também produz header duplicado, que o browser trata como inválido.
 *
 * • **Encaminha rejeição para `next(error)`.** Sem isto, um `throw` dentro de
 *   handler assíncrono não chega ao `errorHandler` de
 *   `middleware/error.middleware.js` e o cliente recebe uma resposta pendurada
 *   em vez do envelope de erro (regra A1).
 *
 * • **Restaura `res.setHeader` no `finally`.** O patch é por requisição; vazar
 *   para a próxima faria um handler legítimo perder headers de CORS.
 */
function mountHandler(handler) {
  const mounted = async function mountedHandler(req, res, next) {
    const originalSetHeader = res.setHeader.bind(res);

    res.setHeader = function patchedSetHeader(name, value) {
      const headerName = String(name || '').toLowerCase();
      if (headerName.startsWith('access-control-allow-')) {
        return this;
      }
      return originalSetHeader(name, value);
    };

    try {
      return await handler(req, res);
    } catch (error) {
      return next(error);
    } finally {
      res.setHeader = originalSetHeader;
    }
  };

  mountedHandlers.set(mounted, handler);
  return mounted;
}

/**
 * Devolve o módulo de `handlers/` por trás de um middleware montado, ou
 * `undefined` se aquele middleware não veio de `mountHandler`.
 *
 * Existe para o teste de paridade: é o que permite perguntar ao router "o que
 * você REALMENTE montou neste caminho?" em vez de confiar em que o caminho
 * existir dos dois lados significa que o mesmo código roda dos dois lados.
 */
function getMountedHandler(mounted) {
  return mountedHandlers.get(mounted);
}

module.exports = { mountHandler, getMountedHandler };
