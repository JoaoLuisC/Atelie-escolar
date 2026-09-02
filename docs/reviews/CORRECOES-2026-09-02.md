# Fechamento dos pendentes — 02/09/2026

> **Retrato datado — 02/09/2026.** Continuação de
> [CORRECOES-2026-09-01.md](./CORRECOES-2026-09-01.md), que fica como está: o que ele lista como
> aberto foi fechado aqui, e a tabela de lá aponta para este documento.
> Este também não se atualiza — o commit é a prova.

Os cinco itens que a rodada de 01/09 deixou em aberto. Autorização recebida para as consultas
**somente-leitura** contra produção; `supabase db push` continua não tendo sido executado.

| Item                             | Resultado                                     | Commit    |
| -------------------------------- | --------------------------------------------- | --------- |
| Validar o banco em produção      | Feito no que o PostgREST alcança — **passou** | `384d87b` |
| Retenção de `abandoned_carts`    | Migration **escrita, não aplicada**           | `46af408` |
| Anonimização de IP               | **Reformulado** — o achado era outro          | `43ea1e0` |
| Exportação de dados (art. 18, V) | Entregue, com botão na conta                  | `0663705` |
| `AnalysisTab`                    | Caracterizado e extraído                      | `94e0a7c` |

**Números do dia:** 935 → **970 testes**; cobertura **50,99 / 41,60 / 43,98 / 52,51** com pisos em
48/39/41/50. `npm run check` verde.

---

## 1. O banco em produção — verificado no que importa

`scripts/check-rls.js` pega a chave `anon` — a mesma que está no bundle publicado, portanto pública
— e tenta ler cada tabela, com `limit=0` e `Prefer: count=exact`: só a contagem volta, zero linhas,
nada é escrito. É a pergunta que o atacante faria.

| Verificação                                | Resultado                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| As 16 tabelas fechadas existem             | **Sim** — nenhuma 404, as migrations rodaram                                                                                                                             |
| `anon` lê alguma delas                     | **Não** em nenhuma                                                                                                                                                       |
| Policy comprovadamente filtrando           | **8** (orders 14 linhas, order_items 17, profiles 10, analytics_events 158, security_events 1, abandoned_carts 2, settings 1, rate_limit_hit 2 — e `anon` vê 0 em todas) |
| Inconclusivas (tabela vazia)               | 8 — proteção não contrariada, mas não provada                                                                                                                            |
| Catálogo público legível                   | **Sim** — categories e products, 10 linhas cada                                                                                                                          |
| `products.download_url` revogado do `anon` | **Sim** — `401 42501`                                                                                                                                                    |

O último é o sinal mais forte do conjunto: o revoke de coluna é da **wave1 (12/08)**, a migration de
segurança mais recente. Ela está viva em produção, o que sustenta a inferência de que as anteriores
também foram aplicadas.

### As duas armadilhas que a primeira versão do script pisou

Estão escritas no cabeçalho dele porque o resultado falso era alarmante — 16 tabelas apontadas como
world-readable e a vitrine como quebrada, tudo artefato da sonda:

1. **RLS ligada sem policy responde `200` com zero linhas, não erro.** "Recebeu 200" não é
   exposição; "recebeu lista vazia" não é proteção. A única leitura conclusiva compara com a
   contagem da chave de serviço — e quando as duas dão zero, o script diz **INCONCLUSIVO** em vez de
   inventar veredito.
2. **`select=*` em `products` dá permission denied mesmo com o catálogo perfeito**, porque a wave1
   revogou o SELECT da tabela e regrantou coluna a coluna.

### O que continua sem verificação

Funções de purga, jobs do `pg_cron`, triggers de imutabilidade do audit log e índices **não são
observáveis pelo PostgREST**. Precisam do SQL Editor ou de um `SUPABASE_PAT` — as consultas estão no
§2 do relatório de 01/09. Sem `SUPABASE_PAT`, `SUPABASE_PROJECT_REF` nem `SUPABASE_DB_URL` no
ambiente, esse caminho não existe hoje.

> **Observação que vale a sua atenção:** `admin_audit_log` está **vazio** em produção. Ou nenhuma
> escrita administrativa auditada aconteceu desde que a tabela foi criada, ou as gravações estão
> falhando em silêncio. Para desempatar: salve qualquer configuração no painel e rode
> `node scripts/check-rls.js` de novo — a contagem da chave de serviço tem que sair de 0.

---

## 2. Retenção de `abandoned_carts` — escrita, não aplicada

`supabase/migrations/20260902000000_abandoned_carts_retention.sql` cria
`cleanup_old_abandoned_carts()` e agenda job mensal. **Não rodei `supabase db push`.**

90 dias, e não os 7 que o comentário da migration original prometia: os 7 descreviam o carrinho como
fila de recuperação, e para isso bastam — o cron olha janelas de 1h e 24h. Mas a mesma tabela
alimenta a base de reativação e o funil do painel, que trabalham em meses. O número é decisão de
negócio, e isso está escrito no cabeçalho da migration: se a política de privacidade publicada
declarar outro prazo, quem manda é ela, e os dois mudam juntos.

---

## 3. Anonimização de IP — a pergunta estava no lugar errado

Verificado antes de mexer, e os dois alvos do prompt se dissolveram:

- **`page_views` não tem escritor.** Nenhum arquivo do repositório grava nela. A tabela existe com
  RLS, índice e purga de 6 meses, para dado que ninguém produz — e o `check-rls` confirmou zero
  linhas em produção. Anonimizar IP ali é discussão sem objeto.
