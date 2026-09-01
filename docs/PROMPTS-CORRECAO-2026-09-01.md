# Prompts de correção — rodada pós-auth (01/09/2026)

> Companheiro de [REVIEW-PROMPTS.md](./REVIEW-PROMPTS.md). Lá os prompts são **read-only**, um por
> área. Aqui são **verificar → corrigir**, um por item pendente do mapeamento de 01/09/2026.
>
> **Uso:** uma sessão nova por bloco (Opus, esforço máximo). Cole o **preâmbulo + um bloco**.
> Ordem sugerida: §1 → §3 → §4 → §5 → §6 → §7 → §8 (§2 é operacional, roda quando você quiser).

---

## Preâmbulo — cole junto com qualquer bloco

```text
PAPEL: Engenheiro sênior deste repositório. Esforço de raciocínio no máximo.
MODO: verificar primeiro, corrigir depois. As afirmações do bloco são HIPÓTESES.

REGRAS:
1. Confirme a hipótese no código ATUAL antes de tocar em qualquer arquivo. Ela pode
   já estar corrigida — nesse caso escreva REFUTADO com arquivo:linha e pare. Não
   invente trabalho para justificar a sessão.
2. Toda correção vem com teste que FALHA antes e PASSA depois. O teste tem que medir
   o que EXECUTA (o módulo que o router montou, a resposta do handler), nunca o texto
   do arquivo no disco. Foi assim que o rate limit do login de cliente sumiu de
   produção com a suíte verde — ver docs/reviews/REVIEW-AUTH-2026-09-01.md.
3. Leia CONTRIBUTING.md antes de escrever código. São 29 regras e elas valem.
4. Não alargue o escopo. Achou problema fora do bloco: anote no fim do relatório,
   não conserte.
5. Um commit por item, no padrão do repo: tipo(escopo): frase no imperativo.
6. Fecha com `npm run check` verde (format + lint + env + testes + cobertura + build).
7. NADA de ação em produção — migration, rotação de segredo, deploy, escrita no
   Supabase — sem me perguntar antes.
8. Relatório novo vai em docs/reviews/ com data no nome. Não edite os retratos
   antigos: eles são datados de propósito (regra F2).

SAÍDA: (a) confirmado/refutado, com arquivo:linha; (b) o que mudou; (c) o teste que
prova; (d) o que ficou de fora e por quê.
```

---

## §1 — Catraca de cobertura destravada

```text
Os pisos de cobertura em vite.config.js estão em 25/19/21/25 (statements/branches/
functions/lines). A suíte cresceu muito desde que esses números foram medidos e a
catraca não foi girada — hoje cabem ~19pp de regressão silenciosa sem o CI reclamar.

Rode `npm run test:coverage`, confirme os números medidos, e suba os pisos para o
medido menos ~2pp de folga, como manda a regra D2 do CONTRIBUTING. Atualize o
comentário do bloco de thresholds — ele documenta os valores medidos e a data, e é o
que explica por que os números são esses. Confirme que o gate roda de fato em
.github/workflows/test.yml.
```

## §2 — Migrations: código auditado ≠ banco em produção

```text
O §1 de docs/ProjectDocs/13-ROADMAP-PENDENCIAS.md diz que a aplicação das 18 migrations
em produção "não está confirmada". A Área 3 (Banco & RLS) foi dada como corrigida lendo
os arquivos .sql — o que não diz nada sobre o banco que está no ar. Enquanto isso, RLS é
o boundary de autorização do browser.

Verifique o que dá para verificar SEM escrever em produção: liste supabase/migrations/,
reúna as queries de conferência (já existem em 04-BANCO-DE-DADOS §migrations) e monte um
checklist de validação — quais tabelas devem ter RLS, quais políticas, quais índices.
NÃO rode `supabase db push` nem nada que escreva: entregue o roteiro e me pergunte.
Se houver acesso somente-leitura ao banco, diga o que está divergente.
```

## §3 — Dois writers admin fora do audit log

