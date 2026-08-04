-- ════════════════════════════════════════════════════════════════════
-- Perf — índices para as consultas quentes do painel/cron
--
-- Todos com `create index if not exists` (idempotente). Nenhum recria
-- índice já presente no schema.sql; estes cobrem padrões de acesso
-- compostos/funcionais que hoje caem em seq scan ou index scan parcial.
--
-- Colunas conferidas contra supabase/schema.sql e a migration
-- 20260528000000_phase3_email_marketing.sql (email_sent_log).
-- ════════════════════════════════════════════════════════════════════

-- Listagem de pedidos aprovados ordenados por data de conclusão + relatórios
-- de receita (api/admin-orders.js, api/admin-dashboard.js): filtra por
-- payment_status = 'approved' e ordena por completed_at desc.
create index if not exists orders_payment_status_completed_at_idx
  on public.orders (payment_status, completed_at desc);

-- Pedidos mais recentes / séries temporais do dashboard e histórico do
-- cliente (api/admin-dashboard.js, api/customer-orders.js): ordena por
-- created_at desc.
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

-- Busca de pedidos pelo e-mail normalizado do cliente
-- (api/customer-orders.js e vínculo pedido→conta): casamento por
-- lower(customer_email). Índice funcional complementa o orders_customer_email_idx
-- (que é case-sensitive).
create index if not exists orders_lower_customer_email_idx
  on public.orders (lower(customer_email));

-- Idempotência do cron de e-mail (api/cron-email-jobs.js): checagem
-- "já enviei este kind para este email/entidade?" por (email, kind, entity_id).
-- Complementa o email_sent_log_dedup_idx (que é sobre lower(email)) para
-- lookups que usam o email cru.
create index if not exists email_sent_log_email_kind_entity_idx
  on public.email_sent_log (email, kind, entity_id);

-- Varredura de carrinhos abandonados por janela de tempo
-- (api/cron-email-jobs.js firstCandidates / api/abandoned-cart.js): filtra e
-- ordena por updated_at para achar carrinhos elegíveis a lembrete.
create index if not exists abandoned_carts_updated_at_idx
  on public.abandoned_carts (updated_at);