- **`security_events` e `download_logs` guardam IP por legítimo interesse** (fraude e abuso de
  conteúdo pago). Anonimizar degrada exatamente o propósito declarado. `admin/login.js` já
  fingerprinta o IP no challenge token. Não mexi: é decisão de política, não defeito.

### O achado que apareceu no lugar

**`analytics_events.customer_email` era escrito por dois handlers e lido por nenhum.** O único
leitor da tabela é `handlers/admin/funnel.js`, que seleciona `event_name, session_id, created_at`.

Duas consequências, e a segunda é a grave: era PII retida sem consumidor, e **sobrevivia à exclusão
de conta**. `orders.customer_email` é anonimizado no fluxo do art. 18; a cópia no analytics ficava
até a purga de 180 dias levá-la. O e-mail de quem pediu para ser esquecido continuava gravado num
lugar que ninguém lembrava de olhar — a mesma família do achado de `abandoned_carts` em 01/09, que
eu tinha deixado passar.

Agora a coluna não é mais escrita (com o porquê no cabeçalho de `lib/analytics-events.js`, para
ninguém reintroduzir) e a exclusão limpa as linhas antigas em vez de esperar 180 dias. O vínculo
analítico não se perde: `order_id` continua apontando para o pedido, que **é** anonimizado.

> **Fica proposto, não feito:** dropar a coluna. É migration destrutiva, e com a escrita cortada ela
> já é inerte — a purga de 180 dias esvazia o que sobrou. Vale fazer depois de um ciclo.

---

## 4. Acesso e portabilidade (art. 18, V)

O direito de exclusão existia; o de acesso não. `GET /api/me-export-data` devolve pedidos (com itens
e metadados de download), inscrição na newsletter e carrinhos abandonados. O botão **Baixar meus
dados** fica na página da conta, **antes** do de excluir — ver antes de apagar é a ordem natural.

Decisões que ficaram escritas no código:

- **Âncora em `customer_id = uid`**, confirmado contra `auth.users` com `email_confirmed_at`. O
  handler usa `serviceRoleHelpers` e bypassa RLS: um erro de filtro ali não é bug de tela, é
  vazamento em massa. Por isso a suíte tem sempre **duas clientes** e toda asserção positiva vem com
  a negativa ao lado.
- **O valor do token de download não entra.** Não é dado pessoal da titular — é credencial de uso
  único que abre o arquivo pago. Um JSON exportado circula por e-mail e Drive. Vão produto, validade
  e se já foi usado; o link segue em `/downloads`.
- **Analytics e `page_views` ficam de fora** porque são chaveados por sessão do navegador: devolver
  "os eventos dela" exigiria primeiro **criar** essa ligação, ou seja, produzir dado pessoal novo
  para cumprir um pedido de acesso.
- **O que ficou de fora vai dentro do arquivo**, no campo `naoIncluido`. Export silencioso sobre as
  próprias omissões é pior que export honesto sobre elas.
- **O arquivo é montado no navegador** a partir da resposta: o backend não gera anexo, não guarda
  cópia e nada sai por e-mail.

A política de privacidade deixou de mandar todo mundo escrever para o contato: agora lista os três
direitos que a pessoa exerce sozinha, com o caminho de cada um.

---

## 5. `AnalysisTab` — a sequência de novo, e de novo funcionou

Caracterização primeiro (6 casos: as três consultas em paralelo com períodos padrão diferentes por
desenho, o comportamento de erro, os resumos das curvas, as respostas vazias), extração depois,
**676 → 561 linhas**, e os 6 continuam verdes sem alteração.

O que saiu não era interface: eram textos (as explicações de cada gráfico, que são material
editorial), tabelas de estilo por classe e a escala de cor do heatmap. Misturado ao componente, isso
cobrava dos dois lados — quem ia ajustar uma frase abria um arquivo de 676 linhas com três
`useState` e um `Promise.all`; quem ia mexer no comportamento rolava por 76 linhas de texto corrido.

`analysis-content.test.js` trava a **forma**, não o texto: mudar uma frase não pode quebrar o CI, mas
uma chave sem `how` renderiza seção vazia no modal, sem erro no console. E cobre `cellTone`, a única
lógica: as seis fronteiras (onde um `>` no lugar de `>=` se esconde), a distinção entre "voltou
pouco" e "não voltou", e a monotonicidade.

### Estado dos arquivos grandes

| Arquivo             | Início da rodada |    Hoje | Testes |
| ------------------- | ---------------: | ------: | -----: |
| `ProductWizard.jsx` |              883 | **792** |     22 |
| `DashboardTab.jsx`  |              819 | **757** |     39 |
| `AnalysisTab.jsx`   |              676 | **561** |     18 |

Nenhum dos três foi "quebrado em componentes". O que saiu de cada um foi a parte **sem JSX** —
regras de dados, matemática, conteúdo — que é onde o teste tem retorno e o risco de mover é
mensurável. Dividir a árvore de componentes continua possível e agora é barato: existe rede.

---

## O que continua em aberto

| Item                                                    | Bloqueio                                   |
| ------------------------------------------------------- | ------------------------------------------ |
| `supabase db push` da migration de retenção             | Escrita em produção — decisão sua          |
| Funções, `pg_cron`, triggers e índices                  | Precisa do SQL Editor ou de `SUPABASE_PAT` |
| `admin_audit_log` vazio                                 | Precisa de um teste operacional (ver §1)   |
| Drop de `analytics_events.customer_email`               | Migration destrutiva; a coluna já é inerte |
| Anonimização de IP em `security_events`/`download_logs` | Decisão de política, não defeito           |
| Os 12 `set-state-in-effect`                             | Cada um muda comportamento                 |
