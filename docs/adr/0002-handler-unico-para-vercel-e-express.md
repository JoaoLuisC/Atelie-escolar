# 0002 — Um handler serve a Vercel e o Express de desenvolvimento

**Status:** aceito · **Data:** 2026-08-13 (registro de decisão já vigente no código)

## Contexto

O projeto tem dois modos de execução:

- **produção** — Vercel, uma função serverless (`api/index.js`) servindo o app Express compartilhado (ver emenda no fim);
- **desenvolvimento** — um Express (`server.js`) em `localhost:3000`.

Houve uma época em que o Express tinha rotas próprias, com sua própria validação e seus
próprios limitadores. O resultado foi a classe de bug mais cara já encontrada aqui: **a
proteção existia em desenvolvimento e não existia em produção.**

O caso concreto está registrado em `handlers/validate-coupon.js`: o limitador de cupom "só existia
no Express de desenvolvimento" e a divergência dev/prod **era a causa raiz do achado**. O
padrão se repetiu — na padronização de 2026-08-13, outros cinco endpoints públicos
(`download` entre eles) estavam descobertos em produção pelo mesmo motivo: o limitador global
de `server.js` nunca roda lá.

## Decisão

Todo endpoint servido pelo Express é **o mesmo módulo** que a função da Vercel publica.
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
`handlers/__tests__/` exercitam os handlers diretamente e valem para os dois modos.

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

---

## Emenda — 2026-08-26: uma função, não 44

O primeiro deploy real deste projeto bateu num teto que a decisão original não previa: o plano
Hobby da Vercel publica **no máximo 12 Serverless Functions por deployment**, e o modelo "um
arquivo de `api/` = uma função" produzia 44.

**A decisão acima não muda.** Todo endpoint continua sendo o mesmo módulo nos dois ambientes —
esse é o ponto do ADR, e ele fica ainda mais forte: agora é literalmente o mesmo processo
Express (`lib/express-app.js`) rodando em dev e em produção. O que mudou foi o empacotamento:

- os 44 handlers saíram de `api/` para `handlers/` (dentro de `api/` a Vercel os publicaria
  como função de novo);
- `api/index.js` é a única função, e serve o app compartilhado;
- o caminho original chega pelo parâmetro `__path`, porque um `dest` do `vercel.json` reescreve
  `req.url` (detalhes no cabeçalho de `api/index.js`).

**Corolário 1 (guarda mora no handler) — continua obrigatório.** `app.use` passou a rodar em
produção, o que este ADR listava como indisponível. Isso não libera mover guarda para middleware:
`enforceRateLimit`, auth e validação seguem dentro do handler. Guarda em middleware volta a ser
guarda que existe só de um lado assim que alguém chamar o handler direto num teste — e as suítes
de `handlers/__tests__/` fazem exatamente isso.

**Corolário 2 (nada de estado de processo) — inalterado.** Uma função ainda tem várias instâncias
e hiberna entre invocações. O contador de rate limit continua no Postgres ([ADR 0007](./0007-um-mecanismo-de-rate-limit.md)).

**Alternativas descartadas nesta emenda.** Vercel Pro (US$ 20/mês) resolveria sem código, mas o
projeto tem meta de custo fixo zero até faturar. Hospedar o `server.js` inteiro em outro provedor
recriaria a operação de dois lugares que a decisão original evitou.
