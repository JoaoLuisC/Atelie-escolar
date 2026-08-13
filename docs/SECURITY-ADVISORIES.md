# Advisories de dependência — análise

Última verificação: **13/08/2026**. Reproduza com `npm audit` e `npm audit --omit=dev`.

Este documento existe porque `npm audit` conta advisories, não risco. Um número alto de
advisories em ferramenta de build assusta e não afeta ninguém; uma advisory moderada numa
dependência de runtime pode ser o contrário. O que importa é **se o caminho vulnerável é
alcançável neste código** — e isso o `npm audit` não responde.

---

## Estado atual

| | antes | depois |
|---|---:|---:|
| Total (`npm audit`) | 21 | **2** |
| Crítica | 1 | **0** |
| Alta | 10 | **0** |
| Runtime (`npm audit --omit=dev`) | 2 | **2** |

As 2 restantes são a mesma advisory, contada duas vezes (o pacote e quem depende dele), e
**não são alcançáveis** — análise abaixo.

---

## Resolvido: o CLI `vercel` saiu das devDependencies

**19 das 21 advisories vinham de uma única raiz**: o pacote `vercel` (CLI), que estava em
`devDependencies` e **nenhum script ou workflow invocava**. O deploy acontece pela plataforma,
via `buildCommand` em `vercel.json` — o CLI nunca roda.

O que ele arrastava:

| Pacote | Severidade | Via |
|--------|-----------|-----|
| `tar` | **crítica** | `@mapbox/node-pre-gyp` |
| `undici` | alta (17 advisories) | `@vercel/node` |
| `path-to-regexp`, `semver` | alta | `@vercel/routing-utils` |
| `esbuild` | moderada | `@vercel/node` |
| `ajv`, `@tootallnate/once`, `debug` | moderada / baixa | transitivas |

Vale registrar o `esbuild`: a advisory dele ("qualquer site pode mandar requisição para o dev
server") pareceria relevante para quem roda `npm run dev`. Não era — `npm ls esbuild` mostrava
que ele vinha **só** do CLI da Vercel. O dev server deste projeto é o Vite 8, que usa rolldown.

Remover não tira capacidade de ninguém: `npx vercel` continua funcionando sob demanda, sem o
pacote fixado na árvore.

---

## Aceito: `uuid <11.1.1` sob `mercadopago` — não alcançável

**Advisory:** [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) —
*Missing buffer bounds check in v3/v5/v6 when `buf` is provided*. Severidade moderada.

**Por que não se aplica aqui.** A falha está nas versões **v3, v5 e v6** do gerador, e só
quando o chamador passa um buffer de destino (`buf`). O SDK do Mercado Pago usa **apenas
`v4()`**, sem `buf`, num único ponto:

```
node_modules/mercadopago/dist/utils/restClient/index.js:50   uuid_1.v4()
```

É o gerador da chave de idempotência da requisição. `v4` não compartilha o caminho de código
afetado. Verificação (deve listar só `uuid_1.v4`):

```bash
grep -rnoE "uuid_1\.v[0-9]+" node_modules/mercadopago/dist/ | grep -v ".map" | sort -u
```

**Por que não corrigimos.** O `npm audit fix --force` instalaria `mercadopago@3.4.0` — mudança
de major no SDK que processa **todo o pagamento da loja**: criação de preference, consulta de
pagamento e validação de assinatura de webhook. Trocar isso para fechar uma advisory que não é
alcançável troca risco zero por risco real.

**O que faria mudar essa decisão**, em ordem:

1. `mercadopago@2.x` publicar um patch com `uuid >= 11.1.1` — nesse caso é só atualizar;
2. o SDK passar a usar `v3/v5/v6` com `buf` (o `grep` acima detecta);
3. uma migração para o SDK 3.x acontecer por outro motivo — aí a advisory sai junto, de graça.

---

## Como manter isto vivo

O workflow `.github/workflows/test.yml` roda `npm audit --omit=dev --audit-level=high` como
passo **não bloqueante**, de propósito: uma advisory nova numa dependência transitiva
apareceria do nada e travaria trabalho sem relação com ela.

Não bloquear não é ignorar. A rotina é:

1. **Runtime primeiro** (`npm audit --omit=dev`). É o que chega ao cliente.
2. **Achar a raiz** com `npm ls <pacote>` antes de qualquer coisa. Advisories transitivas quase
   sempre vêm de uma dependência só — como as 19 acima.
3. **Perguntar se o caminho é alcançável.** Ler a advisory e conferir no código do pacote qual
   função é usada. Foi o que separou "2 moderadas" de "2 moderadas inofensivas".
4. **Nunca rodar `npm audit fix --force` sem ler.** Ele instala major version. No caminho do
   dinheiro isso é troca de risco, não redução.
5. **Atualizar este arquivo** quando a resposta mudar.
