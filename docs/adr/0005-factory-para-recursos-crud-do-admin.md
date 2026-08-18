# 0005 — Factory para os recursos CRUD do admin

**Status:** aceito · **Data:** 2026-08-18

## Contexto

`api/admin/products.js`, `categories.js`, `coupons.js`, `orders.js` e `users.js` terminavam com o
**mesmo bloco de ~55 linhas**, replicado caractere por caractere — inclusive o comentário
`// Auditoria de escrita (regra I1) — best-effort.` e o mapa `actionByMethod`. Diferiam em
exatamente três coisas: o `targetType` da auditoria, a chave do recurso na resposta e a mensagem
do `catch`.

O custo não era contagem de linhas. Eram **cinco lugares onde a auditoria de escrita podia ser
esquecida no próximo recurso admin**, sem nenhum teste que pegasse. A regra I1 dependia de alguém
lembrar de copiar o bloco certo.

E a duplicação já tinha produzido divergência mensurável:

| Sintoma medido em 18/08/2026                                             |                         Onde |
| ------------------------------------------------------------------------ | ---------------------------: |
| Respostas de erro fora do `fail()`, sem `code` (regra A1/A2)             | 31 sites nos cinco arquivos¹ |
| `{ error: 'texto' }` **sem `success: false`** — o formato dado por morto |     6 sites em `products.js` |
| Lista do header `Allow` repetida à mão, podendo divergir do mapa real    |          5 arquivos, 5 vezes |
| Par `OPTIONS`/`methodNotAllowed` manual em vez de `guardMethod`          |          5 arquivos, 5 vezes |

¹ Itens `P1.2` e `§3.2`. Nessas respostas o cliente **não recebia `code`**, então a regra A2
("ramifique por código, nunca por texto") não valia nelas — quem escrevesse um `if` por código
numa dessas telas escreveria um ramo morto para sempre.

## Decisão

Os cinco handlers passam a ser montados por **`createAdminResourceHandler`**
(`lib/admin-resource-handler.js`), que concentra: CORS → `guardMethod` → `ensureAdminSession` →
verificação do Supabase → despacho da operação → auditoria (regra I1) → `catch`.

Cada arquivo mantém **só o seu domínio** (consultas, normalização, regras do recurso) e declara:

```js
module.exports = createAdminResourceHandler({
  targetType: 'category',
  errorMessage: 'Erro ao processar categorias do admin.',
  loggerName: 'admin-categories',
  handlerName: 'adminCategoriesHandler',
  operations: {
    GET: async () => ({ status: 200, body: { categories: await listCategories() } }),
    POST: (req) => createCategory(req.body || {}),
    // …
  },
});
```

Corolários que não são negociáveis:

1. **Operação nunca escreve em `res`.** Ela devolve `{ status, body }` no sucesso ou
   `{ error: { status, code, message } }` na falha, e quem responde é a factory, por `ok()` ou
   `fail()`. É isto que fecha o `P1.2` estruturalmente em vez de site a site: não existe mais
   caminho pelo qual uma operação consiga inventar um corpo de erro.
2. **`allowed` sai do próprio mapa de operações.** O header `Allow` do 405 não tem como divergir
   do que o handler aceita, porque é derivado dele — `Object.keys(operations)`.
3. **A auditoria mora na factory.** Recurso admin novo a ganha por construção, não por cópia.
4. **O nome do handler vem da configuração** (`handlerName`), preservando a regra A5: é ele que
   aparece no stack trace da Vercel, e cinco handlers anônimos seriam cinco frames
   indistinguíveis.

## Consequências

**Boas.**

- Os cinco arquivos foram de **1.170 para 876 linhas** (−294), e o que sobrou é domínio.
- Os 31 sites de envelope legado do `P1.2` fecharam junto, sem passe separado.
- `guardMethod` (`P2.1`) ganhou os primeiros consumidores reais — ele existia, era testado, e
  tinha zero adoções em 44 handlers.
- A auditoria da regra I1 passou a ter teste: `lib/__tests__/admin-resource-handler.test.js`
  verifica a **escrita** que ela emite, não um espião confirmando que uma função foi chamada.
- O 405 passou a ser decidido **antes** da autenticação, que é a ordem que a regra A3 fixa. Antes
  vinha depois, então um método errado sem sessão respondia 401 e escondia o erro real.

**Ruins.**

- Uma indireção a mais entre a URL e o código do recurso: quem lê `api/admin/orders.js` precisa
  abrir `lib/admin-resource-handler.js` para ver o topo do handler. Mitigado por o mapa de
  operações estar no fim do arquivo, declarando explicitamente quais métodos existem.
- Um recurso que precisar de um passo fora da sequência (um rate limit próprio, por exemplo) não
  cabe na factory como ela está e vai exigir estendê-la — e a tentação será acrescentar um
  parâmetro booleano, que é como factory vira framework.

## Alternativas descartadas

**Um router genérico dirigido por configuração** — descrever tabela, colunas, validação e
permissões num objeto, e ter UM handler que serve qualquer recurso.

Descartada porque **cada recurso tem validação e normalização próprias, e não superficialmente**:
`products` resolve categoria por id ou por slug e cria a categoria se não existir; `coupons` funde
o corpo com a linha existente antes de validar e checa colisão de código; `users` recusa editar
role privilegiada; `orders` carimba `completed_at` quando o status muda. Genericizar isso trocaria
duplicação **visível** por indireção **invisível** — e a indireção invisível é a que produz o bug
que ninguém acha, porque o comportamento passa a estar num arquivo de configuração que não parece
código.

A fronteira escolhida é outra: a factory cobre o que é **idêntico nos cinco** (o protocolo HTTP e
a auditoria) e não toca no que é **diferente em cada um** (a regra de negócio).

**Deixar como estava e cobrir com teste** — escrever um teste por handler afirmando que a
auditoria acontece. Cobriria o sintoma imediato, mas o próximo recurso admin continuaria nascendo
de um copiar-colar, agora com o teste também copiado. Cinco cópias de um teste que verifica cinco
cópias de um bloco não é rede de segurança, é dobrar a superfície.

**Herança/classe base** — `class AdminResource` com métodos sobrescritos. Em CommonJS e com
handlers que a Vercel publica como função, uma factory que devolve função é mais direta e mantém o
export no formato que o runtime espera. Herança também convidaria a sobrescrever o `catch` ou a
auditoria, que são exatamente as duas coisas que esta decisão existe para tornar não-opcionais.
