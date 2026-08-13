-- ════════════════════════════════════════════════════════════════════
-- Agregação de "mais vendidos" no banco (achado M7)
--
-- PROBLEMA: /api/products, /api/home-sections e /api/cross-sell são públicos,
-- sem autenticação, e a cada requisição não-cacheada baixavam `orders` e
-- `order_items` INTEIRAS com service role — sem `limit` e sem janela temporal —
-- só para somar quantidade por produto. Nenhum PII saía no corpo da resposta,
-- mas é amplificação pura: um hit anônimo de ~200 bytes obrigava o backend a
-- puxar a base de pedidos inteira do Postgres para a função serverless, e o
-- custo cresce linearmente com o histórico de vendas. Quem quisesse derrubar a
-- vitrine só precisava furar o cache de borda (querystring aleatória).
--
-- SOLUÇÃO: a soma pertence ao banco. Esta função devolve no máximo p_limit
-- linhas (product_id, sold_count) já agregadas, dentro de uma janela temporal.
-- O tráfego entre a lambda e o Postgres passa a ser proporcional ao número de
-- PRODUTOS (dezenas), não ao número de itens vendidos (ilimitado).
--
-- JANELA TEMPORAL: `sold_count` não é exibido em lugar nenhum do front — é
-- usado apenas para ORDENAR ("mais vendidos", src/hooks/useProductFilters.js:25
-- e a seção best_sellers da home). Restringir a janela portanto não muda o que
-- o usuário vê de forma relevante; se muda, muda para melhor (um campeão de
-- vendas de 3 anos atrás deixa de travar a primeira posição para sempre).
--
-- FALLBACK: lib/sales-counts.js continua funcionando se esta migration ainda
-- não tiver sido aplicada — cai numa varredura com `limit` explícito e a mesma
-- janela. Ou seja, aplicar esta migration é uma otimização, não um pré-requisito
-- para o deploy do código.
--
-- Idempotente: pode rodar múltiplas vezes sem efeito colateral.
-- ════════════════════════════════════════════════════════════════════


-- ─── 1. Índice de apoio ──────────────────────────────────────────────
-- O filtro da função é (payment_status = 'approved' and created_at >= …).
-- O índice existente orders_payment_status_completed_at_idx
-- (20260703000000_perf_indexes.sql) é sobre completed_at, que é NULL enquanto o
-- pedido não fecha — não serve para esta janela. order_items já tem
-- order_items_order_id_idx e order_items_product_id_idx (supabase/schema.sql).
create index if not exists orders_payment_status_created_at_idx
  on public.orders (payment_status, created_at desc);


-- ─── 2. Função de agregação ──────────────────────────────────────────
-- `drop function` antes do create: `create or replace` não consegue mudar o
-- tipo de retorno, então uma evolução futura da assinatura quebraria o push.
-- Mesmo padrão de public.rate_limit_hit (20260813000000_rate_limit.sql).
drop function if exists public.product_sales_counts(timestamptz, int);

create function public.product_sales_counts(
  p_since timestamptz default null,
  p_limit int default 500
)
returns table (
  product_id uuid,
  sold_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    oi.product_id,
    sum(greatest(coalesce(oi.quantity, 0), 0))::bigint as sold_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'approved'
    and (p_since is null or o.created_at >= p_since)
  group by oi.product_id
  -- `order by 2` (posição no select) em vez de `order by sold_count`: o rótulo
  -- sold_count também é o nome de uma coluna de RETURNS TABLE, e referência
  -- não qualificada a esse nome dentro do corpo é justamente o caso ambíguo
  -- entre coluna e parâmetro de saída. Por ordinal não há como confundir.
  order by 2 desc
  -- Teto DENTRO da função: o parâmetro vem do backend, mas a função é
  -- SECURITY DEFINER — entrada é tratada como não confiável por regra, do mesmo
  -- jeito que em public.rate_limit_hit.
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

comment on function public.product_sales_counts(timestamptz, int) is
  'Soma a quantidade vendida por produto em pedidos aprovados desde p_since (NULL = sempre), no máximo p_limit linhas. Alimenta a ordenação "mais vendidos" de /api/products e /api/home-sections via lib/sales-counts.js. Service role only.';

-- Só o backend agrega. Exposta a anon, esta função vira um relatório de vendas
-- público (quanto cada produto vendeu) — informação comercial que hoje não sai
-- em nenhuma resposta da API, e que não deve passar a sair por aqui.
revoke execute on function public.product_sales_counts(timestamptz, int) from public, anon, authenticated;
grant  execute on function public.product_sales_counts(timestamptz, int) to service_role;


-- Recarrega o cache de schema do PostgREST. Sem isto, a primeira chamada a
-- /rest/v1/rpc/product_sales_counts responde 404 até o Supabase recarregar
-- sozinho — e lib/sales-counts.js trataria isso como "migration não aplicada",
-- caindo no fallback de varredura sem necessidade.
notify pgrst, 'reload schema';
