-- ════════════════════════════════════════════════════════════════════
-- Índice em orders(customer_id)
--
-- PROBLEMA: a rodada de hardening (20260812000000) moveu a autorização de
-- pedidos de `customer_email` para `customer_id = auth.uid()` — corrigindo o
-- IDOR em que um `ilike` com `_` fazia `ana_lima@x.com` casar o pedido de
-- `ana.lima@x.com`. A âncora nova está certa, mas ficou SEM ÍNDICE: o Postgres
-- não indexa coluna de chave estrangeira automaticamente, e o schema só tem
-- índice em `customer_email` (supabase/schema.sql). Passaram a fazer seq scan
-- em `public.orders`:
--   • a política RLS `orders_select_own` (customer_id = auth.uid());
--   • api/customer-orders.js — toda abertura da área de downloads, mais a
--     releitura após a adoção de pedidos órfãos de convidado;
--   • api/me-delete-account.js — anonimização na exclusão de conta (LGPD).
-- É caminho por requisição de usuário logado, e o custo cresce linearmente com
-- o histórico de vendas: hoje é imperceptível e degrada sozinho com o sucesso
-- da loja, que é o tipo de problema que só aparece quando dói.
--
-- PARCIAL (`where customer_id is not null`): todo pedido de convidado nasce com
-- `customer_id` nulo e só é adotado quando aquele e-mail cria conta, então a
-- coluna é esparsa por construção. Nenhuma das consultas acima procura por
-- nulo — elas sempre filtram por um uid concreto —, então as linhas nulas só
-- inchariam o índice sem nunca serem lidas por ele.
--
-- CONCURRENTLY não é usado de propósito: `supabase db push` roda a migration
-- dentro de uma transação, e CREATE INDEX CONCURRENTLY não pode rodar em
-- transação. A tabela é pequena (o lock de escrita dura milissegundos nesta
-- escala); se um dia `orders` crescer a ponto de o lock incomodar, crie o
-- índice à mão fora da transação, com CONCURRENTLY.
-- ════════════════════════════════════════════════════════════════════

create index if not exists orders_customer_id_idx
  on public.orders (customer_id)
  where customer_id is not null;

-- ── Verificação (rodar no SQL Editor após o push) ───────────────────
-- Deve listar orders_customer_id_idx:
--   select indexname from pg_indexes
--    where schemaname = 'public' and tablename = 'orders';
--
-- E o plano de um SELECT por dono deve deixar de ser Seq Scan:
--   explain select id from public.orders
--    where customer_id = '00000000-0000-0000-0000-000000000000';