```text
`logAdminAction` (lib/admin-audit.js) é chamado pela factory lib/admin-resource-handler.js
(os 5 recursos CRUD) e por handlers/admin/settings.js. Dois endpoints que apagam dado
parecem ter ficado de fora:
  - handlers/admin/cleanup-events.js  (POST, purga analytics)
  - handlers/admin/upload-url.js      (POST/DELETE no Storage)

Confirme. Se confirmado, registre as duas ações no mesmo formato das demais
(action/target_type/target_id/before/after). Teste: chamada bem-sucedida grava a linha;
chamada barrada por sessão/origem não grava nada.

Depois avalie — e proponha antes de implementar — um gate no espírito de
handlers/__tests__/rate-limit-coverage.test.js: "todo handler admin que escreve está no
audit log ou numa lista de dispensa nomeada". A contagem manual já provou aqui que ela
volta a subir quando não vira gate.
```

## §4 — Caminho do dinheiro: reverificar a montagem, não o handler

```text
A Área 1 (Pagamentos & Webhook) foi revisada e corrigida em 12/08/2026 sobre o commit
e085971 — ANTES do 660fe74, que remontou os 44 handlers numa única função serverless.
Foi exatamente essa remontagem que desligou rate limit e anti-CSRF do login de cliente
sem nenhum teste ficar vermelho.

NÃO refaça a Área 1. Cheque a CAMADA DE MONTAGEM do caminho do dinheiro. Para
/api/webhook, /api/create-payment, /api/verify-payment, /api/validate-coupon e
/api/download: qual módulo é REALMENTE servido hoje (routes/, api/index.js,
lib/route-mount.js, vercel.json), em dev e no que a Vercel publica — e se as guardas que
o relatório de 12/08 deu por instaladas (assinatura HMAC do webhook, rate limit dedicado,
uso único atômico do download token, checagem de origem) estão no caminho EXECUTADO.

Os gates routes/__tests__/api-route-parity.test.js e
handlers/__tests__/rate-limit-coverage.test.js já comparam identidade de módulo. Diga
explicitamente o que eles JÁ cobrem dessa lista e o que passa por fora deles — o buraco
que sobra é o entregável desta sessão.
```

## §5 — Área 4 · API Backend / Handlers

```text
Rode a "Área 4 — API Backend / Handlers Serverless" de docs/REVIEW-PROMPTS.md (o escopo e
os pontos quentes estão lá; leia o bloco inteiro), com duas diferenças:
  - modo verificar-e-corrigir, seguindo o preâmbulo acima, não read-only;
  - os pontos quentes foram escritos antes do 660fe74. Trate cada um como hipótese datada
    e confirme contra a montagem de hoje antes de concluir qualquer coisa.
É a área com mais mudança acumulada desde a última auditoria e nunca foi rodada.
```

## §6 — Área 10 · DevOps, Deploy & Configuração

```text
Rode a "Área 10 — DevOps, Deploy & Configuração" de docs/REVIEW-PROMPTS.md em modo
verificar-e-corrigir (preâmbulo acima). Foco no que separa dev de produção: vercel.json,
api/index.js, variáveis de ambiente por ambiente, os 3 workflows do GitHub, gates de
build. É onde mora a classe de bug "certo no código, errado em produção" — a mesma que
mordeu o login. Mudança de infra/env: proponha, não aplique.
```

## §7 — Área 6 · LGPD / Privacidade

```text
Rode a "Área 6 — LGPD / Privacidade & Compliance" de docs/REVIEW-PROMPTS.md em modo
verificar-e-corrigir (preâmbulo acima). O fluxo de exclusão de conta, o banner de
consentimento e a purga de logs estão implementados e nunca foram auditados por essa
lente. Confirme que o consentimento realmente barra GA4/Pixel no caminho executado, não
só no componente.
```

## §8 — Áreas 5 e 8 · Frontend e Qualidade (dívida, não sangramento)

```text
Rode as áreas 5 (Frontend React) e 8 (Qualidade & Arquitetura) de docs/REVIEW-PROMPTS.md
em modo verificar-e-corrigir (preâmbulo acima). Os relatórios existentes dessas áreas são
retratos de 01/07 e 12/08 e a maior parte já foi corrigida — releia o código, não o
relatório.

Alvos visíveis hoje: src/components/ProductWizard.jsx (879 linhas),
src/components/admin/tabs/DashboardTab.jsx (810), AnalysisTab.jsx (676),
src/pages/CheckoutPage.jsx (666). E `lint --max-warnings=17`: diga quais são os 17 e
quantos dá para zerar (regra D5).

Isto é manutenção. Se conflitar com qualquer bloco anterior, os anteriores ganham.
```
