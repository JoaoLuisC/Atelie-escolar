# 0004 — Envelope de resposta e código de erro

**Status:** aceito · **Data:** 2026-08-13

## Contexto

Os 44 handlers de `api/` foram escritos em momentos diferentes e cada um inventou o próprio
contrato de erro. A medição de 2026-08-13 encontrou **três formatos vivos ao mesmo tempo**:

| Formato                                        | Ocorrências                      |
| ---------------------------------------------- | -------------------------------- |
| `{ success: false, error: 'texto' }`           | 32 handlers                      |
| `{ error: 'texto' }`                           | 9 handlers                       |
| `{ success: false, error: { message, code } }` | `middleware/error.middleware.js` |

O custo não ficou no backend. `src/utils/api.js` carregava um _shim_ em `parseJson` que
detectava `error` como objeto e o achatava para string, existindo **apenas** para o cliente
sobreviver aos dois formatos.

E sem código estável, o cliente ramificava por texto em português.
`src/components/admin/utils/format.js` decidia se a sessão do admin tinha expirado com
`String(error.message).toLowerCase().includes('sessao admin')` — reescrever a frase quebrava
o fluxo de re-login em silêncio, sem nenhum teste que pegasse.

## Decisão

Toda resposta JSON passa por `lib/http.js`:

```js
// sucesso — payload plano ao lado do flag
ok(res, { products, total }); // { success: true, products, total }

// erro — objeto, SEMPRE com code
fail(res, { status: 422, code: ERROR_CODES.COUPON_EXPIRED, message: 'Este cupom expirou.' });
// { success: false, error: { code: 'COUPON_EXPIRED', message: 'Este cupom expirou.' } }
```

- `code` é SCREAMING_SNAKE, vem do catálogo em `lib/http.js`, e é **o contrato de máquina**.
- `message` é para humano e pode ser reescrita a qualquer momento.
- O catálogo do browser (`src/constants/error-codes.js`) é uma cópia, guardada por teste.

**Assimetria deliberada:** o erro é aninhado, o sucesso é plano. O erro precisa de estrutura
porque carrega dois campos com públicos diferentes; o sucesso não precisa.

## Consequências

**Boas.** O shim de `parseJson` deixou de ser necessário para reconciliar formatos — ele
sobrevive só achatando `error` para string por conveniência das telas, e agora **expõe
`errorCode`**, que é por onde o cliente deve ramificar. `isSessionError` compara código.

`fail()` também centralizou duas políticas que estavam espalhadas: `details` nunca vaza em
produção, e 405 passou a emitir o header `Allow` — que nenhum dos 44 handlers emitia.

**Ruins.** O sucesso plano significa que um payload de domínio não pode usar a chave
`success`. É uma restrição real, aceita por ser barata perto de reescrever todo consumidor.

## Alternativas descartadas

**`{ success: true, data: {...} }` — sucesso aninhado.** Foi a primeira redação da regra A1.
Contrato mais limpo, e descartado por custo/risco: obrigaria a reescrever todo consumidor do
frontend e ~100 asserções de teste, no caminho do checkout inclusive. O ganho sobre
`{ success, ...payload }` é pequeno; a dor medida estava toda no lado do erro.

**Adotar `AppError` + middleware como mecanismo dos handlers.** Descartado por causa do
[ADR 0002](./0002-handler-unico-para-vercel-e-express.md): o middleware do Express não roda
na Vercel, então `throw new AppError(..., 400)` daria 400 em desenvolvimento e 500 genérico
em produção — exatamente a divergência dev/prod que mais custou caro neste projeto.
