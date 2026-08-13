# 0002 — Um handler serve a Vercel e o Express de desenvolvimento

**Status:** aceito · **Data:** 2026-08-13 (registro de decisão já vigente no código)

## Contexto

O projeto tem dois modos de execução:

- **produção** — Vercel, cada arquivo de `api/` publicado como função serverless isolada;
- **desenvolvimento** — um Express (`server.js`) em `localhost:3000`.

Houve uma época em que o Express tinha rotas próprias, com sua própria validação e seus
próprios limitadores. O resultado foi a classe de bug mais cara já encontrada aqui: **a
proteção existia em desenvolvimento e não existia em produção.**

O caso concreto está registrado em `api/validate-coupon.js`: o limitador de cupom "só existia
no Express de desenvolvimento" e a divergência dev/prod **era a causa raiz do achado**. O
padrão se repetiu — na padronização de 2026-08-13, outros cinco endpoints públicos
(`download` entre eles) estavam descobertos em produção pelo mesmo motivo: o limitador global
de `server.js` nunca roda lá.

## Decisão

Todo endpoint servido pelo Express é **o mesmo módulo** que a Vercel publica como função.
`routes/api-compat.routes.js` e `routes/auth.routes.js` apenas montam os handlers de `api/`;
não implementam comportamento.

Corolários que não são negociáveis:

1. **Guarda de segurança mora no handler**, nunca só no Express. Rate limit é
   `enforceRateLimit(...)` dentro do handler (regra E1), não `app.use(rateLimit(...))`.
2. **Nada de estado de processo** para decidir comportamento: em serverless cada invocação
   pode ser uma instância nova (regra E2).
3. O middleware de erro do Express (`middleware/error.middleware.js`) é rede de segurança
   para o que escapa do `try/catch` — **não** é o mecanismo de erro dos handlers (ver
   [ADR 0004](./0004-envelope-de-resposta-e-codigo-de-erro.md) e a regra B3).

## Consequências

**Boas.** O que se testa em desenvolvimento é o que roda em produção. As suítes de
`api/__tests__/` exercitam os handlers diretamente e valem para os dois modos.

**Ruins.** Recursos do Express que não existem na Vercel (middleware encadeado, `app.use`
por prefixo) ficam indisponíveis como mecanismo de produto — só como conveniência local.
Cada handler repete o seu próprio topo (CORS → OPTIONS → método → rate limit → auth →
validação), o que a regra A3 transforma em vantagem: a ordem fixa faz uma guarda ausente
saltar aos olhos, em vez de ficar escondida na configuração de um middleware.

## Alternativas descartadas

**Manter um BFF Express próprio em produção.** Exigiria hospedar um processo longevo (custo,
deploy, monitoramento) e duplicaria toda a lógica que hoje é única.

**Aceitar a divergência e documentá-la.** Foi o estado anterior, na prática. Custou os
achados P1-3 e os cinco endpoints sem contador. Documentação não impede uma guarda de existir
só de um lado; código único impede.
